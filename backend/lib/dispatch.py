"""Dispatch engine — offers, locks, timeouts and presence expiry (§9).

Redis would hold this transient state in the target architecture; here it lives in the
`ride_offers` collection with short TTLs, so the semantics (single lock per ride, timed
offers, controlled radius expansion, no infinite search) survive a future port.
"""

import logging
from datetime import timedelta

from lib.db import db
from lib.fraud import note_offer_ignored
from models.schemas import utcnow

logger = logging.getLogger(__name__)

OFFER_TTL_SEC = 30          # a driver has 30s to accept an offer
SEARCH_TIMEOUT_SEC = 240    # §8.1 — matching stops after 4 minutes
HEARTBEAT_TTL_SEC = 120     # presence expires without a location heartbeat
MAX_OFFERS_PER_WAVE = 3
FAN_OUT_STATES = ("offered",)


def _aware(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=utcnow().tzinfo)


def radius_for(elapsed_sec: float) -> int:
    """Controlled expansion instead of one huge sweep."""
    if elapsed_sec < 45:
        return 4000
    if elapsed_sec < 120:
        return 8000
    return 15000


async def eligible_drivers(ride: dict, radius_m: int, exclude: list[str], limit: int) -> list[dict]:
    fresh_after = utcnow() - timedelta(seconds=HEARTBEAT_TTL_SEC)
    query = {
        "kyc_status": "approved",
        "is_online": True,
        "on_trip": False,
        "category": ride["category"],
        "flags": {"$nin": ["suspended"]},
        "id": {"$nin": exclude},
        "$or": [{"last_heartbeat": {"$gte": fresh_after}}, {"last_heartbeat": None}],
    }
    try:
        return await db.drivers.aggregate([
            {"$geoNear": {
                "near": {"type": "Point", "coordinates": [ride["pickup_lng"], ride["pickup_lat"]]},
                "distanceField": "distance_m",
                "maxDistance": radius_m,
                "spherical": True,
                "query": query,
            }},
            # A lower dispatch_priority means the driver has been ignoring offers (§8.6).
            {"$sort": {"dispatch_priority": -1, "distance_m": 1}},
            {"$limit": limit},
        ]).to_list(limit)
    except Exception as exc:  # a missing 2dsphere index must not break booking
        logger.error("eligible_drivers geoNear failed: %s", exc)
        return []


async def create_offers(ride: dict) -> list[dict]:
    """Fan a timed offer out to the nearest free drivers who haven't seen this ride."""
    if ride["state"] != "searching":
        return []

    live = await db.ride_offers.find({"ride_id": ride["id"], "state": {"$in": list(FAN_OUT_STATES)}}).to_list(20)
    if live:  # a wave is still open — don't stack offers
        return live

    seen = await db.ride_offers.find({"ride_id": ride["id"]}).to_list(100)
    exclude = [o["driver_id"] for o in seen]
    # A driver already holding an open offer elsewhere is locked out of this wave.
    busy = await db.ride_offers.find({"state": "offered", "expires_at": {"$gt": utcnow()}}).to_list(200)
    exclude += [o["driver_id"] for o in busy]

    elapsed = (utcnow() - _aware(ride["created_at"])).total_seconds()
    found = await eligible_drivers(ride, radius_for(elapsed), list(set(exclude)), MAX_OFFERS_PER_WAVE)

    offers = []
    for d in found:
        offer = {
            "id": f"{ride['id']}:{d['id']}",
            "ride_id": ride["id"],
            "ride_code": ride["code"],
            "driver_id": d["id"],
            "driver_name": d["name"],
            "state": "offered",
            "distance_m": round(float(d.get("distance_m", 0)), 1),
            "fare_total": float(ride["fare"]["total"]),
            "created_at": utcnow(),
            "expires_at": utcnow() + timedelta(seconds=OFFER_TTL_SEC),
            "decline_reason": None,
        }
        await db.ride_offers.update_one({"id": offer["id"]}, {"$set": offer}, upsert=True)
        offers.append(offer)
    return offers


async def accept_offer(offer_id: str, driver: dict) -> dict:
    """Atomic lock: the first accept wins, the rest of the wave is cancelled."""
    offer = await db.ride_offers.find_one({"id": offer_id, "driver_id": driver["id"]})
    if not offer:
        return {"ok": False, "reason": "That offer is no longer available"}
    if offer["state"] != "offered":
        return {"ok": False, "reason": f"This offer is already {offer['state']}"}
    if _aware(offer["expires_at"]) <= utcnow():
        await db.ride_offers.update_one({"id": offer_id}, {"$set": {"state": "expired"}})
        return {"ok": False, "reason": "That offer timed out"}

    claimed = await db.rides.find_one_and_update(
        {"id": offer["ride_id"], "state": "searching", "driver_id": None},
        {"$set": {
            "state": "driver_assigned",
            "driver_id": driver["id"],
            "driver_name": driver["name"],
            "driver_lat": driver.get("lat"),
            "driver_lng": driver.get("lng"),
            "assigned_at": utcnow(),
        }},
        return_document=True,
    )
    if not claimed:
        await db.ride_offers.update_one({"id": offer_id}, {"$set": {"state": "lost"}})
        return {"ok": False, "reason": "Another partner took this ride"}

    await db.ride_offers.update_one({"id": offer_id}, {"$set": {"state": "accepted", "accepted_at": utcnow()}})
    await db.ride_offers.update_many(
        {"ride_id": offer["ride_id"], "state": "offered"}, {"$set": {"state": "lost"}}
    )
    await db.drivers.update_one({"id": driver["id"]}, {"$set": {"on_trip": True}})
    claimed.pop("_id", None)
    return {"ok": True, "ride": claimed}


async def decline_offer(offer_id: str, driver_id: str, reason: str) -> bool:
    res = await db.ride_offers.update_one(
        {"id": offer_id, "driver_id": driver_id, "state": "offered"},
        {"$set": {"state": "declined", "decline_reason": reason or "Declined"}},
    )
    if res.modified_count:
        await db.drivers.update_one({"id": driver_id}, {"$inc": {"declined_offers": 1}})
    return bool(res.modified_count)


async def assign_nearest(ride: dict) -> dict | None:
    """Fallback used by the rider app demo path while no driver app is live."""
    found = await eligible_drivers(ride, radius_for(999), [], 1)
    if not found:
        return None
    d = found[0]
    claimed = await db.rides.find_one_and_update(
        {"id": ride["id"], "state": "searching", "driver_id": None},
        {"$set": {
            "state": "driver_assigned", "driver_id": d["id"], "driver_name": d["name"],
            "driver_lat": d.get("lat"), "driver_lng": d.get("lng"), "assigned_at": utcnow(),
        }},
        return_document=True,
    )
    if not claimed:
        return None
    await db.drivers.update_one({"id": d["id"]}, {"$set": {"on_trip": True}})
    await db.ride_offers.update_many({"ride_id": ride["id"], "state": "offered"}, {"$set": {"state": "lost"}})
    claimed.pop("_id", None)
    return claimed


# ---------------- sweeps (called by cron and by the admin dispatch console) ----------------
async def expire_offers() -> int:
    stale = await db.ride_offers.find({"state": "offered", "expires_at": {"$lte": utcnow()}}).to_list(500)
    for o in stale:
        await db.ride_offers.update_one({"id": o["id"]}, {"$set": {"state": "expired"}})
        await note_offer_ignored(o["driver_id"])
    return len(stale)


async def expire_searches() -> int:
    cutoff = utcnow() - timedelta(seconds=SEARCH_TIMEOUT_SEC)
    stale = await db.rides.find({"state": "searching", "created_at": {"$lte": cutoff}}).to_list(500)
    for r in stale:
        await db.rides.update_one({"id": r["id"]}, {"$set": {
            "state": "expired",
            "cancellation_reason": "No partner accepted within the search window",
        }})
        await db.ride_offers.update_many({"ride_id": r["id"], "state": "offered"}, {"$set": {"state": "lost"}})
    return len(stale)


async def expire_heartbeats() -> int:
    cutoff = utcnow() - timedelta(seconds=HEARTBEAT_TTL_SEC)
    res = await db.drivers.update_many(
        {"is_online": True, "on_trip": False, "last_heartbeat": {"$lte": cutoff}},
        {"$set": {"is_online": False, "offline_reason": "heartbeat expired"}},
    )
    return res.modified_count


async def release_scheduled() -> int:
    due = await db.rides.find({
        "state": "draft",
        "scheduled_for": {"$ne": None, "$lte": utcnow() + timedelta(minutes=5)},
    }).to_list(200)
    for r in due:
        await db.rides.update_one({"id": r["id"]}, {"$set": {"state": "searching", "created_at": utcnow()}})
    return len(due)


async def fan_out_pending() -> int:
    """Keep every searching ride supplied with a live offer wave."""
    searching = await db.rides.find({"state": "searching"}).to_list(200)
    made = 0
    for r in searching:
        made += len(await create_offers(r))
    return made


async def sweep() -> dict:
    return {
        "offers_expired": await expire_offers(),
        "searches_expired": await expire_searches(),
        "drivers_taken_offline": await expire_heartbeats(),
        "scheduled_released": await release_scheduled(),
        "offers_created": await fan_out_pending(),
        "ran_at": utcnow(),
    }
