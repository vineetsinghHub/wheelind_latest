"""Fare quote engine — the single place ride money is calculated.

Deliberately pure: it takes a fare config + trip shape and returns a breakup. No DB, no clock
reads outside `is_night_ist`, so quotes are reproducible and unit-testable.
"""

from datetime import datetime, timedelta, timezone

# Kolkata operates on IST; night charge must follow local time, never UTC.
IST = timezone(timedelta(hours=5, minutes=30))
NIGHT_START_HOUR = 23  # 11 PM
NIGHT_END_HOUR = 5     # 5 AM


def is_night_ist(now: datetime | None = None) -> bool:
    local = (now or datetime.now(timezone.utc)).astimezone(IST)
    return local.hour >= NIGHT_START_HOUR or local.hour < NIGHT_END_HOUR


def _r(value: float) -> float:
    return round(value + 1e-9, 2)


def quote_fare(
    config: dict,
    commission_pct: float,
    *,
    distance_km: float,
    duration_min: int,
    waiting_min: int = 0,
    surge_multiplier: float = 1.0,
    rider_added_fare: float = 0.0,
    toll_parking: float = 0.0,
    discount: float = 0.0,
    zero_commission: bool = False,
    night: bool | None = None,
) -> dict:
    """Return a fare breakup plus the driver-earnings split.

    Order of operations (documented because disputes hinge on it):
      1. base + distance + time + waiting
      2. surge applies to base + distance only (never to time/waiting)
      3. night charge is a % of base + distance
      4. rider-added fare is added on top
      5. the minimum-fare floor applies to the ride fare, before discount/tax/toll
      6. discount, then tax on the discounted ride fare
      7. toll/parking is added last and is never taxed or commissioned
    """
    night_applies = is_night_ist() if night is None else night

    base = float(config["base_fare"])
    per_km = float(config["per_km"])
    per_min = float(config["per_minute"])
    waiting_rate = float(config["waiting_charge_per_min"])
    minimum_fare = float(config["minimum_fare"])
    night_pct = float(config["night_charge_pct"])
    tax_pct = float(config["tax_pct"])

    distance_charge = _r(per_km * distance_km)
    time_charge = _r(per_min * duration_min)
    waiting_charge = _r(waiting_rate * waiting_min)

    surgeable = base + distance_charge
    surge_amount = _r(surgeable * (surge_multiplier - 1.0)) if surge_multiplier > 1 else 0.0
    night_charge = _r(surgeable * night_pct / 100) if night_applies else 0.0

    ride_fare = base + distance_charge + time_charge + waiting_charge + surge_amount + night_charge
    ride_fare += float(rider_added_fare)

    minimum_applied = ride_fare < minimum_fare
    ride_fare = _r(max(ride_fare, minimum_fare))

    discount_applied = _r(min(float(discount), ride_fare))
    after_discount = _r(ride_fare - discount_applied)
    tax = _r(after_discount * tax_pct / 100)
    total = _r(after_discount + tax + float(toll_parking))

    commission = 0.0 if zero_commission else _r(after_discount * commission_pct / 100)
    driver_earning = _r(total - commission)

    return {
        "breakup": {
            "base_fare": _r(base),
            "distance_charge": distance_charge,
            "time_charge": time_charge,
            "waiting_charge": waiting_charge,
            "surge_amount": surge_amount,
            "night_charge": night_charge,
            "rider_added_fare": _r(float(rider_added_fare)),
            "toll_parking": _r(float(toll_parking)),
            "discount": discount_applied,
            "tax": tax,
            "total": total,
        },
        "ride_fare_before_discount": ride_fare,
        "minimum_fare_applied": minimum_applied,
        "night_charge_applied": night_applies,
        "commission_pct": 0.0 if zero_commission else _r(commission_pct),
        "commission": commission,
        "driver_earning": driver_earning,
        "zero_commission": zero_commission,
        "config_version": int(config.get("version", 1)),
        "tax_pct": _r(tax_pct),
    }
