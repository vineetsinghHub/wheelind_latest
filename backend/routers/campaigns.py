from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_admin, log_action
from lib.db import db
from models.schemas import AdminUser, Campaign, CampaignCreate, CampaignStatusUpdate

router = APIRouter(tags=["campaigns"])


@router.get("/campaigns", response_model=list[Campaign])
async def list_campaigns(
    app: Optional[str] = None, status: Optional[str] = None, _: AdminUser = Depends(current_admin)
):
    query: dict = {}
    if app:
        query["app"] = app
    if status:
        query["status"] = status
    docs = await db.campaigns.find(query).sort("created_at", -1).to_list(300)
    return [Campaign(**d) for d in docs]


@router.post("/campaigns", response_model=Campaign)
async def create_campaign(payload: CampaignCreate, admin: AdminUser = Depends(current_admin)):
    if payload.budget_cap <= 0:
        raise HTTPException(status_code=422, detail="Budget cap must be positive")
    if payload.value <= 0:
        raise HTTPException(status_code=422, detail="Offer value must be positive")
    if payload.ends_on < payload.starts_on:
        raise HTTPException(status_code=422, detail="End date must be after start date")
    if payload.discount_type == "percentage" and payload.value > 100:
        raise HTTPException(status_code=422, detail="Percentage discount cannot exceed 100")
    obj = Campaign(**payload.model_dump(), status="draft")
    await db.campaigns.insert_one(obj.model_dump())
    await log_action(admin, "campaign_created", "campaign", obj.id, {"name": obj.name, "app": obj.app})
    return obj


@router.patch("/campaigns/{campaign_id}/status", response_model=Campaign)
async def set_campaign_status(
    campaign_id: str, payload: CampaignStatusUpdate, admin: AdminUser = Depends(current_admin)
):
    doc = await db.campaigns.find_one({"id": campaign_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if doc["status"] == "expired":
        raise HTTPException(status_code=409, detail="Expired campaigns cannot be reactivated")
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$set": {"status": payload.status, "version": int(doc.get("version", 1)) + 1}},
    )
    await log_action(admin, f"campaign_{payload.status}", "campaign", campaign_id, {"name": doc["name"]})
    return Campaign(**(await db.campaigns.find_one({"id": campaign_id})))
