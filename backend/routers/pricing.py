from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import current_admin
from lib.db import db
from lib.pricing import quote_fare
from models.schemas import (
    AdminUser, FareBreakup, NearbyDriver, NearbySearch, QuoteRequest, QuoteResponse,
)

router = APIRouter(tags=["pricing-dispatch"])

# Rough Kolkata city speed by service, used to turn a road distance into an ETA.
AVG_SPEED_KMPH = {
    "bike": 22.0, "auto": 17.0, "cab": 18.0, "sedan": 19.0,
    "xl": 17.0, "rentals": 19.0, "outstation": 40.0, "parcel": 21.0,
}
DEFAULT_SPEED_KMPH = 18.0


@router.post("/pricing/quote", response_model=QuoteResponse)
async def pricing_quote(payload: QuoteRequest, _: AdminUser = Depends(current_admin)):
    """Price a trip against the live fare + commission config for that category."""
    config = await db.fare_configs.find_one({"category": payload.category})
    if not config:
        raise HTTPException(status_code=404, detail=f"No fare config for category '{payload.category}'")
    if not config.get("active", True):
        raise HTTPException(status_code=409, detail=f"Fare config for '{payload.category}' is inactive")

    surge_cap = float(config["surge_cap"])
    if payload.surge_multiplier > surge_cap:
        raise HTTPException(
            status_code=422,
            detail=f"Surge {payload.surge_multiplier}x exceeds the {surge_cap}x cap for {payload.category}",
        )

    commission_cfg = await db.commission_configs.find_one({"category": payload.category})
    commission_pct = float(commission_cfg["percentage"]) if commission_cfg else 0.0
    if commission_cfg and commission_cfg.get("promo_override_pct") is not None:
        commission_pct = float(commission_cfg["promo_override_pct"])

    result = quote_fare(
        config,
        commission_pct,
        distance_km=payload.distance_km,
        duration_min=payload.duration_min,
        waiting_min=payload.waiting_min,
        surge_multiplier=payload.surge_multiplier,
        rider_added_fare=payload.rider_added_fare,
        toll_parking=payload.toll_parking,
        discount=payload.discount,
        zero_commission=payload.zero_commission,
        night=payload.night,
    )
    return QuoteResponse(
        category=payload.category,
        breakup=FareBreakup(**result["breakup"]),
        surge_cap=surge_cap,
        **{k: v for k, v in result.items() if k != "breakup"},
    )


@router.get("/dispatch/nearby-drivers", response_model=NearbySearch)
async def nearby_drivers(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(5.0, gt=0, le=50),
    category: str | None = None,
    limit: int = Query(15, gt=0, le=50),
    include_on_trip: bool = False,
    _: AdminUser = Depends(current_admin),
):
    """Nearest eligible drivers via a Mongo 2dsphere $geoNear, closest first.

    Eligibility mirrors dispatch rules: KYC-approved, online, and (by default) not already
    on a trip. Offline drivers can never surface here.
    """
    match: dict = {"kyc_status": "approved", "is_online": True}
    if category:
        match["category"] = category
    if not include_on_trip:
        match["on_trip"] = False

    pipeline = [
        {
            "$geoNear": {
                "near": {"type": "Point", "coordinates": [lng, lat]},
                "distanceField": "distance_m",
                "maxDistance": radius_km * 1000,
                "spherical": True,
                "query": match,
            }
        },
        {"$limit": limit},
    ]
    try:
        docs = await db.drivers.aggregate(pipeline).to_list(limit)
    except Exception as exc:  # missing 2dsphere index or un-backfilled location
        raise HTTPException(status_code=503, detail=f"Geospatial lookup unavailable: {exc}") from exc

    considered = await db.drivers.count_documents(match)

    drivers = []
    for d in docs:
        km = round(d["distance_m"] / 1000, 2)
        speed = AVG_SPEED_KMPH.get(d["category"], DEFAULT_SPEED_KMPH)
        drivers.append(NearbyDriver(
            id=d["id"], name=d["name"], phone=d["phone"], category=d["category"],
            vehicle_model=d["vehicle_model"], vehicle_number=d["vehicle_number"],
            zone=d["zone"], rating=d.get("rating", 4.7), lat=d["lat"], lng=d["lng"],
            distance_km=km, eta_min=max(1, round(km / speed * 60)),
            on_trip=d.get("on_trip", False), commission_model=d.get("commission_model", "commission"),
        ))

    return NearbySearch(
        pickup_lat=lat, pickup_lng=lng, radius_km=radius_km, category=category,
        eligible=len(drivers), considered=considered, drivers=drivers,
    )
