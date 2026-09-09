"""Driver earnings — the single engine both monetisation models feed into (§4.2, §12).

Commission plan and zero-commission subscription pass are separate inputs; the payout
number is computed in one place so a dispute can always be reconstructed.
"""

from datetime import timedelta

from lib.db import db
from models.schemas import utcnow


def _r(v: float) -> float:
    return round(float(v) + 1e-9, 2)


async def active_pass(driver_id: str) -> dict | None:
    doc = await db.driver_passes.find_one({
        "driver_id": driver_id, "status": "active", "expires_at": {"$gt": utcnow()},
    })
    if doc:
        doc.pop("_id", None)
    return doc


async def commission_pct(category: str, promo: bool = False) -> float:
    cfg = await db.commission_configs.find_one({"category": category})
    if not cfg:
        return 0.0
    if promo and cfg.get("promo_override_pct") is not None:
        return float(cfg["promo_override_pct"])
    return float(cfg["percentage"])


async def driver_entry(
    driver: dict,
    *,
    amount: float,
    entry_type: str,
    kind: str,
    reason: str,
    ref_id: str | None = None,
) -> dict:
    """Ledger-first: the balance field is derived from entries, never edited alone."""
    balance = float(driver.get("payout_balance", 0))
    balance = _r(balance + amount if entry_type == "credit" else balance - amount)
    entry = {
        "id": f"{driver['id']}:{kind}:{utcnow().timestamp()}",
        "driver_id": driver["id"],
        "driver_name": driver.get("name", "Partner"),
        "entry_type": entry_type,
        "kind": kind,
        "amount": _r(amount),
        "balance_after": balance,
        "reason": reason,
        "ref_id": ref_id,
        "created_at": utcnow(),
    }
    await db.driver_ledger.insert_one(dict(entry))
    update: dict = {"$set": {"payout_balance": balance}}
    if kind == "earning":
        update["$inc"] = {"lifetime_earnings": _r(amount)}
    await db.drivers.update_one({"id": driver["id"]}, update)
    return entry


async def settle_ride(ride: dict) -> dict:
    """Close the money on a completed ride and credit the partner."""
    driver = await db.drivers.find_one({"id": ride.get("driver_id")}) if ride.get("driver_id") else None
    total = float(ride["fare"]["total"])
    toll = float(ride["fare"].get("toll_parking", 0))
    commissionable = _r(total - toll - float(ride["fare"].get("tax", 0)))

    pass_doc = await active_pass(driver["id"]) if driver else None
    zero = bool(pass_doc)
    pct = 0.0 if zero else await commission_pct(ride["category"], promo=bool(ride.get("promo_code")))
    commission = 0.0 if zero else _r(commissionable * pct / 100)
    earning = _r(total - commission)

    await db.rides.update_one({"id": ride["id"]}, {"$set": {
        "commission": commission,
        "commission_pct": _r(pct),
        "zero_commission": zero,
        "driver_earning": earning,
        "settled_at": utcnow(),
    }})

    if driver:
        await driver_entry(
            driver, amount=earning, entry_type="credit", kind="earning",
            reason=f"Trip earning {ride['code']}" + (" (zero-commission pass)" if zero else f" (−{pct:.0f}% commission)"),
            ref_id=ride["code"],
        )
        if pass_doc:
            await db.driver_passes.update_one({"id": pass_doc["id"]}, {"$inc": {"rides_used": 1}})
    return {"commission": commission, "driver_earning": earning, "zero_commission": zero, "commission_pct": _r(pct)}


async def apply_penalty(driver: dict, amount: float, reason: str, ref_id: str | None = None) -> dict:
    return await driver_entry(
        driver, amount=amount, entry_type="debit", kind="penalty", reason=reason, ref_id=ref_id
    )


async def earnings_summary(driver_id: str) -> dict:
    driver = await db.drivers.find_one({"id": driver_id}) or {}
    now = utcnow()
    day_start = now - timedelta(hours=now.hour, minutes=now.minute, seconds=now.second, microseconds=now.microsecond)
    week_start = day_start - timedelta(days=6)

    rides = await db.rides.find({"driver_id": driver_id, "state": "completed"}).to_list(2000)

    def agg(items):
        return (
            _r(sum(float(r.get("driver_earning", 0)) for r in items)),
            len(items),
            _r(sum(float(r.get("commission", 0)) for r in items)),
        )

    def aware(dt):
        return dt if getattr(dt, "tzinfo", None) else dt.replace(tzinfo=now.tzinfo)

    today = [r for r in rides if aware(r["created_at"]) >= day_start]
    week = [r for r in rides if aware(r["created_at"]) >= week_start]

    t_earn, t_rides, t_comm = agg(today)
    w_earn, w_rides, w_comm = agg(week)
    l_earn, l_rides, l_comm = agg(rides)

    incentives = await db.driver_ledger.find({"driver_id": driver_id, "kind": "incentive"}).to_list(200)
    penalties = await db.driver_ledger.find({"driver_id": driver_id, "kind": "penalty"}).to_list(200)
    pass_doc = await active_pass(driver_id)

    return {
        "today_earnings": t_earn, "today_rides": t_rides,
        "week_earnings": w_earn, "week_rides": w_rides,
        "lifetime_earnings": l_earn, "lifetime_rides": l_rides,
        "commission_paid": l_comm,
        "commission_this_week": w_comm,
        "incentives_earned": _r(sum(float(e["amount"]) for e in incentives)),
        "penalties_charged": _r(sum(float(e["amount"]) for e in penalties)),
        "payout_balance": _r(driver.get("payout_balance", 0)),
        "pass_active": bool(pass_doc),
        "pass_name": pass_doc["plan_name"] if pass_doc else None,
        "pass_expires_at": pass_doc["expires_at"] if pass_doc else None,
        "rating": float(driver.get("rating", 0)),
    }
