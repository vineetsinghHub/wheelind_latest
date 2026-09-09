"""Fraud, anomaly and behaviour policies (§8) — system-enforced, admin-overridable."""

from datetime import timedelta

from lib.db import db
from lib.places import haversine_km
from models.schemas import utcnow

# A Kolkata vehicle cannot cover ground faster than this between two heartbeats.
MAX_PLAUSIBLE_KMPH = 180.0
IGNORED_OFFERS_BEFORE_PENALTY = 5


async def raise_flag(
    entity_type: str,
    entity_id: str,
    entity_name: str,
    kind: str,
    detail: str,
    severity: str = "medium",
    ride_code: str | None = None,
) -> dict:
    flag = {
        "id": f"{entity_id}:{kind}:{int(utcnow().timestamp())}",
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "kind": kind,
        "detail": detail,
        "severity": severity,
        "ride_code": ride_code,
        "status": "open",
        "created_at": utcnow(),
    }
    await db.fraud_flags.insert_one(dict(flag))
    if entity_type == "driver":
        await db.drivers.update_one({"id": entity_id}, {"$addToSet": {"flags": kind}})
    return flag


async def check_location_jump(driver: dict, lat: float, lng: float) -> dict | None:
    """§8.4 — impossible jumps mean a spoofed GPS or a swapped device."""
    last = driver.get("last_heartbeat")
    if not last or driver.get("lat") is None:
        return None
    last = last if last.tzinfo else last.replace(tzinfo=utcnow().tzinfo)
    seconds = max((utcnow() - last).total_seconds(), 1.0)
    km = haversine_km(float(driver["lat"]), float(driver["lng"]), lat, lng)
    kmph = km / (seconds / 3600)
    if km > 1.0 and kmph > MAX_PLAUSIBLE_KMPH:
        return await raise_flag(
            "driver", driver["id"], driver.get("name", "Partner"), "gps_anomaly",
            f"Moved {km:.1f} km in {seconds:.0f}s ({kmph:.0f} km/h)",
            severity="high",
        )
    return None


async def note_offer_ignored(driver_id: str) -> None:
    """§8.6 — repeated ignores cost dispatch priority, then get flagged."""
    doc = await db.drivers.find_one_and_update(
        {"id": driver_id},
        {"$inc": {"ignored_offers": 1, "dispatch_priority": -1}},
        return_document=True,
    )
    if doc and int(doc.get("ignored_offers", 0)) % IGNORED_OFFERS_BEFORE_PENALTY == 0:
        await raise_flag(
            "driver", driver_id, doc.get("name", "Partner"), "offer_no_show",
            f"Ignored {doc['ignored_offers']} ride offers", severity="medium",
        )


async def note_rider_cancellation(rider: dict) -> None:
    """Repeat late cancellations push a rider to prepaid-only."""
    since = utcnow() - timedelta(days=7)
    recent = await db.rides.count_documents({
        "rider_id": rider["id"], "state": "cancelled", "created_at": {"$gte": since},
    })
    if recent >= 4 and not rider.get("prepaid_only"):
        await db.riders.update_one({"id": rider["id"]}, {"$set": {"prepaid_only": True}})
        await raise_flag(
            "rider", rider["id"], rider.get("name", "Rider"), "repeat_cancellations",
            f"{recent} cancellations in 7 days — cash disabled", severity="medium",
        )


async def flag_otp_bypass(ride: dict) -> dict:
    return await raise_flag(
        "driver", ride.get("driver_id") or "unknown", ride.get("driver_name") or "Partner",
        "otp_bypass_attempt", "Tried to start a trip without the rider OTP",
        severity="high", ride_code=ride.get("code"),
    )
