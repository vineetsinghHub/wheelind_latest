"""Pydantic v2 models for Wheelind admin API. Mirrored by frontend/src/lib/types.ts."""

import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field

SERVICE_CATEGORIES = ["bike", "auto", "cab", "sedan", "xl", "rentals", "outstation", "parcel"]

RIDE_STATES = [
    "draft", "searching", "driver_assigned", "driver_arriving", "waiting_at_pickup",
    "otp_pending", "in_progress", "completed", "cancelled", "expired", "disputed",
]


def _uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------- auth ----------
class AdminUser(BaseModel):
    id: str = Field(default_factory=_uuid)
    email: EmailStr
    name: str
    role: Literal["super_admin", "fleet_manager", "ops_lead"]
    created_at: datetime = Field(default_factory=utcnow)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------- dashboard ----------
class SeriesPoint(BaseModel):
    label: str
    value: float


class CategorySplit(BaseModel):
    category: str
    rides: int
    revenue: float


class DashboardStats(BaseModel):
    rides_today: int
    revenue_today: float
    active_drivers: int
    online_drivers: int
    total_riders: int
    completion_rate: float
    cancellation_rate: float
    open_sos: int
    pending_kyc: int
    live_rides: int
    hourly_rides: list[SeriesPoint]
    category_split: list[CategorySplit]
    state_breakdown: list[SeriesPoint]


# ---------- drivers ----------
class DriverDocument(BaseModel):
    type: str
    number: str
    status: Literal["pending", "approved", "rejected"]
    file_url: Optional[str] = None
    uploaded_at: Optional[datetime] = None


class Driver(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    phone: str
    city: str = "Kolkata"
    zone: str
    category: str
    vehicle_model: str
    vehicle_number: str
    kyc_status: Literal["pending", "approved", "rejected", "action_required"]
    is_online: bool = False
    on_trip: bool = False
    rating: float = 4.7
    total_rides: int = 0
    lifetime_earnings: float = 0.0
    commission_model: Literal["commission", "subscription"] = "commission"
    pass_plan_id: Optional[str] = None
    lat: float = 22.5726
    lng: float = 88.3639
    last_heartbeat: Optional[datetime] = None
    documents: list[DriverDocument] = []
    flags: list[str] = []
    created_at: datetime = Field(default_factory=utcnow)


class KycDecision(BaseModel):
    status: Literal["approved", "rejected", "action_required"]
    note: str = ""


class DriverOnlineUpdate(BaseModel):
    is_online: bool


# ---------- riders ----------
class Rider(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    phone: str
    email: Optional[str] = None
    city: str = "Kolkata"
    total_rides: int = 0
    wallet_balance: float = 0.0
    promo_balance: float = 0.0
    cashback_balance: float = 0.0
    status: Literal["active", "restricted", "blocked"] = "active"
    prepaid_only: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class RiderStatusUpdate(BaseModel):
    status: Literal["active", "restricted", "blocked"]
    prepaid_only: bool = False


# ---------- rides ----------
class FareBreakup(BaseModel):
    base_fare: float = 0
    distance_charge: float = 0
    time_charge: float = 0
    waiting_charge: float = 0
    surge_amount: float = 0
    night_charge: float = 0
    rider_added_fare: float = 0
    toll_parking: float = 0
    discount: float = 0
    tax: float = 0
    total: float = 0


class Ride(BaseModel):
    id: str = Field(default_factory=_uuid)
    code: str
    rider_id: str
    rider_name: str
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    category: str
    state: str
    pickup: str
    drop: str
    pickup_lat: float = 22.5726
    pickup_lng: float = 88.3639
    distance_km: float = 0
    duration_min: int = 0
    payment_method: Literal["upi", "credit_card", "debit_card", "net_banking", "cash", "wallet"]
    payment_status: Literal["paid", "pending", "refunded", "disputed"] = "pending"
    otp: str = "0000"
    otp_verified: bool = False
    fare: FareBreakup = FareBreakup()
    commission: float = 0
    driver_earning: float = 0
    cancellation_reason: Optional[str] = None
    surge_multiplier: float = 1.0
    created_at: datetime = Field(default_factory=utcnow)


class RideList(BaseModel):
    items: list[Ride]
    total: int


class RideStateUpdate(BaseModel):
    state: str
    reason: str = ""


class RefundRequest(BaseModel):
    amount: float
    reason: str


# ---------- pricing / commission / passes / flags ----------
class FareConfig(BaseModel):
    id: str = Field(default_factory=_uuid)
    category: str
    city: str = "Kolkata"
    base_fare: float
    minimum_fare: float
    per_km: float
    per_minute: float
    waiting_charge_per_min: float
    cancellation_charge: float
    surge_cap: float
    night_charge_pct: float
    tax_pct: float = 5.0
    version: int = 1
    active: bool = True
    updated_at: datetime = Field(default_factory=utcnow)


class FareConfigUpdate(BaseModel):
    base_fare: float
    minimum_fare: float
    per_km: float
    per_minute: float
    waiting_charge_per_min: float
    cancellation_charge: float
    surge_cap: float
    night_charge_pct: float
    tax_pct: float


class CommissionConfig(BaseModel):
    id: str = Field(default_factory=_uuid)
    category: str
    percentage: float
    promo_override_pct: Optional[float] = None
    active: bool = True
    updated_at: datetime = Field(default_factory=utcnow)


class CommissionUpdate(BaseModel):
    percentage: float
    promo_override_pct: Optional[float] = None


class SubscriptionPass(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    duration: Literal["daily", "weekly", "monthly"]
    price: float
    categories: list[str]
    zones: list[str] = []
    fair_usage_rides: int = 0
    active_subscribers: int = 0
    status: Literal["active", "paused"] = "active"
    created_at: datetime = Field(default_factory=utcnow)


class SubscriptionPassCreate(BaseModel):
    name: str
    duration: Literal["daily", "weekly", "monthly"]
    price: float
    categories: list[str]
    fair_usage_rides: int = 0


class SubscriptionPassUpdate(BaseModel):
    name: str
    duration: Literal["daily", "weekly", "monthly"]
    price: float
    categories: list[str]
    fair_usage_rides: int = 0
    status: Literal["active", "paused"]


class FeatureFlag(BaseModel):
    id: str = Field(default_factory=_uuid)
    key: str
    label: str
    scope: Literal["category", "zone", "city"]
    enabled: bool
    note: str = ""


class FlagToggle(BaseModel):
    enabled: bool


# ---------- campaigns ----------
class Campaign(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    app: Literal["rider", "driver"]
    type: str
    code: Optional[str] = None
    discount_type: Literal["percentage", "flat", "cashback", "bonus"]
    value: float
    max_discount: float = 0
    categories: list[str] = []
    zones: list[str] = []
    payment_methods: list[str] = []
    audience: Literal["all", "new_users", "existing_users"] = "all"
    starts_on: str
    ends_on: str
    budget_cap: float
    budget_used: float = 0
    usage_limit_per_user: int = 1
    redemptions: int = 0
    stackable: bool = False
    status: Literal["draft", "active", "paused", "expired"] = "draft"
    version: int = 1
    created_at: datetime = Field(default_factory=utcnow)


class CampaignCreate(BaseModel):
    name: str
    app: Literal["rider", "driver"]
    type: str
    code: Optional[str] = None
    discount_type: Literal["percentage", "flat", "cashback", "bonus"]
    value: float
    max_discount: float = 0
    categories: list[str] = []
    audience: Literal["all", "new_users", "existing_users"] = "all"
    starts_on: str
    ends_on: str
    budget_cap: float
    usage_limit_per_user: int = 1
    stackable: bool = False


class CampaignStatusUpdate(BaseModel):
    status: Literal["draft", "active", "paused", "expired"]


# ---------- wallet ----------
class LedgerEntry(BaseModel):
    id: str = Field(default_factory=_uuid)
    owner_type: Literal["rider", "driver"]
    owner_id: str
    owner_name: str
    entry_type: Literal["credit", "debit"]
    pool: Literal["user_funded", "promotional", "cashback"]
    amount: float
    balance_after: float
    reason: str
    ref_id: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class WalletSummary(BaseModel):
    user_funded_total: float
    promotional_total: float
    cashback_total: float
    credits_30d: float
    debits_30d: float
    entries: list[LedgerEntry]
    total_entries: int


# ---------- sos ----------
class SosIncident(BaseModel):
    id: str = Field(default_factory=_uuid)
    ride_id: str
    ride_code: str
    rider_name: str
    rider_phone: str
    driver_name: str
    driver_phone: str
    vehicle_number: str
    trigger_source: Literal["rider", "driver", "system"]
    reason: str
    lat: float
    lng: float
    location_label: str
    severity: Literal["critical", "high", "medium"]
    status: Literal["open", "acknowledged", "escalated", "resolved"]
    action_history: list[str] = []
    created_at: datetime = Field(default_factory=utcnow)


class SosAction(BaseModel):
    status: Literal["acknowledged", "escalated", "resolved"]
    note: str = ""


# ---------- audit ----------
class AuditLog(BaseModel):
    id: str = Field(default_factory=_uuid)
    actor: str
    actor_role: str
    action: str
    entity: str
    entity_id: str
    details: dict[str, Any] = {}
    created_at: datetime = Field(default_factory=utcnow)


class AuditLogList(BaseModel):
    items: list[AuditLog]
    total: int


# ---------- fleet ----------
class FleetDriver(BaseModel):
    id: str
    name: str
    category: str
    vehicle_number: str
    zone: str
    lat: float
    lng: float
    on_trip: bool
    rating: float


class LiveTrip(BaseModel):
    id: str
    code: str
    state: str
    rider_name: str
    driver_name: Optional[str]
    category: str
    pickup: str
    drop: str
    lat: float
    lng: float
    fare_total: float


class FleetSnapshot(BaseModel):
    drivers: list[FleetDriver]
    live_trips: list[LiveTrip]
    online_count: int
    on_trip_count: int
