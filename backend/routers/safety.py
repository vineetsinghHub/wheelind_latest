from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_admin, log_action
from lib.db import db
from models.schemas import AdminUser, AuditLog, AuditLogList, SosAction, SosIncident, utcnow

router = APIRouter(tags=["safety"])


@router.get("/sos", response_model=list[SosIncident])
async def list_sos(status: Optional[str] = None, _: AdminUser = Depends(current_admin)):
    query = {"status": status} if status else {}
    docs = await db.sos_incidents.find(query).sort("created_at", -1).to_list(200)
    return [SosIncident(**d) for d in docs]


@router.patch("/sos/{incident_id}", response_model=SosIncident)
async def act_on_sos(incident_id: str, payload: SosAction, admin: AdminUser = Depends(current_admin)):
    doc = await db.sos_incidents.find_one({"id": incident_id})
    if not doc:
        raise HTTPException(status_code=404, detail="SOS incident not found")
    if doc["status"] == "resolved":
        raise HTTPException(status_code=409, detail="Incident already resolved")
    stamp = utcnow().strftime("%d %b %H:%M")
    history = list(doc.get("action_history", []))
    history.append(f"{stamp} — {admin.name} marked {payload.status}. {payload.note}".strip())
    await db.sos_incidents.update_one(
        {"id": incident_id}, {"$set": {"status": payload.status, "action_history": history}}
    )
    await log_action(admin, f"sos_{payload.status}", "sos_incident", incident_id, {"note": payload.note})
    return SosIncident(**(await db.sos_incidents.find_one({"id": incident_id})))


@router.get("/audit-logs", response_model=AuditLogList)
async def list_audit(
    entity: Optional[str] = None, q: Optional[str] = None, limit: int = 100, _: AdminUser = Depends(current_admin)
):
    query: dict = {}
    if entity:
        query["entity"] = entity
    if q:
        query["$or"] = [
            {"actor": {"$regex": q, "$options": "i"}},
            {"action": {"$regex": q, "$options": "i"}},
        ]
    total = await db.audit_logs.count_documents(query)
    docs = await db.audit_logs.find(query).sort("created_at", -1).limit(min(limit, 300)).to_list(300)
    return AuditLogList(items=[AuditLog(**d) for d in docs], total=total)
