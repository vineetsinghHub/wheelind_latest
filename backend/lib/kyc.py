"""KYC document helpers — expiry evaluation and driver-level KYC rollup."""

from datetime import timedelta, timezone
from typing import Any

from models.schemas import utcnow

# A document inside this window is flagged for renewal outreach.
EXPIRING_SOON_DAYS = 30

# Only these document types carry a validity date.
EXPIRING_TYPES = {"Driving Licence", "Insurance"}


def _aware(dt):
    """Motor hands back naive datetimes; BSON stored them as UTC."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def days_left(expires_on) -> int | None:
    exp = _aware(expires_on)
    if exp is None:
        return None
    return (exp - utcnow()).days


def expiry_status(expires_on) -> str | None:
    """None for documents that never expire, else expired | expiring_soon | valid."""
    left = days_left(expires_on)
    if left is None:
        return None
    if left < 0:
        return "expired"
    if left <= EXPIRING_SOON_DAYS:
        return "expiring_soon"
    return "valid"


def annotate_documents(driver: dict[str, Any]) -> dict[str, Any]:
    """Stamp each document with its server-computed expiry state. Never persisted."""
    for doc in driver.get("documents", []):
        doc["expiry_status"] = expiry_status(doc.get("expires_on"))
        doc["days_to_expiry"] = days_left(doc.get("expires_on"))
    return driver


def rollup_kyc_status(documents: list[dict[str, Any]], current: str) -> str:
    """Driver-level KYC derived from the individual documents.

    One rejected document puts the whole file into action_required rather than
    rejecting the partner outright — a reviewer rejects a *document*, not a person.
    """
    if not documents:
        return current
    statuses = [d.get("status") for d in documents]
    if any(s == "rejected" for s in statuses):
        return "action_required"
    if all(s == "approved" for s in statuses):
        return "approved"
    return "pending"


def expiry_window(days: int = EXPIRING_SOON_DAYS):
    return utcnow() + timedelta(days=days)
