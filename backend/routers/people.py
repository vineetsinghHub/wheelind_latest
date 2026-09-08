from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_admin, log_action
from lib.db import db
from models.schemas import AdminUser, Driver, DriverOnlineUpdate, KycDecision, Rider, RiderStatusUpdate, utcnow

router = APIRouter(tags=["people"])


@router.get("/drivers", response_model=list[Driver])
async def list_drivers(
    kyc_status: Optional[str] = None,
    category: Optional[str] = None,
    online: Optional[bool] = None,
    q: Optional[str] = None,
    _: AdminUser = Depends(current_admin),
):
    query: dict = {}
    if kyc_status:
        query["kyc_status"] = kyc_status
    if category:
        query["category"] = category
    if online is not None:
        query["is_online"] = online
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"vehicle_number": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.drivers.find(query).sort("created_at", -1).to_list(500)
    return [Driver(**d) for d in docs]


@router.get("/drivers/{driver_id}", response_model=Driver)
async def get_driver(driver_id: str, _: AdminUser = Depends(current_admin)):
    doc = await db.drivers.find_one({"id": driver_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Driver not found")
    return Driver(**doc)


@router.patch("/drivers/{driver_id}/kyc", response_model=Driver)
async def decide_kyc(driver_id: str, payload: KycDecision, admin: AdminUser = Depends(current_admin)):
    doc = await db.drivers.find_one({"id": driver_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Driver not found")
    doc_status = "approved" if payload.status == "approved" else "rejected" if payload.status == "rejected" else "pending"
    documents = [{**d, "status": doc_status} for d in doc.get("documents", [])]
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"kyc_status": payload.status, "documents": documents}},
    )
    await log_action(admin, f"kyc_{payload.status}", "driver", driver_id, {"note": payload.note})
    updated = await db.drivers.find_one({"id": driver_id})
    return Driver(**updated)


@router.patch("/drivers/{driver_id}/online", response_model=Driver)
async def set_online(driver_id: str, payload: DriverOnlineUpdate, admin: AdminUser = Depends(current_admin)):
    doc = await db.drivers.find_one({"id": driver_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Driver not found")
    update = {"is_online": payload.is_online, "last_heartbeat": utcnow() if payload.is_online else None}
    if not payload.is_online:
        update["on_trip"] = False
    await db.drivers.update_one({"id": driver_id}, {"$set": update})
    await log_action(admin, "driver_availability", "driver", driver_id, {"is_online": payload.is_online})
    return Driver(**(await db.drivers.find_one({"id": driver_id})))


@router.get("/riders", response_model=list[Rider])
async def list_riders(q: Optional[str] = None, status: Optional[str] = None, _: AdminUser = Depends(current_admin)):
    query: dict = {}
    if status:
        query["status"] = status
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.riders.find(query).sort("created_at", -1).to_list(500)
    return [Rider(**d) for d in docs]


@router.patch("/riders/{rider_id}/status", response_model=Rider)
async def update_rider_status(rider_id: str, payload: RiderStatusUpdate, admin: AdminUser = Depends(current_admin)):
    doc = await db.riders.find_one({"id": rider_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Rider not found")
    await db.riders.update_one(
        {"id": rider_id}, {"$set": {"status": payload.status, "prepaid_only": payload.prepaid_only}}
    )
    await log_action(admin, "rider_status_change", "rider", rider_id, {"status": payload.status})
    return Rider(**(await db.riders.find_one({"id": rider_id})))
