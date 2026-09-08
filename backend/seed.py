"""Idempotent seed for the Wheelind Kolkata admin portal. Run: cd /app/backend && python seed.py"""

import asyncio
import random
from datetime import timedelta

from lib.auth import hash_password
from lib.db import db, ensure_indexes
from models.schemas import (
    AdminUser, AuditLog, Campaign, CommissionConfig, Driver, DriverDocument, FareConfig, FeatureFlag,
    LedgerEntry, Ride, FareBreakup, Rider, SosIncident, SubscriptionPass, utcnow,
)

random.seed(7)

ZONES = {
    "Park Street": (22.5535, 88.3520),
    "Salt Lake Sector V": (22.5697, 88.4336),
    "Howrah Station": (22.5839, 88.3425),
    "CCU Airport": (22.6547, 88.4467),
    "New Town": (22.5800, 88.4650),
    "Ballygunge": (22.5290, 88.3654),
    "Esplanade": (22.5645, 88.3510),
    "Jadavpur": (22.4990, 88.3712),
}
CATEGORIES = ["bike", "auto", "cab", "sedan", "xl", "rentals", "outstation", "parcel"]
VEHICLES = {
    "bike": ["Hero Splendor", "Honda Activa", "TVS Jupiter"],
    "auto": ["Bajaj RE", "Piaggio Ape"],
    "cab": ["Maruti WagonR", "Hyundai Santro", "Tata Tiago"],
    "sedan": ["Honda City", "Maruti Dzire", "Hyundai Aura"],
    "xl": ["Toyota Innova", "Maruti Ertiga", "Mahindra Marazzo"],
    "rentals": ["Maruti Dzire", "Honda City"],
    "outstation": ["Toyota Innova", "Hyundai Aura"],
    "parcel": ["Hero Splendor", "Tata Ace"],
}
FIRST = ["Sourav", "Rahul", "Debashish", "Amit", "Sanjay", "Prosenjit", "Tanmoy", "Bikash", "Arindam", "Subhas",
         "Rakesh", "Joydeep", "Nirmal", "Pradip", "Sujoy", "Kaushik", "Abhijit", "Manoj", "Dipankar", "Sandip"]
LAST = ["Das", "Ghosh", "Mukherjee", "Banerjee", "Chatterjee", "Roy", "Sarkar", "Dutta", "Bose", "Pal",
        "Sen", "Mondal", "Halder", "Nandi", "Biswas"]
RIDER_FIRST = ["Ananya", "Priya", "Rohit", "Sneha", "Aritra", "Ishita", "Nikhil", "Riya", "Soumya", "Megha",
               "Ayan", "Trisha", "Kunal", "Payel", "Arjun", "Moumita", "Sagnik", "Ritika", "Indranil", "Sohini"]

DOC_IMAGES = {
    "Driving Licence": "https://static.prod-images.emergentagent.com/jobs/0625bba6-3e80-4a7a-835a-379effd25ac9/images/a0d0d9e6b66bcc599093e85a266706f2893d4f313321da5a2e64db5070d26b19.jpeg",
    "Vehicle RC": "https://static.prod-images.emergentagent.com/jobs/0625bba6-3e80-4a7a-835a-379effd25ac9/images/534f87eae816fe799bc174920389ea8e4d54d051a58e3626d3711ebf2cbeced8.jpeg",
    "Insurance": "https://static.prod-images.emergentagent.com/jobs/0625bba6-3e80-4a7a-835a-379effd25ac9/images/770cc79216f688e37758a66b86f737be2751050de4d4c412292ed138ef28ead9.jpeg",
    "Aadhaar": "https://static.prod-images.emergentagent.com/jobs/0625bba6-3e80-4a7a-835a-379effd25ac9/images/01b47f0b3eea7a2cd3bbf449e439711219a2d51d2bca348765a809218f2d5c48.jpeg",
}

ADMINS = [
    ("admin@wheelind.in", "Wheelind@2026", "Vineet Singh", "super_admin"),
    ("fleet@wheelind.in", "Fleet@2026", "Ananya Mukherjee", "fleet_manager"),
    ("ops@wheelind.in", "Ops@2026", "Rahul Das", "ops_lead"),
]

FARES = {
    "bike": (20, 25, 6.5, 1.0, 1.0, 15, 1.8, 10),
    "auto": (30, 35, 11.0, 1.2, 1.5, 20, 1.8, 10),
    "cab": (50, 60, 14.0, 1.5, 2.0, 40, 2.0, 15),
    "sedan": (65, 80, 17.0, 2.0, 2.5, 50, 2.0, 15),
    "xl": (90, 110, 22.0, 2.5, 3.0, 70, 2.0, 20),
    "rentals": (250, 250, 12.0, 1.5, 2.0, 100, 1.5, 10),
    "outstation": (400, 500, 13.0, 1.0, 3.0, 200, 1.5, 10),
    "parcel": (25, 30, 8.0, 1.0, 1.0, 20, 1.6, 10),
}
COMMISSIONS = {"bike": 12, "auto": 10, "cab": 18, "sedan": 20, "xl": 22, "rentals": 15, "outstation": 15, "parcel": 12}

STATES_WEIGHTED = (
    ["completed"] * 60 + ["cancelled"] * 8 + ["in_progress"] * 8 + ["searching"] * 4 +
    ["driver_assigned"] * 4 + ["driver_arriving"] * 4 + ["waiting_at_pickup"] * 3 +
    ["otp_pending"] * 3 + ["expired"] * 3 + ["disputed"] * 2 + ["draft"] * 1
)
PAYMENTS = ["upi", "upi", "upi", "cash", "cash", "wallet", "credit_card", "debit_card", "net_banking"]
LIVE = {"searching", "driver_assigned", "driver_arriving", "waiting_at_pickup", "otp_pending", "in_progress"}


async def main() -> None:
    for c in ["admins", "admin_sessions", "drivers", "riders", "rides", "fare_configs", "commission_configs",
              "subscription_passes", "feature_flags", "campaigns", "ledger", "sos_incidents", "audit_logs"]:
        await db[c].drop()
    await ensure_indexes()

    # admins
    for email, pwd, name, role in ADMINS:
        a = AdminUser(email=email, name=name, role=role)
        doc = a.model_dump()
        doc["email"] = email.lower()
        doc["password_hash"] = hash_password(pwd)
        await db.admins.insert_one(doc)

    # fare + commission configs
    for cat, (base, minf, km, mn, wait, cancel, surge, night) in FARES.items():
        await db.fare_configs.insert_one(FareConfig(
            category=cat, base_fare=base, minimum_fare=minf, per_km=km, per_minute=mn,
            waiting_charge_per_min=wait, cancellation_charge=cancel, surge_cap=surge, night_charge_pct=night,
        ).model_dump())
        await db.commission_configs.insert_one(
            CommissionConfig(category=cat, percentage=COMMISSIONS[cat]).model_dump()
        )

    # feature flags
    flags = [FeatureFlag(key=f"category.{c}", label=f"{c.title()} service", scope="category",
                         enabled=c in ("bike", "auto", "cab", "sedan", "xl"),
                         note="Live in Kolkata" if c in ("bike", "auto", "cab", "sedan", "xl") else "Supply not ready")
             for c in CATEGORIES]
    flags += [
        FeatureFlag(key="zone.airport_surge", label="CCU Airport surge zone", scope="zone", enabled=True, note="Peak pricing enabled"),
        FeatureFlag(key="zone.newtown_night", label="New Town night ops", scope="zone", enabled=False, note="Pending safety review"),
        FeatureFlag(key="city.kolkata", label="Kolkata city operations", scope="city", enabled=True, note="Primary launch city"),
        FeatureFlag(key="city.howrah", label="Howrah expansion", scope="city", enabled=False, note="Phase 2"),
    ]
    await db.feature_flags.insert_many([f.model_dump() for f in flags])

    # passes
    passes = [
        SubscriptionPass(name="Daily Gold Pass", duration="daily", price=59, categories=["bike", "auto"],
                         fair_usage_rides=20, active_subscribers=412),
        SubscriptionPass(name="Weekly Zero-Commission", duration="weekly", price=349,
                         categories=["bike", "auto", "cab"], fair_usage_rides=120, active_subscribers=188),
        SubscriptionPass(name="Monthly Pro Partner", duration="monthly", price=1199,
                         categories=["cab", "sedan", "xl"], fair_usage_rides=520, active_subscribers=94),
    ]
    await db.subscription_passes.insert_many([p.model_dump() for p in passes])

    # drivers
    drivers = []
    for i in range(48):
        cat = random.choice(CATEGORIES[:5] + ["parcel"])
        zone = random.choice(list(ZONES))
        lat, lng = ZONES[zone]
        kyc = random.choices(["approved", "pending", "action_required", "rejected"], [66, 18, 10, 6])[0]
        online = kyc == "approved" and random.random() < 0.72
        d = Driver(
            name=f"{random.choice(FIRST)} {random.choice(LAST)}",
            phone=f"+9198{random.randint(10000000, 99999999)}",
            zone=zone, category=cat,
            vehicle_model=random.choice(VEHICLES[cat]),
            vehicle_number=f"WB{random.randint(1,99):02d}{random.choice('ABCDEFGHJK')}{random.choice('ABCDEFGHJK')}{random.randint(1000,9999)}",
            kyc_status=kyc, is_online=online, on_trip=online and random.random() < 0.45,
            rating=round(random.uniform(4.1, 5.0), 2),
            total_rides=random.randint(40, 3200),
            lifetime_earnings=round(random.uniform(18000, 640000), 2),
            commission_model=random.choices(["commission", "subscription"], [70, 30])[0],
            lat=round(lat + random.uniform(-0.022, 0.022), 6),
            lng=round(lng + random.uniform(-0.022, 0.022), 6),
            last_heartbeat=utcnow() if online else None,
            documents=[
                DriverDocument(type="Driving Licence", number=f"WB-{random.randint(10,99)}-{random.randint(100000,999999)}",
                               status="approved" if kyc == "approved" else "pending",
                               file_url=DOC_IMAGES["Driving Licence"],
                               uploaded_at=utcnow() - timedelta(days=random.randint(2, 90))),
                DriverDocument(type="Vehicle RC", number=f"RC{random.randint(100000,999999)}",
                               status="approved" if kyc == "approved" else "pending",
                               file_url=DOC_IMAGES["Vehicle RC"],
                               uploaded_at=utcnow() - timedelta(days=random.randint(2, 90))),
                DriverDocument(type="Insurance", number=f"INS{random.randint(100000,999999)}",
                               status="approved" if kyc == "approved" else "pending",
                               file_url=DOC_IMAGES["Insurance"],
                               uploaded_at=utcnow() - timedelta(days=random.randint(2, 90))),
                DriverDocument(type="Aadhaar", number=f"XXXX-XXXX-{random.randint(1000,9999)}",
                               status="approved" if kyc == "approved" else "pending",
                               file_url=DOC_IMAGES["Aadhaar"],
                               uploaded_at=utcnow() - timedelta(days=random.randint(2, 90))),
            ],
            flags=(["gps_anomaly"] if random.random() < 0.08 else []) + (["cash_dispute"] if random.random() < 0.06 else []),
            created_at=utcnow() - timedelta(days=random.randint(5, 400)),
        )
        drivers.append(d)
    await db.drivers.insert_many([d.model_dump() for d in drivers])
    approved_drivers = [d for d in drivers if d.kyc_status == "approved"]

    # riders
    riders = []
    for i in range(60):
        r = Rider(
            name=f"{random.choice(RIDER_FIRST)} {random.choice(LAST)}",
            phone=f"+9197{random.randint(10000000, 99999999)}",
            email=f"rider{i+1}@example.in",
            total_rides=random.randint(1, 380),
            wallet_balance=round(random.choice([0, 0, 120, 340, 780, 1000, 1500]) * random.uniform(0.6, 1.2), 2),
            promo_balance=round(random.choice([0, 0, 0, 50, 100, 250]), 2),
            cashback_balance=round(random.choice([0, 0, 25, 60, 140]), 2),
            status=random.choices(["active", "restricted", "blocked"], [88, 9, 3])[0],
            prepaid_only=random.random() < 0.1,
            created_at=utcnow() - timedelta(days=random.randint(1, 500)),
        )
        riders.append(r)
    await db.riders.insert_many([r.model_dump() for r in riders])

    # rides
    rides = []
    for i in range(420):
        cat = random.choice(CATEGORIES[:5] + ["parcel", "rentals"])
        state = random.choice(STATES_WEIGHTED)
        rider = random.choice(riders)
        driver = random.choice(approved_drivers) if state not in ("draft", "searching", "expired") else None
        pz, dz = random.sample(list(ZONES), 2)
        lat, lng = ZONES[pz]
        km = round(random.uniform(1.5, 24.0), 1)
        mins = int(km * random.uniform(2.4, 4.2))
        f = FARES[cat]
        surge = round(random.choices([1.0, 1.0, 1.2, 1.4, 1.7], [55, 20, 12, 8, 5])[0], 1)
        base, dist, timec = f[0], round(km * f[2], 2), round(mins * f[3], 2)
        wait = round(random.choice([0, 0, 0, 2, 5]) * f[4], 2)
        night = round((base + dist) * f[7] / 100, 2) if random.random() < 0.18 else 0.0
        surge_amt = round((base + dist) * (surge - 1), 2)
        added = round(random.choice([0, 0, 0, 0, 10, 20, 30]), 2)
        toll = round(random.choice([0, 0, 0, 0, 25, 45]), 2)
        disc = round(random.choice([0, 0, 0, 30, 50, 75]), 2)
        sub = max(f[1], base + dist + timec + wait + night + surge_amt + added + toll - disc)
        tax = round(sub * 0.05, 2)
        total = round(sub + tax, 2)
        comm_pct = COMMISSIONS[cat]
        zero_comm = driver is not None and driver.commission_model == "subscription"
        comm = 0.0 if zero_comm else round(total * comm_pct / 100, 2)
        earned = round(total - comm, 2) if state == "completed" else 0.0
        created = utcnow() - timedelta(minutes=random.randint(2, 1400) if i < 300 else random.randint(1440, 20000))
        if state in LIVE:
            created = utcnow() - timedelta(minutes=random.randint(1, 45))

        rides.append(Ride(
            code=f"WL{240000 + i}",
            rider_id=rider.id, rider_name=rider.name,
            driver_id=driver.id if driver else None,
            driver_name=driver.name if driver else None,
            category=cat, state=state, pickup=pz, drop=dz,
            pickup_lat=round(lat + random.uniform(-0.015, 0.015), 6),
            pickup_lng=round(lng + random.uniform(-0.015, 0.015), 6),
            distance_km=km, duration_min=mins,
            payment_method=random.choice(PAYMENTS),
            payment_status=("paid" if state == "completed" else "disputed" if state == "disputed" else "pending"),
            otp=f"{random.randint(1000, 9999)}",
            otp_verified=state in ("in_progress", "completed", "disputed"),
            fare=FareBreakup(base_fare=base, distance_charge=dist, time_charge=timec, waiting_charge=wait,
                             surge_amount=surge_amt, night_charge=night, rider_added_fare=added,
                             toll_parking=toll, discount=disc, tax=tax, total=total),
            commission=comm, driver_earning=earned,
            cancellation_reason="Rider cancelled after driver arrived" if state == "cancelled" else None,
            surge_multiplier=surge, created_at=created,
        ))
    await db.rides.insert_many([r.model_dump() for r in rides])

    # campaigns
    camps = [
        Campaign(name="Durga Puja Ride Fest", app="rider", type="festival", code="PUJO25", discount_type="percentage",
                 value=25, max_discount=150, categories=["cab", "sedan", "auto"], audience="all",
                 starts_on="2026-09-25", ends_on="2026-10-05", budget_cap=1200000, budget_used=418320,
                 redemptions=6142, status="active", payment_methods=["upi", "wallet"]),
        Campaign(name="New Year Midnight Saver", app="rider", type="seasonal", code="NY2026", discount_type="flat",
                 value=100, categories=["cab", "sedan", "xl"], audience="existing_users",
                 starts_on="2025-12-28", ends_on="2026-01-02", budget_cap=800000, budget_used=800000,
                 redemptions=7980, status="expired"),
        Campaign(name="First Ride Free Upto 120", app="rider", type="acquisition", code="WELCOME120",
                 discount_type="flat", value=120, categories=["bike", "auto", "cab"], audience="new_users",
                 starts_on="2026-01-01", ends_on="2026-12-31", budget_cap=2000000, budget_used=634500,
                 redemptions=5287, status="active"),
        Campaign(name="UPI Cashback Boost", app="rider", type="payment", code="UPI10", discount_type="cashback",
                 value=10, max_discount=50, audience="all", payment_methods=["upi"],
                 starts_on="2026-02-01", ends_on="2026-04-30", budget_cap=500000, budget_used=112400,
                 redemptions=2248, status="active"),
        Campaign(name="Late Night Park Street Promo", app="rider", type="time_based", code="NIGHT15",
                 discount_type="percentage", value=15, max_discount=80, zones=["Park Street", "Esplanade"],
                 starts_on="2026-03-01", ends_on="2026-06-30", budget_cap=300000, budget_used=48900,
                 redemptions=980, status="paused"),
        Campaign(name="Pujo Partner Bonus", app="driver", type="festival", discount_type="bonus", value=1500,
                 categories=["cab", "sedan", "auto"], starts_on="2026-09-25", ends_on="2026-10-05",
                 budget_cap=900000, budget_used=289000, redemptions=412, status="active"),
        Campaign(name="Complete 25 Rides Earn 900", app="driver", type="milestone", discount_type="bonus", value=900,
                 starts_on="2026-01-01", ends_on="2026-12-31", budget_cap=1500000, budget_used=712000,
                 redemptions=1188, status="active"),
        Campaign(name="Peak Hour Earning Boost", app="driver", type="incentive", discount_type="percentage", value=20,
                 categories=["bike", "auto"], starts_on="2026-02-15", ends_on="2026-05-15",
                 budget_cap=600000, budget_used=97500, redemptions=740, status="paused"),
        Campaign(name="Discounted Weekly Pass", app="driver", type="subscription", discount_type="flat", value=100,
                 starts_on="2026-04-01", ends_on="2026-04-30", budget_cap=250000, budget_used=0,
                 redemptions=0, status="draft"),
    ]
    for idx, c in enumerate(camps):
        c.created_at = utcnow() - timedelta(days=idx * 6 + 2)
    await db.campaigns.insert_many([c.model_dump() for c in camps])

    # ledger
    entries = []
    reasons_credit = [("Wallet recharge via UPI", "user_funded"), ("Promo credit — PUJO25", "promotional"),
                      ("Cashback — UPI10", "cashback"), ("Refund — cancelled ride", "user_funded"),
                      ("Wallet recharge via Card", "user_funded")]
    reasons_debit = [("Ride payment", "user_funded"), ("Ride payment (promo applied)", "promotional"),
                     ("Cashback redeemed on ride", "cashback"), ("Cancellation fee", "user_funded")]
    for i in range(240):
        owner = random.choice(riders)
        is_credit = random.random() < 0.5
        reason, pool = random.choice(reasons_credit if is_credit else reasons_debit)
        amt = round(random.choice([49, 100, 150, 250, 500, 1000]) * random.uniform(0.4, 1.1), 2)
        entries.append(LedgerEntry(
            owner_type="rider", owner_id=owner.id, owner_name=owner.name,
            entry_type="credit" if is_credit else "debit", pool=pool, amount=amt,
            balance_after=round(max(0.0, owner.wallet_balance + random.uniform(-200, 400)), 2),
            reason=reason, ref_id=random.choice(rides).code,
            created_at=utcnow() - timedelta(minutes=random.randint(5, 43200)),
        ))
    for i in range(60):
        d = random.choice(approved_drivers)
        is_credit = random.random() < 0.7
        entries.append(LedgerEntry(
            owner_type="driver", owner_id=d.id, owner_name=d.name,
            entry_type="credit" if is_credit else "debit", pool="user_funded",
            amount=round(random.uniform(120, 4200), 2),
            balance_after=round(random.uniform(200, 9000), 2),
            reason="Weekly payout settlement" if is_credit else "Commission deduction",
            ref_id=random.choice(rides).code,
            created_at=utcnow() - timedelta(minutes=random.randint(5, 43200)),
        ))
    await db.ledger.insert_many([e.model_dump() for e in entries])

    # sos
    sos_reasons = [("Rider pressed SOS — route deviation", "rider", "critical"),
                   ("Driver reported passenger altercation", "driver", "high"),
                   ("System detected impossible GPS jump", "system", "high"),
                   ("Rider pressed SOS — unsafe driving speed", "rider", "critical"),
                   ("System detected prolonged unscheduled stop", "system", "medium"),
                   ("Driver panic button — vehicle breakdown at night", "driver", "medium")]
    sos = []
    live_rides = [r for r in rides if r.driver_id]
    for i, (reason, src, sev) in enumerate(sos_reasons * 2):
        r = random.choice(live_rides)
        drv = next((d for d in drivers if d.id == r.driver_id), approved_drivers[0])
        rdr = next((x for x in riders if x.id == r.rider_id), riders[0])
        status = ["open", "open", "acknowledged", "escalated", "resolved", "resolved"][i % 6]
        sos.append(SosIncident(
            ride_id=r.id, ride_code=r.code, rider_name=rdr.name, rider_phone=rdr.phone,
            driver_name=drv.name, driver_phone=drv.phone, vehicle_number=drv.vehicle_number,
            trigger_source=src, reason=reason, lat=r.pickup_lat, lng=r.pickup_lng,
            location_label=r.pickup, severity=sev, status=status,
            action_history=["Auto-created from in-app SOS trigger"] if status == "open"
            else ["Auto-created from in-app SOS trigger", "Safety desk contacted rider"],
            created_at=utcnow() - timedelta(minutes=random.randint(3, 4000)),
        ))
    await db.sos_incidents.insert_many([s.model_dump() for s in sos])

    # audit logs
    logs = []
    samples = [("fare_config_update", "fare_config", "cab"), ("commission_update", "commission_config", "sedan"),
               ("kyc_approved", "driver", drivers[0].id), ("campaign_active", "campaign", camps[0].id),
               ("pass_created", "subscription_pass", passes[0].id), ("sos_escalated", "sos_incident", sos[3].id),
               ("ride_refund", "ride", rides[0].id), ("feature_flag_toggle", "feature_flag", "category.parcel"),
               ("rider_status_change", "rider", riders[0].id), ("ride_state_change", "ride", rides[5].id)]
    for i, (action, entity, eid) in enumerate(samples * 3):
        who = ADMINS[i % 3]
        logs.append(AuditLog(actor=who[2], actor_role=who[3], action=action, entity=entity, entity_id=eid,
                             details={"source": "admin_portal"},
                             created_at=utcnow() - timedelta(hours=i * 5 + 1)))
    await db.audit_logs.insert_many([lg.model_dump() for lg in logs])

    print(f"Seeded: {len(drivers)} drivers, {len(riders)} riders, {len(rides)} rides, "
          f"{len(camps)} campaigns, {len(entries)} ledger entries, {len(sos)} SOS, {len(logs)} audit logs")


if __name__ == "__main__":
    asyncio.run(main())
