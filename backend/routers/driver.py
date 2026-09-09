"""Driver partner API — consumed by the React Native driver app (no web UI).

Auth is `Authorization: Bearer <token>` (see lib/driver_auth.py). Everything money- or
trip-related requires an approved KYC; onboarding endpoints work while KYC is pending.
"""

import random
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from lib import dispatch, earnings, fraud
from lib.db import db
from lib.driver_auth import (
    OTP_TTL_SEC, approved_driver, create_driver_session, current_driver, destroy_driver_session,
)
from lib.kyc import annotate_documents
from lib.places import haversine_km
from lib.providers import send_otp_sms
from lib.state_machine import assert_transition
from models.driver import (
    DocumentSubmit, DriverCancel, DriverDocumentList, DriverHome, DriverLedgerEntry, DriverOtpChallenge,
    DriverOtpRequest, DriverOtpStart, DriverOtpVerify, DriverPass, DriverProfileUpdate, DriverRegister,
    DriverSession, DriverSos, DriverTrip, EarningsSummary, Heartbeat, IncentiveProgress, OfferDecision,
    OnlineToggle, PayoutAccount, PayoutAccountUpdate, PresenceState, RideOffer, TripComplete,
)
from models.ops import SupportCase, SupportCaseCreate
from models.schemas import Driver, DriverDocument, Ride, SosIncident, utcnow

router = APIRouter(prefix="/driver", tags=["driver-app"])

DRIVER_LIVE_STATES = ["driver_assigned", "driver_arriving", "waiting_at_pickup", "otp_pending", "in_progress"]

# Every partner must clear these four before going online.
REQUIRED_DOCUMENTS = ["Driving Licence", "RC Book", "Insurance", "Aadhaar"]


def _aware(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=utcnow().tzinfo)


def _mask(phone: str | None) -> str | None:
    if not phone:
        return None
    return f"{phone[:3]}xxxxx{phone[-2:]}"


def _norm(phone: str) -> str:
    digits = "".join(ch for ch in phone if ch.isdigit())[-10:]
    if len(digits) != 10:
        raise HTTPException(status_code=422, detail="Enter a valid 10-digit mobile number")
    return f"+91{digits}"


# ---------------- auth & onboarding ----------------
@router.post("/auth/request-otp", response_model=DriverOtpChallenge)
async def request_otp(payload: DriverOtpRequest):
    phone = _norm(payload.phone)
    otp = f"{random.randint(1000, 9999)}"
    await db.driver_otps.delete_many({"phone": phone})
    await db.driver_otps.insert_one({
        "phone": phone, "otp": otp,
        "expires_at": utcnow() + timedelta(seconds=OTP_TTL_SEC),
    })
    delivery = await send_otp_sms(phone, otp)
    existing = await db.drivers.find_one({"phone": phone})
    return DriverOtpChallenge(
        phone=phone,
        otp_hint=otp if delivery["expose_otp"] else "",
        expires_in_sec=OTP_TTL_SEC,
        is_registered=bool(existing),
    )


@router.post("/auth/verify", response_model=DriverSession)
async def verify_otp(payload: DriverOtpVerify):
    phone = _norm(payload.phone)
    challenge = await db.driver_otps.find_one({"phone": phone})
    if not challenge or _aware(challenge["expires_at"]) <= utcnow():
        raise HTTPException(status_code=422, detail="That code has expired — request a new one")
    if challenge["otp"] != payload.otp.strip():
        raise HTTPException(status_code=422, detail="Incorrect OTP")
    doc = await db.drivers.find_one({"phone": phone})
    if not doc:
        raise HTTPException(status_code=404, detail="No partner account on this number — register first")
    await db.driver_otps.delete_many({"phone": phone})
    doc.pop("_id", None)
    token = await create_driver_session(doc["id"])
    pending = [d["type"] for d in (doc.get("documents") or []) if d["status"] != "approved"]
    return DriverSession(token=token, driver=Driver(**doc), permissions_pending=pending)


@router.post("/auth/register", response_model=DriverSession)
async def register(payload: DriverRegister):
    """Self-onboarding: creates a partner in `pending` KYC with the required doc slots."""
    phone = _norm(payload.phone)
    if await db.drivers.find_one({"phone": phone}):
        raise HTTPException(status_code=409, detail="A partner account already exists on this number")
    if not await db.fare_configs.find_one({"category": payload.category}):
        raise HTTPException(status_code=422, detail="That vehicle category is not offered")

    driver = Driver(
        name=payload.name.strip(),
        phone=phone,
        city=payload.city,
        zone=payload.zone,
        category=payload.category,
        vehicle_model=payload.vehicle_model.strip(),
        vehicle_number=payload.vehicle_number.strip().upper(),
        kyc_status="pending",
    )
    doc = driver.model_dump()
    doc["documents"] = [
        {"type": t, "number": "", "status": "pending", "file_url": None, "uploaded_at": None,
         "expires_on": None, "reject_reason": None, "version": 1,
         "resubmitted_at": None, "previous_reject_reason": None}
        for t in REQUIRED_DOCUMENTS
    ]
    doc["payout_balance"] = 0.0
    doc["dispatch_priority"] = 10
    doc["location"] = {"type": "Point", "coordinates": [driver.lng, driver.lat]}
    await db.drivers.insert_one(dict(doc))
    token = await create_driver_session(driver.id)
    doc.pop("_id", None)
    return DriverSession(token=token, driver=Driver(**doc), permissions_pending=list(REQUIRED_DOCUMENTS))


@router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(default=None)):
    if authorization and authorization.lower().startswith("bearer "):
        await destroy_driver_session(authorization.split(" ", 1)[1].strip())
    return {"ok": True}


@router.get("/me", response_model=DriverHome)
async def me(driver: Driver = Depends(current_driver)):
    summary = await earnings.earnings_summary(driver.id)
    docs = driver.documents or []
    offers = await db.ride_offers.count_documents({
        "driver_id": driver.id, "state": "offered", "expires_at": {"$gt": utcnow()},
    })
    active = await db.rides.find_one({"driver_id": driver.id, "state": {"$in": DRIVER_LIVE_STATES}})
    return DriverHome(
        driver=driver,
        kyc_status=driver.kyc_status,
        documents_pending=sum(1 for d in docs if d.status == "pending"),
        documents_rejected=sum(1 for d in docs if d.status == "rejected"),
        pass_active=summary["pass_active"],
        pass_name=summary["pass_name"],
        payout_balance=summary["payout_balance"],
        today_earnings=summary["today_earnings"],
        today_rides=summary["today_rides"],
        open_offers=offers,
        active_ride_id=active["id"] if active else None,
    )


@router.patch("/profile", response_model=Driver)
async def update_profile(payload: DriverProfileUpdate, driver: Driver = Depends(current_driver)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=422, detail="Nothing to update")
    if "vehicle_number" in update:
        update["vehicle_number"] = update["vehicle_number"].upper()
        update["kyc_status"] = "pending"  # a vehicle change re-opens review
    await db.drivers.update_one({"id": driver.id}, {"$set": update})
    doc = await db.drivers.find_one({"id": driver.id})
    doc.pop("_id", None)
    return Driver(**doc)


# ---------------- KYC documents ----------------
@router.get("/documents", response_model=DriverDocumentList)
async def documents(driver: Driver = Depends(current_driver)):
    doc = await db.drivers.find_one({"id": driver.id})
    annotate_documents(doc)
    decorated = [DriverDocument(**d) for d in (doc.get("documents") or [])]
    return DriverDocumentList(
        kyc_status=doc["kyc_status"],
        documents=decorated,
        action_required=[d.type for d in decorated if d.status == "rejected" or d.expiry_status == "expired"],
    )


@router.post("/documents", response_model=DriverDocumentList)
async def submit_document(payload: DocumentSubmit, driver: Driver = Depends(current_driver)):
    doc = await db.drivers.find_one({"id": driver.id})
    docs = doc.get("documents") or []
    target = next((d for d in docs if d["type"] == payload.type), None)
    if not target:
        target = {"type": payload.type, "version": 0, "status": "pending"}
        docs.append(target)
    if target.get("status") == "approved":
        raise HTTPException(status_code=409, detail="That document is already approved")

    target.update({
        "number": payload.number.strip().upper(),
        "file_url": payload.file_url or target.get("file_url"),
        "expires_on": payload.expires_on,
        "status": "pending",
        "uploaded_at": utcnow(),
        "version": int(target.get("version", 0)) + 1,
        "previous_reject_reason": target.get("reject_reason"),
        "resubmitted_at": utcnow() if target.get("reject_reason") else None,
        "reject_reason": None,
    })
    new_status = "pending" if doc["kyc_status"] in ("pending", "action_required", "rejected") else doc["kyc_status"]
    await db.drivers.update_one({"id": driver.id}, {"$set": {"documents": docs, "kyc_status": new_status}})
    return await documents(driver)


# ---------------- payout account ----------------
@router.get("/payout-account", response_model=PayoutAccount)
async def get_payout_account(driver: Driver = Depends(current_driver)):
    doc = await db.payout_accounts.find_one({"driver_id": driver.id})
    if not doc:
        return PayoutAccount(driver_id=driver.id)
    doc.pop("_id", None)
    return PayoutAccount(**doc)


@router.put("/payout-account", response_model=PayoutAccount)
async def set_payout_account(payload: PayoutAccountUpdate, driver: Driver = Depends(current_driver)):
    if payload.method == "upi" and not payload.upi_id:
        raise HTTPException(status_code=422, detail="Enter your UPI ID")
    if payload.method == "bank" and not (payload.account_number and payload.ifsc and payload.account_name):
        raise HTTPException(status_code=422, detail="Bank name, account number and IFSC are all required")
    account = PayoutAccount(driver_id=driver.id, **payload.model_dump(), verified=False)
    await db.payout_accounts.update_one(
        {"driver_id": driver.id}, {"$set": account.model_dump()}, upsert=True
    )
    return account


# ---------------- presence ----------------
@router.post("/online", response_model=PresenceState)
async def set_online(payload: OnlineToggle, driver: Driver = Depends(approved_driver)):
    if payload.is_online:
        blocking = [d for d in (driver.documents or []) if d.expiry_status == "expired"]
        if blocking:
            raise HTTPException(status_code=409, detail="A document has expired — re-upload it before going online")
    update: dict = {"is_online": payload.is_online, "offline_reason": None if payload.is_online else "manual"}
    if payload.is_online:
        update["last_heartbeat"] = utcnow()
    if payload.lat is not None and payload.lng is not None:
        update.update({
            "lat": payload.lat, "lng": payload.lng,
            "location": {"type": "Point", "coordinates": [payload.lng, payload.lat]},
        })
    if not payload.is_online:
        await db.ride_offers.update_many(
            {"driver_id": driver.id, "state": "offered"}, {"$set": {"state": "lost"}}
        )
    await db.drivers.update_one({"id": driver.id}, {"$set": update})
    return await presence(driver)


@router.get("/presence", response_model=PresenceState)
async def presence(driver: Driver = Depends(current_driver)):
    doc = await db.drivers.find_one({"id": driver.id})
    last = _aware(doc.get("last_heartbeat"))
    left = 0
    if doc.get("is_online") and last:
        left = max(int(dispatch.HEARTBEAT_TTL_SEC - (utcnow() - last).total_seconds()), 0)
    return PresenceState(
        is_online=bool(doc.get("is_online")),
        on_trip=bool(doc.get("on_trip")),
        last_heartbeat=last,
        expires_in_sec=left,
        flagged=bool(doc.get("flags")),
        message="Offline partners receive no offers" if not doc.get("is_online") else "You are receiving offers",
    )


@router.post("/heartbeat", response_model=PresenceState)
async def heartbeat(payload: Heartbeat, driver: Driver = Depends(approved_driver)):
    doc = await db.drivers.find_one({"id": driver.id})
    flag = await fraud.check_location_jump(doc, payload.lat, payload.lng)
    await db.drivers.update_one({"id": driver.id}, {"$set": {
        "lat": payload.lat, "lng": payload.lng,
        "location": {"type": "Point", "coordinates": [payload.lng, payload.lat]},
        "last_heartbeat": utcnow(),
        "last_speed_kmph": payload.speed_kmph,
    }})
    # Keep the assigned trip's driver marker in step with the heartbeat.
    await db.rides.update_many(
        {"driver_id": driver.id, "state": {"$in": DRIVER_LIVE_STATES}},
        {"$set": {"driver_lat": payload.lat, "driver_lng": payload.lng}},
    )
    state = await presence(driver)
    if flag:
        state.flagged = True
        state.message = "Location anomaly flagged for review"
    return state


# ---------------- offers ----------------
async def _offer_view(offer: dict) -> RideOffer:
    ride = await db.rides.find_one({"id": offer["ride_id"]}) or {}
    pct = await earnings.commission_pct(ride.get("category", "bike"))
    has_pass = bool(await earnings.active_pass(offer["driver_id"]))
    total = float(offer.get("fare_total", 0))
    return RideOffer(
        id=offer["id"], ride_id=offer["ride_id"], ride_code=offer["ride_code"],
        driver_id=offer["driver_id"], state=offer["state"],
        category=ride.get("category", "bike"),
        pickup=ride.get("pickup", ""), drop=ride.get("drop", ""),
        pickup_lat=ride.get("pickup_lat", 0), pickup_lng=ride.get("pickup_lng", 0),
        distance_km=float(ride.get("distance_km", 0)),
        distance_m=float(offer.get("distance_m", 0)),
        fare_total=total,
        estimated_earning=round(total if has_pass else total * (1 - pct / 100), 2),
        payment_method=ride.get("payment_method", "cash"),
        expires_in_sec=max(int((_aware(offer["expires_at"]) - utcnow()).total_seconds()), 0),
        created_at=_aware(offer["created_at"]),
    )


@router.get("/offers", response_model=list[RideOffer])
async def my_offers(driver: Driver = Depends(approved_driver)):
    """Poll target for the driver app; a WebSocket can replace this without an API change."""
    doc = await db.drivers.find_one({"id": driver.id})
    if not doc.get("is_online") or doc.get("on_trip"):
        return []
    await dispatch.expire_offers()
    await dispatch.fan_out_pending()
    offers = await db.ride_offers.find({
        "driver_id": driver.id, "state": "offered", "expires_at": {"$gt": utcnow()},
    }).to_list(10)
    return [await _offer_view(o) for o in offers]


@router.post("/offers/{offer_id}/accept", response_model=DriverTrip)
async def accept(offer_id: str, driver: Driver = Depends(approved_driver)):
    doc = await db.drivers.find_one({"id": driver.id})
    if doc.get("on_trip"):
        raise HTTPException(status_code=409, detail="Finish your current trip first")
    result = await dispatch.accept_offer(offer_id, doc)
    if not result["ok"]:
        raise HTTPException(status_code=409, detail=result["reason"])
    return await _trip_view(result["ride"], driver)


@router.post("/offers/{offer_id}/decline")
async def decline(offer_id: str, payload: OfferDecision, driver: Driver = Depends(approved_driver)):
    if not await dispatch.decline_offer(offer_id, driver.id, payload.reason):
        raise HTTPException(status_code=409, detail="That offer is no longer open")
    return {"ok": True}


# ---------------- trips ----------------
async def _trip_view(ride: dict, driver: Driver) -> DriverTrip:
    rider = await db.riders.find_one({"id": ride["rider_id"]})
    has_pass = bool(await earnings.active_pass(driver.id))
    pct = 0.0 if has_pass else await earnings.commission_pct(ride["category"], bool(ride.get("promo_code")))
    total = float(ride["fare"]["total"])
    ride.pop("_id", None)
    return DriverTrip(
        ride=Ride(**ride),
        rider_phone=rider["phone"] if rider else None,
        masked_rider_phone=_mask(rider["phone"]) if rider else None,
        otp_required=not ride.get("otp_verified", False),
        estimated_earning=round(total * (1 - pct / 100), 2),
        zero_commission=has_pass,
    )


async def _my_ride(ride_id: str, driver: Driver) -> dict:
    doc = await db.rides.find_one({"id": ride_id, "driver_id": driver.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Trip not found")
    return doc


@router.get("/trips/active", response_model=Optional[DriverTrip])
async def active_trip(driver: Driver = Depends(approved_driver)):
    doc = await db.rides.find_one({"driver_id": driver.id, "state": {"$in": DRIVER_LIVE_STATES}})
    return await _trip_view(doc, driver) if doc else None


@router.get("/trips", response_model=list[Ride])
async def trip_history(driver: Driver = Depends(current_driver), limit: int = Query(30, ge=1, le=100)):
    docs = await db.rides.find({"driver_id": driver.id}).sort("created_at", -1).to_list(limit)
    for d in docs:
        d.pop("_id", None)
    return [Ride(**d) for d in docs]


@router.post("/trips/{ride_id}/arrived", response_model=DriverTrip)
async def arrived(ride_id: str, driver: Driver = Depends(approved_driver)):
    doc = await _my_ride(ride_id, driver)
    assert_transition(doc, "waiting_at_pickup")
    await db.rides.update_one({"id": ride_id}, {"$set": {"state": "waiting_at_pickup", "arrived_at": utcnow()}})
    return await _trip_view(await db.rides.find_one({"id": ride_id}), driver)


@router.post("/trips/{ride_id}/start", response_model=DriverTrip)
async def start(ride_id: str, payload: DriverOtpStart, driver: Driver = Depends(approved_driver)):
    """§8.3 — the OTP is the only way into `in_progress`; a wrong code is flagged."""
    doc = await _my_ride(ride_id, driver)
    if doc["state"] not in ("waiting_at_pickup", "otp_pending", "driver_arriving"):
        raise HTTPException(status_code=409, detail="Reach the pickup point first")
    if payload.otp.strip() != doc["otp"]:
        await db.rides.update_one({"id": ride_id}, {"$set": {"state": "otp_pending"}})
        await fraud.flag_otp_bypass(doc)
        raise HTTPException(status_code=422, detail="Incorrect OTP — ask the rider to read it again")
    await db.rides.update_one({"id": ride_id}, {"$set": {"otp_verified": True}})
    doc["otp_verified"] = True
    doc["state"] = "waiting_at_pickup"
    assert_transition(doc, "in_progress")
    await db.rides.update_one({"id": ride_id}, {"$set": {"state": "in_progress", "started_at": utcnow()}})
    return await _trip_view(await db.rides.find_one({"id": ride_id}), driver)


@router.post("/trips/{ride_id}/complete", response_model=DriverTrip)
async def complete(ride_id: str, payload: TripComplete, driver: Driver = Depends(approved_driver)):
    doc = await _my_ride(ride_id, driver)
    assert_transition(doc, "completed")

    fare = dict(doc["fare"])
    cfg = await db.fare_configs.find_one({"category": doc["category"]})
    if payload.waiting_min and cfg:
        fare["waiting_charge"] = round(float(cfg["waiting_charge_per_min"]) * payload.waiting_min, 2)
    fare["toll_parking"] = round(payload.toll_parking, 2)
    fare["total"] = round(
        float(fare["base_fare"]) + float(fare["distance_charge"]) + float(fare["time_charge"])
        + float(fare["waiting_charge"]) + float(fare["surge_amount"]) + float(fare["night_charge"])
        + float(fare["rider_added_fare"]) - float(fare["discount"]) + float(fare["tax"])
        + float(fare["toll_parking"]),
        2,
    )

    payment_status = "paid"
    if doc["payment_method"] == "cash" and not payload.cash_collected:
        payment_status = "disputed"  # §8.5 — freeze settlement until support reviews
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "state": "completed", "fare": fare, "payment_status": payment_status,
        "waiting_min": payload.waiting_min, "completed_at": utcnow(),
    }})
    fresh = await db.rides.find_one({"id": ride_id})
    await earnings.settle_ride(fresh)
    await db.drivers.update_one({"id": driver.id}, {
        "$set": {"on_trip": False}, "$inc": {"total_rides": 1, "dispatch_priority": 1},
    })
    await db.riders.update_one({"id": doc["rider_id"]}, {"$inc": {"total_rides": 1}})

    if payment_status == "disputed":
        await _open_case(
            kind="cash_unpaid",
            subject=f"Cash not collected on {doc['code']}",
            detail="Partner marked the cash fare as uncollected.",
            ride=fresh, raised_by="driver", driver=driver.model_dump(),
            amount=float(fare["total"]),
        )
    return await _trip_view(await db.rides.find_one({"id": ride_id}), driver)


@router.post("/trips/{ride_id}/cancel", response_model=Ride)
async def cancel(ride_id: str, payload: DriverCancel, driver: Driver = Depends(approved_driver)):
    doc = await _my_ride(ride_id, driver)
    assert_transition(doc, "cancelled")
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "state": "cancelled",
        "cancellation_reason": f"Cancelled by partner: {payload.reason}",
    }})
    await db.drivers.update_one({"id": driver.id}, {
        "$set": {"on_trip": False}, "$inc": {"cancelled_trips": 1, "dispatch_priority": -1},
    })
    fresh = await db.rides.find_one({"id": ride_id})
    fresh.pop("_id", None)
    return Ride(**fresh)


# ---------------- earnings, ledger, passes, incentives ----------------
@router.get("/earnings", response_model=EarningsSummary)
async def my_earnings(driver: Driver = Depends(current_driver)):
    return EarningsSummary(**await earnings.earnings_summary(driver.id))


@router.get("/ledger", response_model=list[DriverLedgerEntry])
async def my_ledger(driver: Driver = Depends(current_driver), limit: int = Query(50, ge=1, le=200)):
    docs = await db.driver_ledger.find({"driver_id": driver.id}).sort("created_at", -1).to_list(limit)
    for d in docs:
        d.pop("_id", None)
    return [DriverLedgerEntry(**d) for d in docs]


@router.get("/passes")
async def available_passes(driver: Driver = Depends(current_driver)):
    docs = await db.subscription_passes.find({"status": "active"}).to_list(50)
    out = []
    for d in docs:
        d.pop("_id", None)
        eligible = not d.get("categories") or driver.category in d["categories"]
        out.append({**d, "eligible": eligible})
    return out


@router.get("/my-pass", response_model=Optional[DriverPass])
async def my_pass(driver: Driver = Depends(current_driver)):
    doc = await earnings.active_pass(driver.id)
    return DriverPass(**doc) if doc else None


@router.post("/passes/{plan_id}/subscribe", response_model=DriverPass)
async def subscribe(plan_id: str, driver: Driver = Depends(approved_driver)):
    plan = await db.subscription_passes.find_one({"id": plan_id, "status": "active"})
    if not plan:
        raise HTTPException(status_code=404, detail="That pass is not on sale")
    if plan.get("categories") and driver.category not in plan["categories"]:
        raise HTTPException(status_code=409, detail="This pass does not cover your vehicle category")
    if await earnings.active_pass(driver.id):
        raise HTTPException(status_code=409, detail="You already have an active pass")

    days = {"daily": 1, "weekly": 7, "monthly": 30}[plan["duration"]]
    doc = {
        "id": f"{driver.id}:{plan_id}:{int(utcnow().timestamp())}",
        "driver_id": driver.id, "plan_id": plan_id, "plan_name": plan["name"],
        "duration": plan["duration"], "price": float(plan["price"]),
        "categories": plan.get("categories", []),
        "rides_used": 0, "fair_usage_rides": int(plan.get("fair_usage_rides", 0)),
        "status": "active", "starts_at": utcnow(), "expires_at": utcnow() + timedelta(days=days),
    }
    await db.driver_passes.insert_one(dict(doc))
    await db.subscription_passes.update_one({"id": plan_id}, {"$inc": {"active_subscribers": 1}})
    await db.drivers.update_one({"id": driver.id}, {"$set": {
        "commission_model": "subscription", "pass_plan_id": plan_id,
    }})
    fresh = await db.drivers.find_one({"id": driver.id})
    await earnings.driver_entry(
        fresh, amount=float(plan["price"]), entry_type="debit", kind="pass_fee",
        reason=f"{plan['name']} subscription", ref_id=plan_id,
    )
    doc.pop("_id", None)
    return DriverPass(**doc)


@router.get("/incentives", response_model=list[IncentiveProgress])
async def incentives(driver: Driver = Depends(current_driver)):
    camps = await db.campaigns.find({"app": "driver", "status": "active"}).to_list(50)
    since = utcnow() - timedelta(days=7)
    done = await db.rides.count_documents({
        "driver_id": driver.id, "state": "completed", "created_at": {"$gte": since},
    })
    out = []
    for c in camps:
        if c.get("categories") and driver.category not in c["categories"]:
            continue
        target = int(c.get("min_rides", 0)) or 10
        out.append(IncentiveProgress(
            id=c["id"], name=c["name"], description=c.get("type", "").replace("_", " ").title(),
            target_rides=target, completed_rides=min(done, target),
            reward=float(c["value"]), ends_on=c["ends_on"],
            claimed=False,
        ))
    return out


@router.post("/incentives/{campaign_id}/claim", response_model=DriverLedgerEntry)
async def claim_incentive(campaign_id: str, driver: Driver = Depends(approved_driver)):
    camp = await db.campaigns.find_one({"id": campaign_id, "app": "driver", "status": "active"})
    if not camp:
        raise HTTPException(status_code=404, detail="That incentive is not running")
    if await db.driver_ledger.find_one({"driver_id": driver.id, "ref_id": campaign_id, "kind": "incentive"}):
        raise HTTPException(status_code=409, detail="You have already claimed this incentive")
    target = int(camp.get("min_rides", 0)) or 10
    since = utcnow() - timedelta(days=7)
    done = await db.rides.count_documents({
        "driver_id": driver.id, "state": "completed", "created_at": {"$gte": since},
    })
    if done < target:
        raise HTTPException(status_code=409, detail=f"Complete {target - done} more trips to claim this")
    if float(camp.get("budget_used", 0)) >= float(camp["budget_cap"]):
        raise HTTPException(status_code=409, detail="This incentive has run out of budget")

    fresh = await db.drivers.find_one({"id": driver.id})
    entry = await earnings.driver_entry(
        fresh, amount=float(camp["value"]), entry_type="credit", kind="incentive",
        reason=f"Incentive — {camp['name']}", ref_id=campaign_id,
    )
    await db.campaigns.update_one({"id": campaign_id},
                                  {"$inc": {"budget_used": float(camp["value"]), "redemptions": 1}})
    return DriverLedgerEntry(**entry)


# ---------------- safety & support ----------------
@router.post("/sos", response_model=SosIncident)
async def sos(payload: DriverSos, driver: Driver = Depends(current_driver)):
    ride = await db.rides.find_one({"driver_id": driver.id, "state": {"$in": DRIVER_LIVE_STATES}})
    rider = await db.riders.find_one({"id": ride["rider_id"]}) if ride else None
    incident = SosIncident(
        ride_id=ride["id"] if ride else "-", ride_code=ride["code"] if ride else "-",
        rider_name=rider["name"] if rider else "No active trip",
        rider_phone=rider["phone"] if rider else "-",
        driver_name=driver.name, driver_phone=driver.phone, vehicle_number=driver.vehicle_number,
        trigger_source="driver", reason=payload.reason,
        lat=payload.lat if payload.lat is not None else driver.lat,
        lng=payload.lng if payload.lng is not None else driver.lng,
        location_label=ride["pickup"] if ride else driver.zone,
        severity="critical", status="open",
        action_history=["Raised from the partner app SOS button"],
    )
    await db.sos_incidents.insert_one(incident.model_dump())
    return incident


async def _open_case(*, kind, subject, detail, ride, raised_by, driver=None, rider=None, amount=0.0) -> SupportCase:
    count = await db.support_cases.count_documents({})
    case = SupportCase(
        reference=f"WC{1000 + count + 1}",
        kind=kind, subject=subject, detail=detail, raised_by=raised_by,
        ride_id=ride["id"] if ride else None, ride_code=ride["code"] if ride else None,
        rider_id=(rider or {}).get("id") or (ride or {}).get("rider_id"),
        rider_name=(rider or {}).get("name") or (ride or {}).get("rider_name"),
        driver_id=(driver or {}).get("id") or (ride or {}).get("driver_id"),
        driver_name=(driver or {}).get("name") or (ride or {}).get("driver_name"),
        amount_claimed=amount,
    )
    await db.support_cases.insert_one(case.model_dump())
    return case


@router.post("/disputes", response_model=SupportCase)
async def raise_dispute(payload: SupportCaseCreate, driver: Driver = Depends(current_driver)):
    ride = None
    if payload.ride_id:
        ride = await db.rides.find_one({"id": payload.ride_id, "driver_id": driver.id})
        if not ride:
            raise HTTPException(status_code=404, detail="Trip not found on your account")
    return await _open_case(
        kind=payload.kind, subject=payload.subject, detail=payload.detail, ride=ride,
        raised_by="driver", driver=driver.model_dump(), amount=payload.amount_claimed,
    )


@router.get("/disputes", response_model=list[SupportCase])
async def my_disputes(driver: Driver = Depends(current_driver)):
    docs = await db.support_cases.find({"driver_id": driver.id}).sort("created_at", -1).to_list(50)
    for d in docs:
        d.pop("_id", None)
    return [SupportCase(**d) for d in docs]


@router.get("/nearby-demand")
async def nearby_demand(driver: Driver = Depends(approved_driver)):
    """Where the requests are right now — helps a partner position between trips."""
    searching = await db.rides.find({"state": "searching"}).to_list(200)
    buckets: dict[str, dict] = {}
    for r in searching:
        km = haversine_km(driver.lat, driver.lng, r["pickup_lat"], r["pickup_lng"])
        if km > 12:
            continue
        b = buckets.setdefault(r["pickup"], {"area": r["pickup"], "requests": 0, "distance_km": round(km, 1)})
        b["requests"] += 1
    return sorted(buckets.values(), key=lambda b: -b["requests"])[:8]
