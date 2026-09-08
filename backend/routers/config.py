from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_admin, log_action
from lib.db import db
from models.schemas import (
    AdminUser, CommissionConfig, CommissionUpdate, FareConfig, FareConfigUpdate, FeatureFlag,
    FlagToggle, SubscriptionPass, SubscriptionPassCreate, utcnow,
)

router = APIRouter(tags=["config"])


@router.get("/fare-configs", response_model=list[FareConfig])
async def list_fares(_: AdminUser = Depends(current_admin)):
    docs = await db.fare_configs.find({}).to_list(100)
    return [FareConfig(**d) for d in docs]


@router.put("/fare-configs/{category}", response_model=FareConfig)
async def update_fare(category: str, payload: FareConfigUpdate, admin: AdminUser = Depends(current_admin)):
    doc = await db.fare_configs.find_one({"category": category})
    if not doc:
        raise HTTPException(status_code=404, detail="Fare config not found for category")
    if payload.minimum_fare < payload.base_fare:
        raise HTTPException(status_code=422, detail="Minimum fare cannot be below base fare")
    update = payload.model_dump()
    update["version"] = int(doc.get("version", 1)) + 1
    update["updated_at"] = utcnow()
    await db.fare_configs.update_one({"category": category}, {"$set": update})
    await log_action(admin, "fare_config_update", "fare_config", category, {"version": update["version"]})
    return FareConfig(**(await db.fare_configs.find_one({"category": category})))


@router.get("/commission-configs", response_model=list[CommissionConfig])
async def list_commissions(_: AdminUser = Depends(current_admin)):
    docs = await db.commission_configs.find({}).to_list(100)
    return [CommissionConfig(**d) for d in docs]


@router.put("/commission-configs/{category}", response_model=CommissionConfig)
async def update_commission(category: str, payload: CommissionUpdate, admin: AdminUser = Depends(current_admin)):
    doc = await db.commission_configs.find_one({"category": category})
    if not doc:
        raise HTTPException(status_code=404, detail="Commission config not found")
    if not (0 <= payload.percentage <= 40):
        raise HTTPException(status_code=422, detail="Commission must be between 0 and 40 percent")
    await db.commission_configs.update_one(
        {"category": category},
        {"$set": {**payload.model_dump(), "updated_at": utcnow()}},
    )
    await log_action(admin, "commission_update", "commission_config", category, {"pct": payload.percentage})
    return CommissionConfig(**(await db.commission_configs.find_one({"category": category})))


@router.get("/passes", response_model=list[SubscriptionPass])
async def list_passes(_: AdminUser = Depends(current_admin)):
    docs = await db.subscription_passes.find({}).sort("created_at", -1).to_list(100)
    return [SubscriptionPass(**d) for d in docs]


@router.post("/passes", response_model=SubscriptionPass)
async def create_pass(payload: SubscriptionPassCreate, admin: AdminUser = Depends(current_admin)):
    if payload.price <= 0:
        raise HTTPException(status_code=422, detail="Pass price must be positive")
    if not payload.categories:
        raise HTTPException(status_code=422, detail="Select at least one eligible category")
    obj = SubscriptionPass(**payload.model_dump())
    await db.subscription_passes.insert_one(obj.model_dump())
    await log_action(admin, "pass_created", "subscription_pass", obj.id, {"name": obj.name})
    return obj


@router.patch("/passes/{pass_id}/toggle", response_model=SubscriptionPass)
async def toggle_pass(pass_id: str, admin: AdminUser = Depends(current_admin)):
    doc = await db.subscription_passes.find_one({"id": pass_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Pass not found")
    new_status = "paused" if doc["status"] == "active" else "active"
    await db.subscription_passes.update_one({"id": pass_id}, {"$set": {"status": new_status}})
    await log_action(admin, "pass_toggle", "subscription_pass", pass_id, {"status": new_status})
    return SubscriptionPass(**(await db.subscription_passes.find_one({"id": pass_id})))


@router.get("/feature-flags", response_model=list[FeatureFlag])
async def list_flags(_: AdminUser = Depends(current_admin)):
    docs = await db.feature_flags.find({}).to_list(200)
    return [FeatureFlag(**d) for d in docs]


@router.patch("/feature-flags/{key}", response_model=FeatureFlag)
async def toggle_flag(key: str, payload: FlagToggle, admin: AdminUser = Depends(current_admin)):
    doc = await db.feature_flags.find_one({"key": key})
    if not doc:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    await db.feature_flags.update_one({"key": key}, {"$set": {"enabled": payload.enabled}})
    await log_action(admin, "feature_flag_toggle", "feature_flag", key, {"enabled": payload.enabled})
    return FeatureFlag(**(await db.feature_flags.find_one({"key": key})))
