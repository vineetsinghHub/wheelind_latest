"""Rider-facing API. Separate session cookie from admin; shares one database."""

import random
import secrets
from datetime import timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response

from lib.db import db
from lib.places import PLACES, duration_min, haversine_km, road_distance_km, search_places
from lib.pricing import quote_fare
from lib.providers import maps_config, send_otp_sms
from models.rider import (
    BookRequest, CategoryEstimate, EstimateRequest, EstimateResponse, FareBumpRequest,
    MapsConfig, OtpChallenge, OtpRequest, OtpStartRequest, OtpVerify, Place, RateRequest,
    RechargeRequest, ReverseGeocode, RideWithDriver, RiderProfile, RiderPromo, RiderWallet,
    SosRequest, TripShare,
)
from models.schemas import FareBreakup, LedgerEntry, Ride, Rider, SosIncident, utcnow

router = APIRouter(prefix="/rider", tags=["rider"])

RIDER_COOKIE = "wl_rider"
SESSION_DAYS = 30
OTP_TTL_SEC = 300
SEARCH_TIMEOUT_SEC = 180  # §8.1 — no infinite search

CATEGORY_META = {
    "bike": ("Bike", 1), "auto": ("Auto", 3), "cab": ("Cab", 4), "sedan": ("Sedan", 4),
    "xl": ("XL", 6), "rentals": ("Rentals", 4), "outstation": ("Outstation", 4), "parcel": ("Parcel", 1),
}
LIVE_STATES = ["searching", "driver_assigned", "driver_arriving", "waiting_at_pickup", "otp_pending", "in_progress"]


def _aware(dt):
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


async def current_rider(wl_rider: Optional[str] = Cookie(default=None)) -> Rider:
    if not wl_rider:
        raise HTTPException(status_code=401, detail="Please sign in to continue")
    session = await db.rider_sessions.find_one({"token": wl_rider})
    if not session:
        raise HTTPException(status_code=401, detail="Session expired, please sign in again")
    doc = await db.riders.find_one({"id": session["rider_id"]})
    if not doc:
        raise HTTPException(status_code=401, detail="Account not found")
    if doc.get("status") == "blocked":
        raise HTTPException(status_code=403, detail="This account has been blocked. Contact support.")
    doc.pop("_id", None)
    return Rider(**doc)


# ---------------- auth ----------------
@router.post("/auth/request-otp", response_model=OtpChallenge)
async def request_otp(payload: OtpRequest):
    phone = payload.phone.strip()
    if not phone.replace("+", "").isdigit():
        raise HTTPException(status_code=422, detail="Enter a valid mobile number")
    existing = await db.riders.find_one({"phone": {"$regex": f"{phone[-10:]}$"}})
    otp = f"{random.randint(1000, 9999)}"
    await db.rider_otps.delete_many({"phone": phone})
    await db.rider_otps.insert_one({
        "phone": phone, "otp": otp,
        "expires_at": utcnow() + timedelta(seconds=OTP_TTL_SEC),
    })
    sent = await send_otp_sms(phone, otp)
    return OtpChallenge(
        phone=phone,
        # Only surfaced while no SMS gateway is configured.
        otp_hint=otp if sent["expose_otp"] else "",
        expires_in_sec=OTP_TTL_SEC,
        is_new_user=existing is None,
    )


@router.get("/maps-config", response_model=MapsConfig)
async def get_maps_config():
    """Frontend reads its tile source/provider from here — no keys hardcoded in the client."""
    return MapsConfig(**maps_config())


@router.get("/reverse-geocode", response_model=ReverseGeocode)
async def reverse_geocode(lat: float = Query(...), lng: float = Query(...)):
    """Resolve a GPS fix to the nearest known place.

    With OLA_MAPS_API_KEY / MAPPLS_REST_KEY set this should call the vendor's reverse-geocode
    endpoint; until then it snaps to the nearest entry in the curated Kolkata list.
    """
    best = min(PLACES, key=lambda p: haversine_km(lat, lng, p[2], p[3]))
    name, area, plat, plng = best
    return ReverseGeocode(
        name=name, area=area, lat=plat, lng=plng, label=f"{name}, {area}",
        distance_km=round(haversine_km(lat, lng, plat, plng), 2),
    )


@router.post("/auth/verify", response_model=Rider)
async def verify_otp(payload: OtpVerify, response: Response):
    phone = payload.phone.strip()
    challenge = await db.rider_otps.find_one({"phone": phone})
    if not challenge:
        raise HTTPException(status_code=422, detail="Request a fresh OTP")
    if _aware(challenge["expires_at"]) < utcnow():
        raise HTTPException(status_code=422, detail="That OTP has expired")
    # No SMS provider is wired up, so any 4-digit code is accepted in this build.
    if not payload.otp.isdigit() or len(payload.otp) != 4:
        raise HTTPException(status_code=422, detail="Enter the 4-digit code")

    doc = await db.riders.find_one({"phone": {"$regex": f"{phone[-10:]}$"}})
    if not doc:
        rider = Rider(name=(payload.name or "Wheelind Rider").strip(), phone=phone, wallet_balance=0.0)
        await db.riders.insert_one(rider.model_dump())
        doc = await db.riders.find_one({"id": rider.id})
    await db.rider_otps.delete_many({"phone": phone})

    token = secrets.token_urlsafe(32)
    await db.rider_sessions.insert_one({
        "token": token, "rider_id": doc["id"],
        "expires_at": utcnow() + timedelta(days=SESSION_DAYS),
    })
    response.set_cookie(RIDER_COOKIE, token, httponly=True, samesite="lax",
                        max_age=SESSION_DAYS * 86400, path="/")
    doc.pop("_id", None)
    return Rider(**doc)


@router.get("/me", response_model=RiderProfile)
async def me(rider: Rider = Depends(current_rider)):
    rides = await db.rides.find({"rider_id": rider.id, "state": "completed"}).to_list(500)
    return RiderProfile(
        rider=rider,
        total_spent=round(sum(float(r.get("fare", {}).get("total", 0)) for r in rides), 2),
        completed_rides=len(rides),
    )


@router.post("/auth/logout")
async def logout(response: Response, wl_rider: Optional[str] = Cookie(default=None)):
    if wl_rider:
        await db.rider_sessions.delete_one({"token": wl_rider})
    response.delete_cookie(RIDER_COOKIE, path="/")
    return {"ok": True}


# ---------------- places & estimate ----------------
@router.get("/places", response_model=list[Place])
async def places(q: str = "", limit: int = Query(8, ge=1, le=20)):
    return [Place(**p) for p in search_places(q, limit)]


@router.post("/estimate", response_model=EstimateResponse)
async def estimate(payload: EstimateRequest):
    """Public — riders price a trip before signing in; sign-in is enforced at booking."""
    distance = road_distance_km(payload.pickup_lat, payload.pickup_lng, payload.drop_lat, payload.drop_lng)
    if distance <= 0:
        raise HTTPException(status_code=422, detail="Pickup and drop cannot be the same place")

    flags = {f["key"]: f["enabled"] for f in await db.feature_flags.find({"scope": "category"}).to_list(50)}
    options: list[CategoryEstimate] = []

    for cfg in await db.fare_configs.find({}).to_list(50):
        cat = cfg["category"]
        label, seats = CATEGORY_META.get(cat, (cat.title(), 4))
        enabled = flags.get(f"category.{cat}", True)
        mins = duration_min(distance, cat)

        # Live supply within 6 km drives ETA and surge.
        try:
            nearby = await db.drivers.aggregate([
                {"$geoNear": {
                    "near": {"type": "Point", "coordinates": [payload.pickup_lng, payload.pickup_lat]},
                    "distanceField": "d", "maxDistance": 6000, "spherical": True,
                    "query": {"kyc_status": "approved", "is_online": True, "on_trip": False, "category": cat},
                }},
                {"$limit": 10},
            ]).to_list(10)
        except Exception:
            nearby = []

        surge = 1.0
        if enabled and len(nearby) == 0:
            surge = min(float(cfg["surge_cap"]), 1.5)
        elif len(nearby) == 1:
            surge = min(float(cfg["surge_cap"]), 1.2)

        comm = await db.commission_configs.find_one({"category": cat})
        q = quote_fare(cfg, float(comm["percentage"]) if comm else 0.0,
                       distance_km=distance, duration_min=mins, surge_multiplier=surge)

        eta = None
        if nearby:
            km = round(nearby[0]["d"] / 1000, 2)
            eta = max(1, round(km / 18.0 * 60))

        options.append(CategoryEstimate(
            category=cat, label=label, seats=seats,
            total=q["breakup"]["total"], breakup=FareBreakup(**q["breakup"]),
            distance_km=distance, duration_min=mins, eta_min=eta,
            nearby_drivers=len(nearby), surge_multiplier=surge,
            available=enabled,
            unavailable_reason=None if enabled else "Not available in your city yet",
        ))

    order = list(CATEGORY_META)
    options.sort(key=lambda o: order.index(o.category) if o.category in order else 99)
    return EstimateResponse(distance_km=distance, options=options)


# ---------------- booking ----------------
@router.post("/rides", response_model=Ride)
async def book_ride(payload: BookRequest, rider: Rider = Depends(current_rider)):
    if rider.status == "restricted" and payload.payment_method == "cash":
        raise HTTPException(status_code=403, detail="Cash is disabled on your account. Please prepay.")
    if rider.prepaid_only and payload.payment_method == "cash":
        raise HTTPException(status_code=403, detail="Your account is prepaid-only. Choose UPI, card or wallet.")

    active = await db.rides.find_one({"rider_id": rider.id, "state": {"$in": LIVE_STATES}})
    if active:
        raise HTTPException(status_code=409, detail=f"You already have a ride in progress ({active['code']})")
    cfg = await db.fare_configs.find_one({"category": payload.category})
    if not cfg:
        raise HTTPException(status_code=404, detail="That service is not configured")
    flag = await db.feature_flags.find_one({"key": f"category.{payload.category}"})
    if flag and not flag["enabled"]:
        raise HTTPException(status_code=409, detail=f"{payload.category.title()} is not available yet")

    distance = road_distance_km(payload.pickup_lat, payload.pickup_lng, payload.drop_lat, payload.drop_lng)
    mins = duration_min(distance, payload.category)

    discount = 0.0
    applied_promo = None
    if payload.promo_code:
        camp = await db.campaigns.find_one({
            "code": payload.promo_code.upper().strip(), "app": "rider", "status": "active",
        })
        if not camp:
            raise HTTPException(status_code=422, detail="That promo code is not valid right now")
        if camp.get("categories") and payload.category not in camp["categories"]:
            raise HTTPException(status_code=422, detail="This promo doesn't apply to the selected service")
        if float(camp.get("budget_used", 0)) >= float(camp["budget_cap"]):
            raise HTTPException(status_code=409, detail="This offer has run out of budget")
        applied_promo = camp

    comm = await db.commission_configs.find_one({"category": payload.category})
    base_q = quote_fare(cfg, float(comm["percentage"]) if comm else 0.0,
                        distance_km=distance, duration_min=mins,
                        rider_added_fare=payload.rider_added_fare)
    if applied_promo:
        gross = base_q["ride_fare_before_discount"]
        if applied_promo["discount_type"] == "percentage":
            discount = gross * float(applied_promo["value"]) / 100
            if applied_promo.get("max_discount"):
                discount = min(discount, float(applied_promo["max_discount"]))
        else:
            discount = float(applied_promo["value"])
        discount = round(min(discount, gross), 2)

    q = quote_fare(cfg, float(comm["percentage"]) if comm else 0.0,
                   distance_km=distance, duration_min=mins,
                   rider_added_fare=payload.rider_added_fare, discount=discount)

    if payload.payment_method == "wallet" and rider.wallet_balance < q["breakup"]["total"]:
        raise HTTPException(
            status_code=409,
            detail=f"Wallet balance ₹{rider.wallet_balance:.0f} is short of ₹{q['breakup']['total']:.0f}",
        )

    count = await db.rides.count_documents({})
    ride = Ride(
        code=f"WL{240000 + count + 1}",
        rider_id=rider.id, rider_name=rider.name,
        category=payload.category, state="searching",
        pickup=payload.pickup, drop=payload.drop,
        pickup_lat=payload.pickup_lat, pickup_lng=payload.pickup_lng,
        distance_km=distance, duration_min=mins,
        payment_method=payload.payment_method, payment_status="pending",
        otp=f"{random.randint(1000, 9999)}",
        fare=FareBreakup(**q["breakup"]),
        commission=q["commission"], driver_earning=0.0,
        surge_multiplier=1.0,
        drop_lat=payload.drop_lat, drop_lng=payload.drop_lng,
        promo_code=applied_promo["code"] if applied_promo else None,
        source="rider_app",
        scheduled_for=payload.scheduled_for,
    )
    # A scheduled trip parks in `draft` until its dispatch window opens.
    if payload.scheduled_for:
        if _aware(payload.scheduled_for) <= utcnow() + timedelta(minutes=4):
            raise HTTPException(status_code=422, detail="Schedule a ride at least 5 minutes ahead")
        ride.state = "draft"
    await db.rides.insert_one(ride.model_dump())

    if applied_promo:
        await db.campaigns.update_one({"id": applied_promo["id"]},
                                      {"$inc": {"budget_used": discount, "redemptions": 1}})
    return ride


async def _step_driver(doc: dict) -> dict:
    """Move the assigned driver a step toward its current target and persist it.

    Stands in for a real location heartbeat: en route to pickup before the trip starts,
    then toward the drop once in progress. Called on each rider poll.
    """
    if not doc.get("driver_id") or doc["state"] not in (
        "driver_assigned", "driver_arriving", "waiting_at_pickup", "otp_pending", "in_progress"
    ):
        return doc

    d = await db.drivers.find_one({"id": doc["driver_id"]})
    if not d:
        return doc

    cur_lat = doc.get("driver_lat") or d["lat"]
    cur_lng = doc.get("driver_lng") or d["lng"]
    if doc["state"] == "in_progress":
        tgt_lat = doc.get("drop_lat") or doc["pickup_lat"]
        tgt_lng = doc.get("drop_lng") or doc["pickup_lng"]
        step = 0.22
    else:
        tgt_lat, tgt_lng = doc["pickup_lat"], doc["pickup_lng"]
        step = 0.28

    new_lat = round(cur_lat + (tgt_lat - cur_lat) * step, 6)
    new_lng = round(cur_lng + (tgt_lng - cur_lng) * step, 6)

    await db.rides.update_one({"id": doc["id"]}, {"$set": {"driver_lat": new_lat, "driver_lng": new_lng}})
    await db.drivers.update_one({"id": d["id"]}, {"$set": {
        "lat": new_lat, "lng": new_lng,
        "location": {"type": "Point", "coordinates": [new_lng, new_lat]},
        "last_heartbeat": utcnow(),
    }})
    doc["driver_lat"], doc["driver_lng"] = new_lat, new_lng

    # Auto-advance to "arriving" once the driver is genuinely close.
    if doc["state"] == "driver_assigned" and haversine_km(new_lat, new_lng, tgt_lat, tgt_lng) < 0.6:
        await db.rides.update_one({"id": doc["id"]}, {"$set": {"state": "driver_arriving"}})
        doc["state"] = "driver_arriving"
    return doc


@router.post("/scheduled/dispatch-due", response_model=list[Ride])
async def dispatch_due(rider: Rider = Depends(current_rider)):
    """Release scheduled rides whose window has opened (within 5 minutes of pickup)."""
    due = await db.rides.find({
        "rider_id": rider.id, "state": "draft",
        "scheduled_for": {"$ne": None, "$lte": utcnow() + timedelta(minutes=5)},
    }).to_list(20)
    released = []
    for doc in due:
        await db.rides.update_one({"id": doc["id"]}, {"$set": {"state": "searching", "created_at": utcnow()}})
        fresh = await db.rides.find_one({"id": doc["id"]})
        fresh.pop("_id", None)
        released.append(Ride(**fresh))
    return released


@router.get("/scheduled", response_model=list[Ride])
async def scheduled_rides(rider: Rider = Depends(current_rider)):
    docs = await db.rides.find({
        "rider_id": rider.id, "state": "draft", "scheduled_for": {"$ne": None},
    }).sort("scheduled_for", 1).to_list(20)
    for d in docs:
        d.pop("_id", None)
    return [Ride(**d) for d in docs]


async def _load_ride(ride_id: str, rider: Rider) -> dict:
    doc = await db.rides.find_one({"id": ride_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Ride not found")
    if doc["rider_id"] != rider.id:
        raise HTTPException(status_code=403, detail="This ride belongs to another account")
    return doc


async def _hydrate(doc: dict) -> RideWithDriver:
    doc.pop("_id", None)
    extra: dict = {}
    if doc.get("driver_id"):
        d = await db.drivers.find_one({"id": doc["driver_id"]})
        if d:
            phone = d["phone"]
            extra = {
                "driver_lat": doc.get("driver_lat") or d["lat"],
                "driver_lng": doc.get("driver_lng") or d["lng"],
                "driver_phone": phone,
                "driver_rating": d.get("rating"), "vehicle_model": d["vehicle_model"],
                "vehicle_number": d["vehicle_number"],
                # Masked calling is not integrated; this is a display-only proxy number.
                "masked_driver_phone": f"+91 80 4718 {phone[-4:]}",
            }
    if doc["state"] == "searching":
        extra["seconds_searching"] = int((utcnow() - _aware(doc["created_at"])).total_seconds())
    return RideWithDriver(ride=Ride(**doc), **extra)


@router.get("/rides/active", response_model=Optional[RideWithDriver])
async def active_ride(rider: Rider = Depends(current_rider)):
    doc = await db.rides.find_one({"rider_id": rider.id, "state": {"$in": LIVE_STATES}})
    return await _hydrate(doc) if doc else None


@router.get("/rides", response_model=list[Ride])
async def ride_history(rider: Rider = Depends(current_rider), limit: int = Query(30, ge=1, le=100)):
    docs = await db.rides.find({"rider_id": rider.id}).sort("created_at", -1).to_list(limit)
    for d in docs:
        d.pop("_id", None)
    return [Ride(**d) for d in docs]


@router.get("/rides/{ride_id}", response_model=RideWithDriver)
async def ride_detail(ride_id: str, rider: Rider = Depends(current_rider)):
    doc = await _load_ride(ride_id, rider)
    return await _hydrate(await _step_driver(doc))


@router.post("/rides/{ride_id}/match", response_model=RideWithDriver)
async def match_ride(ride_id: str, rider: Rider = Depends(current_rider)):
    """Assign the nearest eligible driver. Expires the request past the search timeout."""
    doc = await _load_ride(ride_id, rider)
    if doc["state"] != "searching":
        return await _hydrate(doc)

    elapsed = (utcnow() - _aware(doc["created_at"])).total_seconds()
    if elapsed > SEARCH_TIMEOUT_SEC:
        await db.rides.update_one({"id": ride_id}, {"$set": {
            "state": "expired", "cancellation_reason": "No driver accepted within 3 minutes",
        }})
        return await _hydrate(await db.rides.find_one({"id": ride_id}))

    # Widen the radius as the wait grows, instead of searching forever.
    radius_m = 4000 if elapsed < 45 else 8000 if elapsed < 100 else 15000
    try:
        found = await db.drivers.aggregate([
            {"$geoNear": {
                "near": {"type": "Point", "coordinates": [doc["pickup_lng"], doc["pickup_lat"]]},
                "distanceField": "d", "maxDistance": radius_m, "spherical": True,
                "query": {"kyc_status": "approved", "is_online": True, "on_trip": False,
                          "category": doc["category"]},
            }},
            {"$limit": 1},
        ]).to_list(1)
    except Exception:
        found = []

    if not found:
        return await _hydrate(doc)

    d = found[0]
    await db.drivers.update_one({"id": d["id"]}, {"$set": {"on_trip": True}})
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "state": "driver_assigned", "driver_id": d["id"], "driver_name": d["name"],
    }})
    return await _hydrate(await db.rides.find_one({"id": ride_id}))


@router.post("/rides/{ride_id}/advance", response_model=RideWithDriver)
async def advance_ride(ride_id: str, rider: Rider = Depends(current_rider)):
    """Driver-side progress simulator (no driver app exists yet)."""
    doc = await _load_ride(ride_id, rider)
    flow = {
        "driver_assigned": "driver_arriving",
        "driver_arriving": "waiting_at_pickup",
        "waiting_at_pickup": "otp_pending",
    }
    nxt = flow.get(doc["state"])
    if not nxt:
        raise HTTPException(status_code=409, detail=f"Cannot advance a ride in state '{doc['state']}'")
    await db.rides.update_one({"id": ride_id}, {"$set": {"state": nxt}})
    return await _hydrate(await db.rides.find_one({"id": ride_id}))


@router.post("/rides/{ride_id}/start", response_model=RideWithDriver)
async def start_ride(ride_id: str, payload: OtpStartRequest, rider: Rider = Depends(current_rider)):
    """OTP gate — a trip cannot reach in_progress without the rider's 4-digit code."""
    doc = await _load_ride(ride_id, rider)
    if doc["state"] not in ("otp_pending", "waiting_at_pickup"):
        raise HTTPException(status_code=409, detail="The driver hasn't reached your pickup yet")
    if payload.otp.strip() != doc["otp"]:
        raise HTTPException(status_code=422, detail="Incorrect OTP — check the code in your app")
    await db.rides.update_one({"id": ride_id}, {"$set": {"state": "in_progress", "otp_verified": True}})
    return await _hydrate(await db.rides.find_one({"id": ride_id}))


@router.post("/rides/{ride_id}/increase-fare", response_model=RideWithDriver)
async def increase_fare(ride_id: str, payload: FareBumpRequest, rider: Rider = Depends(current_rider)):
    doc = await _load_ride(ride_id, rider)
    if doc["state"] not in ("searching", "expired"):
        raise HTTPException(status_code=409, detail="Fare can only be raised while searching")
    fare = dict(doc["fare"])
    fare["rider_added_fare"] = round(float(fare.get("rider_added_fare", 0)) + payload.amount, 2)
    fare["total"] = round(float(fare["total"]) + payload.amount, 2)
    update = {"fare": fare}
    if doc["state"] == "expired":  # retry after a timeout
        update.update({"state": "searching", "created_at": utcnow(), "cancellation_reason": None})
    await db.rides.update_one({"id": ride_id}, {"$set": update})
    return await _hydrate(await db.rides.find_one({"id": ride_id}))


@router.post("/rides/{ride_id}/cancel", response_model=RideWithDriver)
async def cancel_ride(ride_id: str, rider: Rider = Depends(current_rider)):
    doc = await _load_ride(ride_id, rider)
    if doc["state"] in ("completed", "cancelled", "expired"):
        raise HTTPException(status_code=409, detail="This ride is already closed")

    cfg = await db.fare_configs.find_one({"category": doc["category"]})
    # §8.2 — a cancellation after the driver arrives carries a fee.
    penalty = 0.0
    if doc["state"] in ("waiting_at_pickup", "otp_pending", "driver_arriving") and cfg:
        penalty = float(cfg["cancellation_charge"])

    if doc.get("driver_id"):
        await db.drivers.update_one({"id": doc["driver_id"]}, {"$set": {"on_trip": False}})
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "state": "cancelled",
        "cancellation_reason": f"Cancelled by rider (fee ₹{penalty:.0f})" if penalty else "Cancelled by rider",
        "payment_status": "pending" if penalty else "paid",
    }})

    if penalty:
        r = await db.riders.find_one({"id": rider.id})
        bal = round(float(r.get("wallet_balance", 0)) - penalty, 2)
        await db.riders.update_one({"id": rider.id}, {"$set": {"wallet_balance": bal}})
        await db.ledger.insert_one(LedgerEntry(
            owner_type="rider", owner_id=rider.id, owner_name=rider.name,
            entry_type="debit", pool="user_funded", amount=penalty, balance_after=bal,
            reason="Cancellation fee", ref_id=doc["code"],
        ).model_dump())
    return await _hydrate(await db.rides.find_one({"id": ride_id}))


@router.post("/rides/{ride_id}/complete", response_model=RideWithDriver)
async def complete_ride(ride_id: str, rider: Rider = Depends(current_rider)):
    doc = await _load_ride(ride_id, rider)
    if doc["state"] != "in_progress":
        raise HTTPException(status_code=409, detail="Only a trip in progress can be completed")

    total = float(doc["fare"]["total"])
    method = doc["payment_method"]
    if method == "wallet":
        r = await db.riders.find_one({"id": rider.id})
        bal = float(r.get("wallet_balance", 0))
        if bal < total:
            raise HTTPException(status_code=409, detail="Wallet balance is short — pick another method")
        new_bal = round(bal - total, 2)
        await db.riders.update_one({"id": rider.id}, {"$set": {"wallet_balance": new_bal}})
        await db.ledger.insert_one(LedgerEntry(
            owner_type="rider", owner_id=rider.id, owner_name=rider.name,
            entry_type="debit", pool="user_funded", amount=total, balance_after=new_bal,
            reason="Ride payment (wallet)", ref_id=doc["code"],
        ).model_dump())

    await db.rides.update_one({"id": ride_id}, {"$set": {
        "state": "completed", "payment_status": "paid",
        "driver_earning": round(total - float(doc.get("commission", 0)), 2),
    }})
    if doc.get("driver_id"):
        await db.drivers.update_one({"id": doc["driver_id"]},
                                    {"$set": {"on_trip": False}, "$inc": {"total_rides": 1}})
    await db.riders.update_one({"id": rider.id}, {"$inc": {"total_rides": 1}})
    return await _hydrate(await db.rides.find_one({"id": ride_id}))


@router.post("/rides/{ride_id}/rate", response_model=Ride)
async def rate_ride(ride_id: str, payload: RateRequest, rider: Rider = Depends(current_rider)):
    doc = await _load_ride(ride_id, rider)
    if doc["state"] != "completed":
        raise HTTPException(status_code=409, detail="You can only rate a completed ride")
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "rider_rating": payload.rating, "rider_comment": payload.comment,
    }})
    updated = await db.rides.find_one({"id": ride_id})
    updated.pop("_id", None)
    return Ride(**updated)


@router.post("/rides/{ride_id}/sos", response_model=SosIncident)
async def raise_sos(ride_id: str, payload: SosRequest, rider: Rider = Depends(current_rider)):
    """Lands straight in the admin SOS console."""
    doc = await _load_ride(ride_id, rider)
    driver = await db.drivers.find_one({"id": doc["driver_id"]}) if doc.get("driver_id") else None
    incident = SosIncident(
        ride_id=doc["id"], ride_code=doc["code"], rider_name=rider.name, rider_phone=rider.phone,
        driver_name=driver["name"] if driver else "Unassigned",
        driver_phone=driver["phone"] if driver else "-",
        vehicle_number=driver["vehicle_number"] if driver else "-",
        trigger_source="rider", reason=payload.reason,
        lat=doc["pickup_lat"], lng=doc["pickup_lng"], location_label=doc["pickup"],
        severity="critical", status="open",
        action_history=["Raised from the rider app SOS button"],
    )
    await db.sos_incidents.insert_one(incident.model_dump())
    return incident


@router.get("/rides/{ride_id}/share", response_model=TripShare)
async def share_trip(ride_id: str, rider: Rider = Depends(current_rider)):
    doc = await _load_ride(ride_id, rider)
    token = secrets.token_urlsafe(8)
    await db.trip_shares.insert_one({
        "token": token, "ride_id": doc["id"],
        "expires_at": utcnow() + timedelta(minutes=90),
    })
    return TripShare(share_url=f"/trip/{token}", expires_in_min=90)


# ---------------- wallet & promos ----------------
@router.get("/wallet", response_model=RiderWallet)
async def wallet(rider: Rider = Depends(current_rider)):
    docs = await db.ledger.find({"owner_id": rider.id}).sort("created_at", -1).to_list(50)
    entries = []
    for e in docs:
        e.pop("_id", None)
        e["created_at"] = _aware(e["created_at"]).isoformat()
        entries.append(e)
    fresh = await db.riders.find_one({"id": rider.id})
    return RiderWallet(
        wallet_balance=round(float(fresh.get("wallet_balance", 0)), 2),
        promo_balance=round(float(fresh.get("promo_balance", 0)), 2),
        cashback_balance=round(float(fresh.get("cashback_balance", 0)), 2),
        entries=entries,
    )


@router.post("/wallet/recharge", response_model=RiderWallet)
async def recharge(payload: RechargeRequest, rider: Rider = Depends(current_rider)):
    """Payments are simulated — no gateway is integrated."""
    fresh = await db.riders.find_one({"id": rider.id})
    bal = round(float(fresh.get("wallet_balance", 0)) + payload.amount, 2)
    await db.riders.update_one({"id": rider.id}, {"$set": {"wallet_balance": bal}})
    await db.ledger.insert_one(LedgerEntry(
        owner_type="rider", owner_id=rider.id, owner_name=rider.name,
        entry_type="credit", pool="user_funded", amount=payload.amount, balance_after=bal,
        reason=f"Wallet recharge via {payload.method.replace('_', ' ').title()}",
    ).model_dump())

    # ₹1000+ top-ups earn 5% cashback, capped at ₹100.
    if payload.amount >= 1000:
        cb = round(min(payload.amount * 0.05, 100), 2)
        cbal = round(float(fresh.get("cashback_balance", 0)) + cb, 2)
        await db.riders.update_one({"id": rider.id}, {"$set": {"cashback_balance": cbal}})
        await db.ledger.insert_one(LedgerEntry(
            owner_type="rider", owner_id=rider.id, owner_name=rider.name,
            entry_type="credit", pool="cashback", amount=cb, balance_after=cbal,
            reason="Recharge cashback (5%)",
        ).model_dump())
    return await wallet(rider)


@router.get("/promos", response_model=list[RiderPromo])
async def promos():
    docs = await db.campaigns.find({"app": "rider", "status": "active"}).to_list(50)
    return [RiderPromo(
        id=d["id"], name=d["name"], code=d.get("code"), discount_type=d["discount_type"],
        value=d["value"], max_discount=d.get("max_discount", 0),
        categories=d.get("categories", []), ends_on=d["ends_on"],
    ) for d in docs if float(d.get("budget_used", 0)) < float(d["budget_cap"])]
