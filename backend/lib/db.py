"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, GEOSPHERE, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "admins": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("email", ASCENDING)], name="email", unique=True),
    ],
    "admin_sessions": [
        IndexModel([("token", ASCENDING)], name="token", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "drivers": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("kyc_status", ASCENDING), ("created_at", DESCENDING)], name="kyc_created"),
        IndexModel([("is_online", ASCENDING)], name="online"),
        IndexModel([("category", ASCENDING)], name="category"),
        # Geospatial dispatch: $geoNear on GeoJSON `location` requires a 2dsphere index.
        IndexModel([("location", GEOSPHERE)], name="location_2dsphere"),
    ],
    "riders": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("phone", ASCENDING)], name="phone"),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "rider_sessions": [
        IndexModel([("token", ASCENDING)], name="token", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "rider_otps": [
        IndexModel([("phone", ASCENDING)], name="phone"),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "trip_shares": [
        IndexModel([("token", ASCENDING)], name="token", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "rides": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("code", ASCENDING)], name="code", unique=True),
        IndexModel([("state", ASCENDING), ("created_at", DESCENDING)], name="state_created"),
        IndexModel([("category", ASCENDING), ("created_at", DESCENDING)], name="category_created"),
    ],
    "fare_configs": [IndexModel([("category", ASCENDING)], name="category", unique=True)],
    "commission_configs": [IndexModel([("category", ASCENDING)], name="category", unique=True)],
    "subscription_passes": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "feature_flags": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
    "campaigns": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("app", ASCENDING), ("created_at", DESCENDING)], name="app_created"),
    ],
    "ledger": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("owner_type", ASCENDING), ("created_at", DESCENDING)], name="owner_created"),
        IndexModel([("pool", ASCENDING)], name="pool"),
    ],
    "sos_incidents": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
    ],
    "audit_logs": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    # ---- driver app + dispatch + ops ----
    "driver_sessions": [
        IndexModel([("token", ASCENDING)], name="token", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "driver_otps": [
        IndexModel([("phone", ASCENDING)], name="phone"),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "ride_offers": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("ride_id", ASCENDING), ("state", ASCENDING)], name="ride_state"),
        IndexModel([("driver_id", ASCENDING), ("state", ASCENDING)], name="driver_state"),
        IndexModel([("state", ASCENDING), ("expires_at", ASCENDING)], name="state_expiry"),
    ],
    "driver_ledger": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("driver_id", ASCENDING), ("created_at", DESCENDING)], name="driver_created"),
        IndexModel([("kind", ASCENDING)], name="kind"),
    ],
    "driver_passes": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("driver_id", ASCENDING), ("status", ASCENDING)], name="driver_status"),
        IndexModel([("expires_at", ASCENDING)], name="expiry"),
    ],
    "payout_accounts": [IndexModel([("driver_id", ASCENDING)], name="driver", unique=True)],
    "payout_runs": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "support_cases": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
        IndexModel([("driver_id", ASCENDING)], name="driver"),
        IndexModel([("rider_id", ASCENDING)], name="rider"),
    ],
    "fraud_flags": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
    ],
    "saved_places": [IndexModel([("rider_id", ASCENDING)], name="rider")],
    "emergency_contacts": [IndexModel([("rider_id", ASCENDING)], name="rider")],
    "cron_runs": [IndexModel([("job", ASCENDING), ("run_id", ASCENDING)], name="job_run", unique=True)],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
