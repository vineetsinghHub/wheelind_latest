"""Platform cron webhooks — the async worker tier (BullMQ's role in the target stack).

Each endpoint authenticates the shared secret, hands the work to a background task and
acks immediately; the dispatcher only reads the status line.
"""

import hmac
import logging
import os
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request

from lib import dispatch
from lib.db import db
from lib.kyc import expiry_status
from models.schemas import utcnow

router = APIRouter(prefix="/cron", tags=["cron"])
logger = logging.getLogger(__name__)


def _authorize(authorization: Optional[str]) -> None:
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not secret:
        raise HTTPException(status_code=401, detail="cron secret not configured")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="unauthorized")
    token = authorization.split(" ", 1)[1].strip()
    if not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="unauthorized")


async def _record(name: str, run_id: str, result: dict | None = None) -> bool:
    """Returns True when this run_id is new (idempotency key)."""
    existing = await db.cron_runs.find_one({"run_id": run_id, "job": name})
    if existing:
        return False
    await db.cron_runs.insert_one({
        "job": name, "run_id": run_id, "started_at": utcnow(), "result": result or {},
    })
    return True


async def _finish(name: str, run_id: str, result: dict) -> None:
    await db.cron_runs.update_one(
        {"job": name, "run_id": run_id}, {"$set": {"result": result, "finished_at": utcnow()}}
    )


# ---------------- dispatch sweep ----------------
async def _sweep_job(run_id: str) -> None:
    try:
        await _finish("dispatch-sweep", run_id, await dispatch.sweep())
    except Exception as exc:
        logger.error("dispatch sweep failed: %s", exc)


@router.post("/dispatch-sweep")
async def dispatch_sweep(
    request: Request, tasks: BackgroundTasks, authorization: Optional[str] = Header(default=None)
):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _authorize(authorization)
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = request.headers.get("x-webhook-id") or body.get("run_id") or str(utcnow().timestamp())
    if not await _record("dispatch-sweep", run_id):
        return {"ok": True, "duplicate": True}
    tasks.add_task(_sweep_job, run_id)
    return {"ok": True, "queued": True}


# ---------------- campaign lifecycle ----------------
async def _campaign_job(run_id: str) -> None:
    today = utcnow().strftime("%Y-%m-%d")
    activated = await db.campaigns.update_many(
        {"status": "draft", "starts_on": {"$lte": today}, "ends_on": {"$gte": today}},
        {"$set": {"status": "active"}},
    )
    expired = await db.campaigns.update_many(
        {"status": {"$in": ["active", "paused"]}, "ends_on": {"$lt": today}},
        {"$set": {"status": "expired"}},
    )
    passes = await db.driver_passes.update_many(
        {"status": "active", "expires_at": {"$lte": utcnow()}}, {"$set": {"status": "expired"}}
    )
    await _finish("campaign-lifecycle", run_id, {
        "activated": activated.modified_count,
        "expired": expired.modified_count,
        "passes_expired": passes.modified_count,
    })


@router.post("/campaign-lifecycle")
async def campaign_lifecycle(
    request: Request, tasks: BackgroundTasks, authorization: Optional[str] = Header(default=None)
):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _authorize(authorization)
    run_id = request.headers.get("x-webhook-id") or str(utcnow().timestamp())
    if not await _record("campaign-lifecycle", run_id):
        return {"ok": True, "duplicate": True}
    tasks.add_task(_campaign_job, run_id)
    return {"ok": True, "queued": True}


# ---------------- document expiry scan ----------------
async def _document_job(run_id: str) -> None:
    drivers = await db.drivers.find({"documents.expires_on": {"$ne": None}}).to_list(3000)
    expired_drivers = 0
    for d in drivers:
        statuses = [expiry_status(doc.get("expires_on")) for doc in d.get("documents", [])]
        if "expired" in statuses:
            expired_drivers += 1
            await db.drivers.update_one({"id": d["id"]}, {
                "$set": {"is_online": False, "kyc_status": "action_required",
                         "offline_reason": "document expired"},
                "$addToSet": {"flags": "document_expired"},
            })
    # Stale OTP challenges and finished offer waves don't need to linger.
    await db.ride_offers.delete_many({
        "state": {"$in": ["expired", "declined", "lost"]},
        "created_at": {"$lte": utcnow() - timedelta(days=3)},
    })
    await _finish("document-expiry", run_id, {"drivers_blocked": expired_drivers})


@router.post("/document-expiry")
async def document_expiry(
    request: Request, tasks: BackgroundTasks, authorization: Optional[str] = Header(default=None)
):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _authorize(authorization)
    run_id = request.headers.get("x-webhook-id") or str(utcnow().timestamp())
    if not await _record("document-expiry", run_id):
        return {"ok": True, "duplicate": True}
    tasks.add_task(_document_job, run_id)
    return {"ok": True, "queued": True}
