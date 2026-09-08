from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_admin, log_action
from lib.db import db
from lib.kyc import EXPIRING_SOON_DAYS, annotate_documents, expiry_status, days_left, rollup_kyc_status
from models.schemas import (
    AdminUser, DocumentAlert, DocumentDecision, DocumentReupload, Driver, DriverOnlineUpdate,
    KycDecision, Rider, RiderStatusUpdate, utcnow,
)

router = APIRouter(tags=["people"])


@router.get("/drivers", response_model=list[Driver])
async def list_drivers(
    kyc_status: Optional[str] = None,
    category: Optional[str] = None,
    online: Optional[bool] = None,
    doc_alert: Optional[str] = None,
    resubmitted: Optional[bool] = None,
    q: Optional[str] = None,
    _: AdminUser = Depends(current_admin),
):
    query: dict = {}
    if kyc_status:
        query["kyc_status"] = kyc_status
    if category:
        query["category"] = category
    if online is not None:
        query["is_online"] = online
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
            {"vehicle_number": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.drivers.find(query).sort("created_at", -1).to_list(500)
    drivers = [Driver(**annotate_documents(d)) for d in docs]

    # doc_alert filters on the server-computed expiry state, so it can't drift from the badges.
    if doc_alert in ("expired", "expiring_soon"):
        drivers = [d for d in drivers if any(doc.expiry_status == doc_alert for doc in d.documents)]
    elif doc_alert == "any":
        drivers = [
            d for d in drivers
            if any(doc.expiry_status in ("expired", "expiring_soon") for doc in d.documents)
        ]

    if resubmitted:
        drivers = [d for d in drivers if any(doc.resubmitted_at is not None for doc in d.documents)]
    return drivers


@router.get("/drivers/document-alerts", response_model=list[DocumentAlert])
async def document_alerts(
    window_days: int = EXPIRING_SOON_DAYS, _: AdminUser = Depends(current_admin)
):
    """Licences/insurance already expired or expiring inside the window, soonest first."""
    docs = await db.drivers.find({}).to_list(1000)
    alerts: list[DocumentAlert] = []
    for d in docs:
        for doc in d.get("documents", []):
            state = expiry_status(doc.get("expires_on"))
            if state not in ("expired", "expiring_soon"):
                continue
            left = days_left(doc.get("expires_on"))
            if left is None or left > window_days:
                continue
            alerts.append(DocumentAlert(
                driver_id=d["id"], driver_name=d["name"], phone=d["phone"],
                category=d["category"], zone=d["zone"], vehicle_number=d["vehicle_number"],
                doc_type=doc["type"], number=doc["number"], expires_on=doc["expires_on"],
                days_to_expiry=left, expiry_status=state,
            ))
    alerts.sort(key=lambda a: a.days_to_expiry)
    return alerts


@router.get("/drivers/{driver_id}", response_model=Driver)
async def get_driver(driver_id: str, _: AdminUser = Depends(current_admin)):
    doc = await db.drivers.find_one({"id": driver_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Driver not found")
    return Driver(**annotate_documents(doc))


@router.post("/drivers/{driver_id}/documents/{doc_type}/reupload", response_model=Driver)
async def reupload_document(
    driver_id: str, doc_type: str, payload: DocumentReupload, admin: AdminUser = Depends(current_admin)
):
    """Partner submits a fresh scan for a REJECTED document; it returns to the review queue.

    Only a rejected document can be replaced (409 otherwise). The old rejection reason is
    retained as `previous_reject_reason` so the next reviewer sees why it bounced.
    """
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    documents = list(driver.get("documents", []))
    target = next((d for d in documents if d["type"].lower() == doc_type.lower()), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Document '{doc_type}' not found for this driver")
    if target.get("status") != "rejected":
        raise HTTPException(
            status_code=409,
            detail="Only a rejected document can be re-uploaded — this one is "
                   f"{target.get('status')}",
        )

    now = utcnow()
    for d in documents:
        if d["type"].lower() == doc_type.lower():
            d["status"] = "pending"
            d["previous_reject_reason"] = d.get("reject_reason")
            d["reject_reason"] = None
            d["uploaded_at"] = now
            d["resubmitted_at"] = now
            d["version"] = int(d.get("version", 1)) + 1
            if payload.number:
                d["number"] = payload.number
            if payload.expires_on:
                d["expires_on"] = payload.expires_on
            if payload.file_url:
                d["file_url"] = payload.file_url

    new_kyc = rollup_kyc_status(documents, driver["kyc_status"])
    await db.drivers.update_one(
        {"id": driver_id}, {"$set": {"documents": documents, "kyc_status": new_kyc}}
    )
    await log_action(
        admin, "document_reuploaded", "driver", driver_id,
        {"document": target["type"], "kyc_status": new_kyc},
    )
    updated = await db.drivers.find_one({"id": driver_id})
    return Driver(**annotate_documents(updated))


@router.patch("/drivers/{driver_id}/documents/{doc_type}", response_model=Driver)
async def decide_document(
    driver_id: str, doc_type: str, payload: DocumentDecision, admin: AdminUser = Depends(current_admin)
):
    """Approve or reject ONE document. A rejection needs a reason and pulls the
    driver's file back to action_required rather than rejecting the partner."""
    driver = await db.drivers.find_one({"id": driver_id})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    documents = list(driver.get("documents", []))
    target = next((d for d in documents if d["type"].lower() == doc_type.lower()), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Document '{doc_type}' not found for this driver")
    if payload.status == "rejected" and not payload.reason.strip():
        raise HTTPException(status_code=422, detail="A rejection reason is required")

    for d in documents:
        if d["type"].lower() == doc_type.lower():
            d["status"] = payload.status
            d["reject_reason"] = payload.reason.strip() if payload.status == "rejected" else None

    new_kyc = rollup_kyc_status(documents, driver["kyc_status"])
    await db.drivers.update_one(
        {"id": driver_id}, {"$set": {"documents": documents, "kyc_status": new_kyc}}
    )
    await log_action(
        admin, f"document_{payload.status}", "driver", driver_id,
        {"document": target["type"], "reason": payload.reason, "kyc_status": new_kyc},
    )
    updated = await db.drivers.find_one({"id": driver_id})
    return Driver(**annotate_documents(updated))


@router.patch("/drivers/{driver_id}/kyc", response_model=Driver)
async def decide_kyc(driver_id: str, payload: KycDecision, admin: AdminUser = Depends(current_admin)):
    doc = await db.drivers.find_one({"id": driver_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Driver not found")
    doc_status = "approved" if payload.status == "approved" else "rejected" if payload.status == "rejected" else "pending"
    documents = [
        {**d, "status": doc_status, "reject_reason": payload.note if doc_status == "rejected" else None}
        for d in doc.get("documents", [])
    ]
    await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"kyc_status": payload.status, "documents": documents}},
    )
    await log_action(admin, f"kyc_{payload.status}", "driver", driver_id, {"note": payload.note})
    updated = await db.drivers.find_one({"id": driver_id})
    return Driver(**annotate_documents(updated))


@router.patch("/drivers/{driver_id}/online", response_model=Driver)
async def set_online(driver_id: str, payload: DriverOnlineUpdate, admin: AdminUser = Depends(current_admin)):
    doc = await db.drivers.find_one({"id": driver_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Driver not found")
    update = {"is_online": payload.is_online, "last_heartbeat": utcnow() if payload.is_online else None}
    if not payload.is_online:
        update["on_trip"] = False
    await db.drivers.update_one({"id": driver_id}, {"$set": update})
    await log_action(admin, "driver_availability", "driver", driver_id, {"is_online": payload.is_online})
    return Driver(**annotate_documents(await db.drivers.find_one({"id": driver_id})))


@router.get("/riders", response_model=list[Rider])
async def list_riders(q: Optional[str] = None, status: Optional[str] = None, _: AdminUser = Depends(current_admin)):
    query: dict = {}
    if status:
        query["status"] = status
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.riders.find(query).sort("created_at", -1).to_list(500)
    return [Rider(**d) for d in docs]


@router.patch("/riders/{rider_id}/status", response_model=Rider)
async def update_rider_status(rider_id: str, payload: RiderStatusUpdate, admin: AdminUser = Depends(current_admin)):
    doc = await db.riders.find_one({"id": rider_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Rider not found")
    await db.riders.update_one(
        {"id": rider_id}, {"$set": {"status": payload.status, "prepaid_only": payload.prepaid_only}}
    )
    await log_action(admin, "rider_status_change", "rider", rider_id, {"status": payload.status})
    return Rider(**(await db.riders.find_one({"id": rider_id})))
