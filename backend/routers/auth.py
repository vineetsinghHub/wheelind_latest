from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from typing import Optional

from lib.auth import COOKIE_NAME, SESSION_DAYS, create_session, current_admin, destroy_session, hash_password
from lib.db import db
from models.schemas import AdminUser, LoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AdminUser)
async def login(payload: LoginRequest, response: Response):
    doc = await db.admins.find_one({"email": payload.email.lower()})
    if not doc or doc.get("password_hash") != hash_password(payload.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = await create_session(doc["id"])
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=SESSION_DAYS * 86400,
        path="/",
    )
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return AdminUser(**doc)


@router.get("/me", response_model=AdminUser)
async def me(admin: AdminUser = Depends(current_admin)):
    return admin


@router.post("/logout")
async def logout(response: Response, wl_session: Optional[str] = Cookie(default=None)):
    if wl_session:
        await destroy_session(wl_session)
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/permissions")
async def my_permissions(admin: AdminUser = Depends(current_admin)):
    """Drives the admin UI and mirrors exactly what the server enforces."""
    from lib.rbac import permissions_for

    return {"role": admin.role, "permissions": permissions_for(admin.role)}
