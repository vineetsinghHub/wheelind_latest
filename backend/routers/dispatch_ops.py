"""Admin dispatch console + the sweep that keeps transient dispatch state honest."""

from fastapi import APIRouter, Depends, HTTPException, Query

from lib import dispatch
from lib.auth import current_admin, log_action
from lib.db import db
from lib.rbac import require
from models.ops import DispatchBoard, DispatchOffer, SweepResult
from models.schemas import AdminUser, utcnow

router = APIRouter(tags=["dispatch-ops"])


def _aware(dt):
    return dt if getattr(dt, "tzinfo", None) else dt.replace(tzinfo=utcnow().tzinfo)


def _offer(doc: dict) -> DispatchOffer:
    return DispatchOffer(
        id=doc["id"], ride_id=doc["ride_id"], ride_code=doc["ride_code"],
        driver_id=doc["driver_id"], driver_name=doc.get("driver_name", "Partner"),
        state=doc["state"], distance_m=float(doc.get("distance_m", 0)),
        fare_total=float(doc.get("fare_total", 0)),
        created_at=_aware(doc["created_at"]), expires_at=_aware(doc["expires_at"]),
        decline_reason=doc.get("decline_reason"),
    )


@router.get("/dispatch/board", response_model=DispatchBoard)
async def board(_: AdminUser = Depends(current_admin), limit: int = Query(40, ge=1, le=200)):
    searching = await db.rides.find({"state": "searching"}).to_list(300)
    offers = await db.ride_offers.find({}).sort("created_at", -1).to_list(limit)
    online = await db.drivers.count_documents({"is_online": True})
    stale_after = utcnow() - __import__("datetime").timedelta(seconds=dispatch.HEARTBEAT_TTL_SEC)
    stale = await db.drivers.count_documents({"is_online": True, "last_heartbeat": {"$lte": stale_after}})
    waits = [(utcnow() - _aware(r["created_at"])).total_seconds() for r in searching]
    return DispatchBoard(
        searching_rides=len(searching),
        live_offers=await db.ride_offers.count_documents({"state": "offered", "expires_at": {"$gt": utcnow()}}),
        online_drivers=online,
        stale_presence=stale,
        avg_wait_sec=round(sum(waits) / len(waits), 1) if waits else 0.0,
        offers=[_offer(o) for o in offers],
    )


@router.get("/dispatch/offers", response_model=list[DispatchOffer])
async def offers_for_ride(ride_id: str, _: AdminUser = Depends(current_admin)):
    docs = await db.ride_offers.find({"ride_id": ride_id}).sort("created_at", -1).to_list(50)
    return [_offer(d) for d in docs]


@router.post("/dispatch/sweep", response_model=SweepResult)
async def run_sweep(_: AdminUser = Depends(current_admin)):
    """Manual trigger of the same work the cron does (offer/search/presence expiry)."""
    return SweepResult(**await dispatch.sweep())


@router.post("/dispatch/rides/{ride_id}/fan-out", response_model=list[DispatchOffer])
async def fan_out(ride_id: str, admin: AdminUser = Depends(require("rides.write"))):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["state"] != "searching":
        raise HTTPException(status_code=409, detail=f"Ride is {ride['state']} — nothing to offer")
    made = await dispatch.create_offers(ride)
    await log_action(admin, "dispatch_fan_out", "ride", ride_id, {"offers": len(made)})
    return [_offer(o) for o in made]


@router.post("/dispatch/rides/{ride_id}/assign-nearest", response_model=dict)
async def assign_nearest(ride_id: str, admin: AdminUser = Depends(require("rides.write"))):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    assigned = await dispatch.assign_nearest(ride)
    if not assigned:
        raise HTTPException(status_code=409, detail="No eligible partner is online near that pickup")
    await log_action(admin, "dispatch_manual_assign", "ride", ride_id, {"driver": assigned["driver_name"]})
    return {"ok": True, "driver_id": assigned["driver_id"], "driver_name": assigned["driver_name"]}
