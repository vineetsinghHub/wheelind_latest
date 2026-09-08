from datetime import timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends

from lib.auth import current_admin
from lib.db import db
from models.schemas import AdminUser, LedgerEntry, WalletSummary, utcnow

router = APIRouter(tags=["wallet"])


@router.get("/wallet/ledger", response_model=WalletSummary)
async def wallet_ledger(
    pool: Optional[str] = None,
    owner_type: Optional[str] = None,
    entry_type: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 100,
    _: AdminUser = Depends(current_admin),
):
    query: dict = {}
    if pool:
        query["pool"] = pool
    if owner_type:
        query["owner_type"] = owner_type
    if entry_type:
        query["entry_type"] = entry_type
    if q:
        query["owner_name"] = {"$regex": q, "$options": "i"}

    total = await db.ledger.count_documents(query)
    docs = await db.ledger.find(query).sort("created_at", -1).limit(min(limit, 300)).to_list(300)

    riders = await db.riders.find({}).to_list(2000)
    user_funded = sum(float(r.get("wallet_balance", 0)) for r in riders)
    promotional = sum(float(r.get("promo_balance", 0)) for r in riders)
    cashback = sum(float(r.get("cashback_balance", 0)) for r in riders)

    since = utcnow() - timedelta(days=30)
    recent = await db.ledger.find({}).to_list(5000)
    credits = sum(float(e["amount"]) for e in recent if e["entry_type"] == "credit" and _aware(e["created_at"]) >= since)
    debits = sum(float(e["amount"]) for e in recent if e["entry_type"] == "debit" and _aware(e["created_at"]) >= since)

    return WalletSummary(
        user_funded_total=round(user_funded, 2),
        promotional_total=round(promotional, 2),
        cashback_total=round(cashback, 2),
        credits_30d=round(credits, 2),
        debits_30d=round(debits, 2),
        entries=[LedgerEntry(**d) for d in docs],
        total_entries=total,
    )


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
