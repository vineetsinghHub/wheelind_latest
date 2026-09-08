from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends

from lib.auth import current_admin
from lib.db import db
from models.schemas import (
    AdminUser, CategorySplit, DashboardStats, FleetDriver, FleetSnapshot, LiveTrip, SeriesPoint, utcnow,
)

router = APIRouter(tags=["dashboard"])

LIVE_STATES = ["searching", "driver_assigned", "driver_arriving", "waiting_at_pickup", "otp_pending", "in_progress"]


@router.get("/dashboard/stats", response_model=DashboardStats)
async def dashboard_stats(_: AdminUser = Depends(current_admin)):
    since = utcnow() - timedelta(hours=24)
    rides = await db.rides.find({}).to_list(5000)

    today = [r for r in rides if _aware(r.get("created_at")) >= since]
    completed = [r for r in today if r["state"] == "completed"]
    cancelled = [r for r in today if r["state"] in ("cancelled", "expired")]
    revenue = sum(float(r.get("fare", {}).get("total", 0)) for r in completed)

    hourly = defaultdict(int)
    for r in today:
        hourly[_aware(r["created_at"]).strftime("%H:00")] += 1
    hourly_points = [SeriesPoint(label=f"{h:02d}:00", value=hourly.get(f"{h:02d}:00", 0)) for h in range(24)]

    cat = defaultdict(lambda: {"rides": 0, "revenue": 0.0})
    for r in today:
        cat[r["category"]]["rides"] += 1
        if r["state"] == "completed":
            cat[r["category"]]["revenue"] += float(r.get("fare", {}).get("total", 0))
    splits = [CategorySplit(category=k, rides=v["rides"], revenue=round(v["revenue"], 2)) for k, v in cat.items()]
    splits.sort(key=lambda s: -s.rides)

    states = defaultdict(int)
    for r in today:
        states[r["state"]] += 1
    state_points = [SeriesPoint(label=k, value=v) for k, v in sorted(states.items(), key=lambda x: -x[1])]

    online = await db.drivers.count_documents({"is_online": True})
    approved = await db.drivers.count_documents({"kyc_status": "approved"})
    pending = await db.drivers.count_documents({"kyc_status": {"$in": ["pending", "action_required"]}})
    riders = await db.riders.count_documents({})
    sos = await db.sos_incidents.count_documents({"status": {"$in": ["open", "acknowledged", "escalated"]}})
    live = await db.rides.count_documents({"state": {"$in": LIVE_STATES}})

    n = max(len(today), 1)
    return DashboardStats(
        rides_today=len(today),
        revenue_today=round(revenue, 2),
        active_drivers=approved,
        online_drivers=online,
        total_riders=riders,
        completion_rate=round(len(completed) / n * 100, 1),
        cancellation_rate=round(len(cancelled) / n * 100, 1),
        open_sos=sos,
        pending_kyc=pending,
        live_rides=live,
        hourly_rides=hourly_points,
        category_split=splits,
        state_breakdown=state_points,
    )


@router.get("/fleet/live", response_model=FleetSnapshot)
async def fleet_live(_: AdminUser = Depends(current_admin)):
    docs = await db.drivers.find({"is_online": True}).to_list(500)
    drivers = [
        FleetDriver(
            id=d["id"], name=d["name"], category=d["category"], vehicle_number=d["vehicle_number"],
            zone=d["zone"], lat=d["lat"], lng=d["lng"], on_trip=d.get("on_trip", False), rating=d.get("rating", 4.7),
        )
        for d in docs
    ]
    trip_docs = await db.rides.find({"state": {"$in": LIVE_STATES}}).sort("created_at", -1).to_list(200)
    trips = [
        LiveTrip(
            id=t["id"], code=t["code"], state=t["state"], rider_name=t["rider_name"],
            driver_name=t.get("driver_name"), category=t["category"], pickup=t["pickup"], drop=t["drop"],
            lat=t.get("pickup_lat", 22.5726), lng=t.get("pickup_lng", 88.3639),
            fare_total=float(t.get("fare", {}).get("total", 0)),
        )
        for t in trip_docs
    ]
    return FleetSnapshot(
        drivers=drivers,
        live_trips=trips,
        online_count=len(drivers),
        on_trip_count=sum(1 for d in drivers if d.on_trip),
    )


def _aware(dt):
    from datetime import timezone
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt
