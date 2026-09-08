"""Session auth for the Wheelind admin portal — httpOnly cookie, no tokens in JSON."""

import hashlib
import secrets
from datetime import timedelta
from typing import Optional

from fastapi import Cookie, HTTPException

from lib.db import db
from models.schemas import AdminUser, utcnow

COOKIE_NAME = "wl_session"
SESSION_DAYS = 7


def hash_password(password: str) -> str:
    return hashlib.sha256(f"wheelind::{password}".encode()).hexdigest()


async def create_session(admin_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await db.admin_sessions.insert_one(
        {
            "token": token,
            "admin_id": admin_id,
            "created_at": utcnow(),
            "expires_at": utcnow() + timedelta(days=SESSION_DAYS),
        }
    )
    return token


async def destroy_session(token: str) -> None:
    await db.admin_sessions.delete_one({"token": token})


async def current_admin(wl_session: Optional[str] = Cookie(default=None)) -> AdminUser:
    if not wl_session:
        raise HTTPException(status_code=401, detail="not authenticated")
    session = await db.admin_sessions.find_one({"token": wl_session})
    if not session:
        raise HTTPException(status_code=401, detail="session expired")
    doc = await db.admins.find_one({"id": session["admin_id"]})
    if not doc:
        raise HTTPException(status_code=401, detail="admin not found")
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return AdminUser(**doc)


async def log_action(admin: AdminUser, action: str, entity: str, entity_id: str, details: dict | None = None) -> None:
    from models.schemas import AuditLog

    entry = AuditLog(
        actor=admin.name,
        actor_role=admin.role,
        action=action,
        entity=entity,
        entity_id=entity_id,
        details=details or {},
    )
    await db.audit_logs.insert_one(entry.model_dump())
