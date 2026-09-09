"""Finance: P&L, payout runs, GST invoices and CSV exports (§12, P1 backlog)."""

import csv
import io
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from lib.auth import current_admin, log_action
from lib.db import db
from lib.earnings import driver_entry
from lib.rbac import require
from models.ops import (
    FinanceSummary, Invoice, InvoiceLine, PayoutItem, PayoutRun, PayoutRunCreate, PayoutRunList,
    PendingPayout,
)
from models.schemas import AdminUser, utcnow

router = APIRouter(tags=["finance"])


def _r(v) -> float:
    return round(float(v or 0) + 1e-9, 2)


def _aware(dt):
    return dt if getattr(dt, "tzinfo", None) else dt.replace(tzinfo=utcnow().tzinfo)


# ---------------- P&L ----------------
@router.get("/finance/summary", response_model=FinanceSummary)
async def summary(days: int = Query(30, ge=1, le=365), _: AdminUser = Depends(current_admin)):
    since = utcnow() - timedelta(days=days)
    rides = await db.rides.find({"state": "completed", "created_at": {"$gte": since}}).to_list(5000)

    gross = sum(_r(r["fare"]["total"]) for r in rides)
    discounts = sum(_r(r["fare"].get("discount")) for r in rides)
    taxes = sum(_r(r["fare"].get("tax")) for r in rides)
    tolls = sum(_r(r["fare"].get("toll_parking")) for r in rides)
    commission = sum(_r(r.get("commission")) for r in rides)
    driver_earnings = sum(_r(r.get("driver_earning")) for r in rides)
    zero = sum(1 for r in rides if r.get("zero_commission"))

    passes = await db.driver_passes.find({"starts_at": {"$gte": since}}).to_list(2000)
    pass_revenue = sum(_r(p["price"]) for p in passes)

    refunds = await db.ledger.find({"entry_type": "credit", "created_at": {"$gte": since}}).to_list(5000)
    refund_total = sum(_r(e["amount"]) for e in refunds if "refund" in e["reason"].lower())

    ledger = await db.driver_ledger.find({"created_at": {"$gte": since}}).to_list(5000)
    penalties = sum(_r(e["amount"]) for e in ledger if e["kind"] == "penalty")
    payouts_paid = sum(_r(e["amount"]) for e in ledger if e["kind"] == "payout")
    pending = await db.drivers.find({"payout_balance": {"$gt": 0}}).to_list(3000)

    return FinanceSummary(
        window_days=days,
        rides_completed=len(rides),
        gross_fares=_r(gross),
        discounts=_r(discounts),
        taxes_collected=_r(taxes),
        tolls=_r(tolls),
        platform_commission=_r(commission),
        driver_earnings=_r(driver_earnings),
        pass_revenue=_r(pass_revenue),
        refunds=_r(refund_total),
        penalties=_r(penalties),
        net_revenue=_r(commission + pass_revenue + penalties - refund_total),
        payouts_paid=_r(payouts_paid),
        payouts_pending=_r(sum(_r(d.get("payout_balance")) for d in pending)),
        zero_commission_rides=zero,
        commission_rides=len(rides) - zero,
    )


# ---------------- payouts ----------------
@router.get("/payouts/pending", response_model=list[PendingPayout])
async def pending_payouts(minimum: float = Query(0, ge=0), _: AdminUser = Depends(current_admin)):
    drivers = await db.drivers.find({"payout_balance": {"$gt": minimum}}).sort("payout_balance", -1).to_list(500)
    out = []
    for d in drivers:
        acc = await db.payout_accounts.find_one({"driver_id": d["id"]}) or {}
        last = await db.driver_ledger.find_one(
            {"driver_id": d["id"], "kind": "payout"}, sort=[("created_at", -1)]
        )
        out.append(PendingPayout(
            driver_id=d["id"], driver_name=d["name"], phone=d["phone"], category=d["category"],
            payout_balance=_r(d.get("payout_balance")),
            method=acc.get("method", "unset"),
            destination=acc.get("upi_id") or acc.get("account_number") or "—",
            account_verified=bool(acc.get("verified")),
            last_payout_at=_aware(last["created_at"]) if last else None,
        ))
    return out


@router.post("/payouts/runs", response_model=PayoutRun)
async def create_run(payload: PayoutRunCreate, admin: AdminUser = Depends(require("payouts.write"))):
    drivers = await db.drivers.find({"payout_balance": {"$gte": payload.minimum_amount}}).to_list(500)
    if not drivers:
        raise HTTPException(status_code=409, detail="No partner is above the minimum payout amount")

    period_start = utcnow() - timedelta(days=payload.days)
    items: list[PayoutItem] = []
    for d in drivers:
        acc = await db.payout_accounts.find_one({"driver_id": d["id"]}) or {}
        rides = await db.rides.count_documents({
            "driver_id": d["id"], "state": "completed", "created_at": {"$gte": period_start},
        })
        items.append(PayoutItem(
            driver_id=d["id"], driver_name=d["name"], phone=d["phone"],
            method=acc.get("method", "unset"),
            destination=acc.get("upi_id") or acc.get("account_number") or "—",
            rides=rides, amount=_r(d.get("payout_balance")),
        ))

    count = await db.payout_runs.count_documents({})
    run = PayoutRun(
        reference=f"PR{5000 + count + 1}",
        period_start=period_start, period_end=utcnow(),
        driver_count=len(items), total_amount=_r(sum(i.amount for i in items)),
        status="draft", items=items, created_by=admin.name, note=payload.note,
    )
    await db.payout_runs.insert_one(run.model_dump())
    await log_action(admin, "payout_run_created", "payout_run", run.id,
                     {"drivers": run.driver_count, "amount": run.total_amount})
    return run


@router.get("/payouts/runs", response_model=PayoutRunList)
async def list_runs(_: AdminUser = Depends(current_admin), limit: int = Query(30, ge=1, le=100)):
    docs = await db.payout_runs.find({}).sort("created_at", -1).to_list(limit)
    for d in docs:
        d.pop("_id", None)
    pending = await db.drivers.find({"payout_balance": {"$gt": 0}}).to_list(2000)
    return PayoutRunList(
        items=[PayoutRun(**d) for d in docs],
        total=await db.payout_runs.count_documents({}),
        pending_amount=_r(sum(_r(d.get("payout_balance")) for d in pending)),
    )


@router.get("/payouts/runs/{run_id}", response_model=PayoutRun)
async def get_run(run_id: str, _: AdminUser = Depends(current_admin)):
    doc = await db.payout_runs.find_one({"id": run_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Payout run not found")
    doc.pop("_id", None)
    return PayoutRun(**doc)


@router.post("/payouts/runs/{run_id}/process", response_model=PayoutRun)
async def process_run(run_id: str, admin: AdminUser = Depends(require("payouts.write"))):
    """Settles the run: debits each partner's payout balance and writes the ledger line.

    The bank/UPI transfer itself is MOCKED — no gateway is wired.
    """
    doc = await db.payout_runs.find_one({"id": run_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Payout run not found")
    if doc["status"] == "paid":
        raise HTTPException(status_code=409, detail="This run has already been processed")

    items = []
    for item in doc["items"]:
        driver = await db.drivers.find_one({"id": item["driver_id"]})
        if not driver or _r(driver.get("payout_balance")) <= 0:
            items.append({**item, "status": "failed"})
            continue
        amount = min(_r(item["amount"]), _r(driver.get("payout_balance")))
        await driver_entry(
            driver, amount=amount, entry_type="debit", kind="payout",
            reason=f"Payout {doc['reference']} via {item['method']}", ref_id=doc["reference"],
        )
        items.append({**item, "amount": amount, "status": "paid"})

    paid_total = _r(sum(i["amount"] for i in items if i["status"] == "paid"))
    await db.payout_runs.update_one({"id": run_id}, {"$set": {
        "status": "paid", "items": items, "processed_at": utcnow(), "total_amount": paid_total,
    }})
    await log_action(admin, "payout_run_processed", "payout_run", run_id, {"amount": paid_total})
    fresh = await db.payout_runs.find_one({"id": run_id})
    fresh.pop("_id", None)
    return PayoutRun(**fresh)


# ---------------- invoices ----------------
async def _invoice(ride: dict) -> Invoice:
    fare = ride["fare"]
    lines = [
        InvoiceLine(label="Base fare", amount=_r(fare["base_fare"])),
        InvoiceLine(label=f"Distance ({_r(ride.get('distance_km'))} km)", amount=_r(fare["distance_charge"])),
        InvoiceLine(label=f"Time ({ride.get('duration_min', 0)} min)", amount=_r(fare["time_charge"])),
    ]
    for label, key in [("Waiting", "waiting_charge"), ("Surge", "surge_amount"),
                       ("Night charge", "night_charge"), ("Rider added fare", "rider_added_fare"),
                       ("Toll / parking", "toll_parking")]:
        if _r(fare.get(key)) > 0:
            lines.append(InvoiceLine(label=label, amount=_r(fare[key])))
    if _r(fare.get("discount")) > 0:
        lines.append(InvoiceLine(label=f"Discount {ride.get('promo_code') or ''}".strip(),
                                 amount=-_r(fare["discount"])))

    cfg = await db.fare_configs.find_one({"category": ride["category"]}) or {}
    driver = await db.drivers.find_one({"id": ride["driver_id"]}) if ride.get("driver_id") else None
    subtotal = _r(sum(line.amount for line in lines))
    return Invoice(
        invoice_no=f"WL/{utcnow().year}/{ride['code']}",
        ride_code=ride["code"], issued_on=_aware(ride["created_at"]),
        rider_name=ride["rider_name"], driver_name=ride.get("driver_name"),
        vehicle_number=driver["vehicle_number"] if driver else None,
        category=ride["category"], pickup=ride["pickup"], drop=ride["drop"],
        distance_km=_r(ride.get("distance_km")), duration_min=int(ride.get("duration_min", 0)),
        lines=lines, subtotal=subtotal,
        tax_pct=_r(cfg.get("tax_pct", 5)), tax_amount=_r(fare.get("tax")),
        total=_r(fare["total"]),
        payment_method=ride["payment_method"], payment_status=ride["payment_status"],
    )


@router.get("/rides/{ride_id}/invoice", response_model=Invoice)
async def ride_invoice(ride_id: str, _: AdminUser = Depends(current_admin)):
    ride = await db.rides.find_one({"id": ride_id})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    return await _invoice(ride)


# ---------------- CSV exports ----------------
def _csv(rows: list[list], header: list[str], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/finance/export/rides")
async def export_rides(
    days: int = Query(30, ge=1, le=365),
    state: Optional[str] = None,
    _: AdminUser = Depends(current_admin),
):
    query: dict = {"created_at": {"$gte": utcnow() - timedelta(days=days)}}
    if state:
        query["state"] = state
    docs = await db.rides.find(query).sort("created_at", -1).to_list(5000)
    rows = [[
        d["code"], _aware(d["created_at"]).isoformat(), d["state"], d["category"],
        d["rider_name"], d.get("driver_name") or "", d.get("distance_km", 0),
        _r(d["fare"]["total"]), _r(d["fare"].get("discount")), _r(d["fare"].get("tax")),
        _r(d.get("commission")), _r(d.get("driver_earning")),
        d["payment_method"], d["payment_status"], d.get("promo_code") or "",
    ] for d in docs]
    return _csv(rows, [
        "code", "created_at", "state", "category", "rider", "driver", "distance_km",
        "total", "discount", "tax", "commission", "driver_earning",
        "payment_method", "payment_status", "promo",
    ], f"wheelind-rides-{days}d.csv")


@router.get("/finance/export/payouts")
async def export_payouts(days: int = Query(30, ge=1, le=365), _: AdminUser = Depends(current_admin)):
    docs = await db.driver_ledger.find({
        "created_at": {"$gte": utcnow() - timedelta(days=days)},
    }).sort("created_at", -1).to_list(5000)
    rows = [[
        _aware(d["created_at"]).isoformat(), d["driver_name"], d["kind"], d["entry_type"],
        _r(d["amount"]), _r(d["balance_after"]), d["reason"], d.get("ref_id") or "",
    ] for d in docs]
    return _csv(rows, [
        "created_at", "driver", "kind", "entry_type", "amount", "balance_after", "reason", "ref",
    ], f"wheelind-driver-ledger-{days}d.csv")
