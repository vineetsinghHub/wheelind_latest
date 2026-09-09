from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_admin, log_action
from lib.db import db
from lib.rbac import require
from models.schemas import (
    AdminUser, LedgerEntry, RefundRequest, Ride, RideList, RideStateUpdate, RIDE_STATES, utcnow,
)

router = APIRouter(tags=["rides"])

TERMINAL = {"completed", "cancelled", "expired"}


@router.get("/rides", response_model=RideList)
async def list_rides(
    state: Optional[str] = None,
    category: Optional[str] = None,
    payment_status: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 50,
    skip: int = 0,
    _: AdminUser = Depends(current_admin),
):
    query: dict = {}
    if state:
        query["state"] = state
    if category:
        query["category"] = category
    if payment_status:
        query["payment_status"] = payment_status
    if q:
        query["$or"] = [
            {"code": {"$regex": q, "$options": "i"}},
            {"rider_name": {"$regex": q, "$options": "i"}},
            {"driver_name": {"$regex": q, "$options": "i"}},
        ]
    total = await db.rides.count_documents(query)
    docs = await db.rides.find(query).sort("created_at", -1).skip(skip).limit(min(limit, 200)).to_list(200)
    return RideList(items=[Ride(**d) for d in docs], total=total)


@router.get("/rides/{ride_id}", response_model=Ride)
async def get_ride(ride_id: str, _: AdminUser = Depends(current_admin)):
    doc = await db.rides.find_one({"id": ride_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Ride not found")
    return Ride(**doc)


@router.patch("/rides/{ride_id}/state", response_model=Ride)
async def update_state(ride_id: str, payload: RideStateUpdate, admin: AdminUser = Depends(require("rides.write"))):
    if payload.state not in RIDE_STATES:
        raise HTTPException(status_code=422, detail=f"Unknown ride state '{payload.state}'")
    doc = await db.rides.find_one({"id": ride_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Ride not found")
    if doc["state"] in TERMINAL and payload.state not in ("disputed", "completed"):
        raise HTTPException(status_code=409, detail=f"Ride is {doc['state']}; only a dispute can be opened")
    if payload.state == "in_progress" and not doc.get("otp_verified"):
        raise HTTPException(status_code=409, detail="OTP not verified — trip start is blocked")
    update = {"state": payload.state}
    if payload.state == "cancelled":
        update["cancellation_reason"] = payload.reason or "Cancelled by admin"
    await db.rides.update_one({"id": ride_id}, {"$set": update})
    await log_action(admin, "ride_state_change", "ride", ride_id, {"from": doc["state"], "to": payload.state})
    return Ride(**(await db.rides.find_one({"id": ride_id})))


@router.post("/rides/{ride_id}/refund", response_model=Ride)
async def refund_ride(ride_id: str, payload: RefundRequest, admin: AdminUser = Depends(require("refunds.write"))):
    doc = await db.rides.find_one({"id": ride_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Ride not found")
    if payload.amount <= 0:
        raise HTTPException(status_code=422, detail="Refund amount must be positive")
    total = float(doc.get("fare", {}).get("total", 0))
    if payload.amount > total:
        raise HTTPException(status_code=409, detail="Refund exceeds ride fare")

    rider = await db.riders.find_one({"id": doc["rider_id"]})
    new_balance = float(rider.get("wallet_balance", 0)) + payload.amount if rider else payload.amount
    if rider:
        await db.riders.update_one({"id": rider["id"]}, {"$set": {"wallet_balance": new_balance}})
    entry = LedgerEntry(
        owner_type="rider",
        owner_id=doc["rider_id"],
        owner_name=doc["rider_name"],
        entry_type="credit",
        pool="user_funded",
        amount=payload.amount,
        balance_after=round(new_balance, 2),
        reason=f"Refund — {payload.reason}",
        ref_id=doc["code"],
        created_at=utcnow(),
    )
    await db.ledger.insert_one(entry.model_dump())
    await db.rides.update_one({"id": ride_id}, {"$set": {"payment_status": "refunded"}})
    await log_action(admin, "ride_refund", "ride", ride_id, {"amount": payload.amount, "reason": payload.reason})
    return Ride(**(await db.rides.find_one({"id": ride_id})))
