"""Driver-app auth — Bearer tokens, because the driver client is a native mobile app.

Riders and admins use httpOnly cookies (browser); the driver app stores the token in
secure device storage and sends `Authorization: Bearer <token>`.
"""

import secrets
from datetime import timedelta
from typing import Optional

from fastapi import Header, HTTPException

from lib.db import db
from models.schemas import Driver, utcnow

SESSION_DAYS = 60
OTP_TTL_SEC = 300


async def create_driver_session(driver_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await db.driver_sessions.insert_one(
        {
            "token": token,
            "driver_id": driver_id,
            "created_at": utcnow(),
            "expires_at": utcnow() + timedelta(days=SESSION_DAYS),
        }
    )
    return token


async def destroy_driver_session(token: str) -> None:
    await db.driver_sessions.delete_one({"token": token})


def _bearer(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to the Wheelind partner app")
    return authorization.split(" ", 1)[1].strip()


async def current_driver(authorization: Optional[str] = Header(default=None)) -> Driver:
    token = _bearer(authorization)
    session = await db.driver_sessions.find_one({"token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Session expired, please sign in again")
    doc = await db.drivers.find_one({"id": session["driver_id"]})
    if not doc:
        raise HTTPException(status_code=401, detail="Partner account not found")
    if "suspended" in (doc.get("flags") or []):
        raise HTTPException(status_code=403, detail="Your account is suspended. Contact partner support.")
    doc.pop("_id", None)
    return Driver(**doc)


async def approved_driver(authorization: Optional[str] = Header(default=None)) -> Driver:
    """For anything that touches money or trips — KYC must be cleared first."""
    driver = await current_driver(authorization)
    if driver.kyc_status != "approved":
        raise HTTPException(status_code=403, detail="Your KYC is not approved yet")
    return driver
