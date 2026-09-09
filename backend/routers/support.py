"""Support cases, dispute resolution and the fraud review queue (§8, P2 backlog)."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import current_admin, log_action
from lib.db import db
from lib.earnings import apply_penalty
from lib.rbac import require
from models.ops import (
    CaseNote, FraudDecision, FraudFlag, SupportCase, SupportCaseCreate, SupportCaseList,
    SupportCaseUpdate, CaseMessage,
)
from models.schemas import AdminUser, LedgerEntry, utcnow

router = APIRouter(tags=["support"])


def _r(v) -> float:
    return round(float(v or 0) + 1e-9, 2)


async def open_case(
    *, kind: str, subject: str, detail: str, raised_by: str,
    ride: Optional[dict] = None, rider: Optional[dict] = None,
    driver: Optional[dict] = None, amount: float = 0.0,
) -> SupportCase:
    count = await db.support_cases.count_documents({})
    case = SupportCase(
        reference=f"WC{1000 + count + 1}",
        kind=kind, subject=subject, detail=detail, raised_by=raised_by,
        ride_id=(ride or {}).get("id"), ride_code=(ride or {}).get("code"),
        rider_id=(rider or {}).get("id") or (ride or {}).get("rider_id"),
        rider_name=(rider or {}).get("name") or (ride or {}).get("rider_name"),
        driver_id=(driver or {}).get("id") or (ride or {}).get("driver_id"),
        driver_name=(driver or {}).get("name") or (ride or {}).get("driver_name"),
        amount_claimed=_r(amount),
    )
    await db.support_cases.insert_one(case.model_dump())
    return case


# ---------------- cases ----------------
@router.get("/support/cases", response_model=SupportCaseList)
async def list_cases(
    status: Optional[str] = None,
    kind: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    _: AdminUser = Depends(current_admin),
):
    query: dict = {}
    if status:
        query["status"] = status
    if kind:
        query["kind"] = kind
    if q:
        query["$or"] = [
            {"reference": {"$regex": q, "$options": "i"}},
            {"ride_code": {"$regex": q, "$options": "i"}},
            {"rider_name": {"$regex": q, "$options": "i"}},
            {"driver_name": {"$regex": q, "$options": "i"}},
            {"subject": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.support_cases.find(query).sort("created_at", -1).to_list(min(limit, 200))
    for d in docs:
        d.pop("_id", None)
    return SupportCaseList(
        items=[SupportCase(**d) for d in docs],
        total=await db.support_cases.count_documents(query),
        open_count=await db.support_cases.count_documents({"status": {"$in": ["open", "in_review"]}}),
    )


@router.get("/support/cases/{case_id}", response_model=SupportCase)
async def get_case(case_id: str, _: AdminUser = Depends(current_admin)):
    doc = await db.support_cases.find_one({"id": case_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Case not found")
    doc.pop("_id", None)
    return SupportCase(**doc)


@router.post("/support/cases", response_model=SupportCase)
async def create_case(payload: SupportCaseCreate, admin: AdminUser = Depends(require("disputes.write"))):
    ride = await db.rides.find_one({"id": payload.ride_id}) if payload.ride_id else None
    if payload.ride_id and not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    case = await open_case(
        kind=payload.kind, subject=payload.subject, detail=payload.detail,
        raised_by="admin", ride=ride, amount=payload.amount_claimed,
    )
    await log_action(admin, "case_opened", "support_case", case.id, {"kind": case.kind})
    return case


@router.post("/support/cases/{case_id}/notes", response_model=SupportCase)
async def add_note(case_id: str, payload: CaseNote, admin: AdminUser = Depends(require("disputes.write"))):
    doc = await db.support_cases.find_one({"id": case_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Case not found")
    msg = CaseMessage(author=admin.name, author_role=admin.role, body=payload.body)
    await db.support_cases.update_one({"id": case_id}, {
        "$push": {"messages": msg.model_dump()},
        "$set": {"updated_at": utcnow()},
    })
    return await get_case(case_id, admin)


@router.patch("/support/cases/{case_id}", response_model=SupportCase)
async def resolve_case(
    case_id: str, payload: SupportCaseUpdate, admin: AdminUser = Depends(require("disputes.write"))
):
    """Resolution moves money: an optional rider refund and/or a partner penalty."""
    doc = await db.support_cases.find_one({"id": case_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Case not found")
    if doc["status"] in ("resolved", "rejected") and payload.status in ("resolved", "rejected"):
        raise HTTPException(status_code=409, detail="This case is already closed")

    if payload.refund_amount > 0:
        from lib.rbac import has_permission
        if not has_permission(admin.role, "refunds.write"):
            raise HTTPException(status_code=403, detail="Your role cannot issue refunds")
        rider = await db.riders.find_one({"id": doc.get("rider_id")})
        if not rider:
            raise HTTPException(status_code=409, detail="No rider on this case to refund")
        balance = _r(float(rider.get("wallet_balance", 0)) + payload.refund_amount)
        await db.riders.update_one({"id": rider["id"]}, {"$set": {"wallet_balance": balance}})
        await db.ledger.insert_one(LedgerEntry(
            owner_type="rider", owner_id=rider["id"], owner_name=rider["name"],
            entry_type="credit", pool="user_funded", amount=_r(payload.refund_amount),
            balance_after=balance, reason=f"Refund — case {doc['reference']}",
            ref_id=doc.get("ride_code"),
        ).model_dump())
        if doc.get("ride_id"):
            await db.rides.update_one({"id": doc["ride_id"]}, {"$set": {"payment_status": "refunded"}})

    if payload.penalty_amount > 0:
        driver = await db.drivers.find_one({"id": doc.get("driver_id")})
        if not driver:
            raise HTTPException(status_code=409, detail="No partner on this case to penalise")
        await apply_penalty(driver, payload.penalty_amount,
                            f"Penalty — case {doc['reference']}", doc.get("ride_code"))

    await db.support_cases.update_one({"id": case_id}, {"$set": {
        "status": payload.status,
        "resolution": payload.resolution,
        "refund_amount": _r(payload.refund_amount),
        "penalty_amount": _r(payload.penalty_amount),
        "assignee": payload.assignee or admin.name,
        "updated_at": utcnow(),
    }})
    await log_action(admin, "case_resolved", "support_case", case_id, {
        "status": payload.status, "refund": payload.refund_amount, "penalty": payload.penalty_amount,
    })
    return await get_case(case_id, admin)


# ---------------- fraud queue ----------------
@router.get("/fraud/flags", response_model=list[FraudFlag])
async def fraud_flags(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = Query(60, ge=1, le=200),
    _: AdminUser = Depends(current_admin),
):
    query: dict = {}
    if status:
        query["status"] = status
    if severity:
        query["severity"] = severity
    docs = await db.fraud_flags.find(query).sort("created_at", -1).to_list(limit)
    for d in docs:
        d.pop("_id", None)
    return [FraudFlag(**d) for d in docs]


@router.patch("/fraud/flags/{flag_id}", response_model=FraudFlag)
async def decide_flag(flag_id: str, payload: FraudDecision, admin: AdminUser = Depends(require("drivers.write"))):
    doc = await db.fraud_flags.find_one({"id": flag_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Flag not found")
    await db.fraud_flags.update_one({"id": flag_id}, {"$set": {
        "status": payload.status, "detail": f"{doc['detail']} · {payload.note}".strip(" ·"),
    }})
    if doc["entity_type"] == "driver":
        if payload.suspend:
            await db.drivers.update_one({"id": doc["entity_id"]}, {
                "$addToSet": {"flags": "suspended"}, "$set": {"is_online": False},
            })
        elif payload.status == "cleared":
            await db.drivers.update_one({"id": doc["entity_id"]}, {"$pull": {"flags": doc["kind"]}})
    await log_action(admin, "fraud_decision", "fraud_flag", flag_id, {
        "status": payload.status, "suspend": payload.suspend,
    })
    fresh = await db.fraud_flags.find_one({"id": flag_id})
    fresh.pop("_id", None)
    return FraudFlag(**fresh)
