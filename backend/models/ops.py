"""Ops models: support cases, payouts, finance, fraud flags, rider extras.

Mirrors live in frontend/src/lib/opsTypes.ts.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from models.schemas import _uuid, utcnow


# ---------- support / disputes ----------
class CaseMessage(BaseModel):
    author: str
    author_role: str
    body: str
    created_at: datetime = Field(default_factory=utcnow)


class SupportCase(BaseModel):
    id: str = Field(default_factory=_uuid)
    reference: str
    kind: Literal["fare_dispute", "cash_unpaid", "cancellation_review", "fraud_review", "refund_request", "other"]
    subject: str
    detail: str
    raised_by: Literal["rider", "driver", "admin", "system"]
    rider_id: Optional[str] = None
    rider_name: Optional[str] = None
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    ride_id: Optional[str] = None
    ride_code: Optional[str] = None
    amount_claimed: float = 0
    status: Literal["open", "in_review", "resolved", "rejected"] = "open"
    resolution: Optional[str] = None
    refund_amount: float = 0
    penalty_amount: float = 0
    assignee: Optional[str] = None
    messages: list[CaseMessage] = []
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class SupportCaseCreate(BaseModel):
    kind: Literal["fare_dispute", "cash_unpaid", "cancellation_review", "fraud_review", "refund_request", "other"]
    subject: str
    detail: str = ""
    ride_id: Optional[str] = None
    amount_claimed: float = Field(default=0, ge=0, le=100000)


class SupportCaseUpdate(BaseModel):
    status: Literal["open", "in_review", "resolved", "rejected"]
    resolution: str = ""
    refund_amount: float = Field(default=0, ge=0, le=100000)
    penalty_amount: float = Field(default=0, ge=0, le=100000)
    assignee: Optional[str] = None


class SupportCaseList(BaseModel):
    items: list[SupportCase]
    total: int
    open_count: int


class CaseNote(BaseModel):
    body: str


# ---------- fraud ----------
class FraudFlag(BaseModel):
    id: str
    entity_type: Literal["driver", "rider"]
    entity_id: str
    entity_name: str
    kind: str
    detail: str
    severity: Literal["low", "medium", "high"]
    ride_code: Optional[str] = None
    status: Literal["open", "cleared", "actioned"]
    created_at: datetime


class FraudDecision(BaseModel):
    status: Literal["cleared", "actioned"]
    note: str = ""
    suspend: bool = False


# ---------- payouts ----------
class PayoutItem(BaseModel):
    driver_id: str
    driver_name: str
    phone: str
    method: str = "upi"
    destination: str = "-"
    rides: int = 0
    amount: float = 0
    status: Literal["pending", "paid", "failed"] = "pending"


class PayoutRun(BaseModel):
    id: str = Field(default_factory=_uuid)
    reference: str
    period_start: datetime
    period_end: datetime
    driver_count: int
    total_amount: float
    status: Literal["draft", "processing", "paid", "failed"] = "draft"
    items: list[PayoutItem] = []
    created_by: str
    created_at: datetime = Field(default_factory=utcnow)
    processed_at: Optional[datetime] = None
    note: str = ""


class PayoutRunCreate(BaseModel):
    days: int = Field(default=7, ge=1, le=90)
    minimum_amount: float = Field(default=100, ge=0, le=100000)
    note: str = ""


class PayoutRunList(BaseModel):
    items: list[PayoutRun]
    total: int
    pending_amount: float


class PendingPayout(BaseModel):
    driver_id: str
    driver_name: str
    phone: str
    category: str
    payout_balance: float
    method: str
    destination: str
    account_verified: bool
    last_payout_at: Optional[datetime] = None


# ---------- finance ----------
class FinanceSummary(BaseModel):
    window_days: int
    rides_completed: int
    gross_fares: float
    discounts: float
    taxes_collected: float
    tolls: float
    platform_commission: float
    driver_earnings: float
    pass_revenue: float
    refunds: float
    penalties: float
    net_revenue: float
    payouts_paid: float
    payouts_pending: float
    zero_commission_rides: int
    commission_rides: int


class InvoiceLine(BaseModel):
    label: str
    amount: float


class Invoice(BaseModel):
    invoice_no: str
    ride_code: str
    issued_on: datetime
    rider_name: str
    driver_name: Optional[str] = None
    vehicle_number: Optional[str] = None
    category: str
    pickup: str
    drop: str
    distance_km: float
    duration_min: int
    lines: list[InvoiceLine]
    subtotal: float
    tax_pct: float
    tax_amount: float
    total: float
    payment_method: str
    payment_status: str
    gstin: str = "19WHEEL0000A1Z5"
    place_of_supply: str = "West Bengal (19)"


# ---------- rider extras ----------
class SavedPlace(BaseModel):
    id: str = Field(default_factory=_uuid)
    rider_id: str
    label: str
    name: str
    area: str
    lat: float
    lng: float
    created_at: datetime = Field(default_factory=utcnow)


class SavedPlaceCreate(BaseModel):
    label: str
    name: str
    area: str = ""
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class EmergencyContact(BaseModel):
    id: str = Field(default_factory=_uuid)
    rider_id: str
    name: str
    phone: str
    relation: str = "family"
    created_at: datetime = Field(default_factory=utcnow)


class EmergencyContactCreate(BaseModel):
    name: str
    phone: str
    relation: str = "family"


class RiderProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


# ---------- dispatch monitor ----------
class DispatchOffer(BaseModel):
    id: str
    ride_id: str
    ride_code: str
    driver_id: str
    driver_name: str
    state: str
    distance_m: float
    fare_total: float
    created_at: datetime
    expires_at: datetime
    decline_reason: Optional[str] = None


class SweepResult(BaseModel):
    offers_expired: int
    searches_expired: int
    drivers_taken_offline: int
    scheduled_released: int
    offers_created: int
    ran_at: datetime


class DispatchBoard(BaseModel):
    searching_rides: int
    live_offers: int
    online_drivers: int
    stale_presence: int
    avg_wait_sec: float
    offers: list[DispatchOffer]
