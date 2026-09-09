"""Driver-app request/response models — mirrors live in frontend/src/lib/driverTypes.ts."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from models.schemas import Driver, DriverDocument, Ride, utcnow


class DriverOtpRequest(BaseModel):
    phone: str


class DriverOtpChallenge(BaseModel):
    phone: str
    otp_hint: str
    expires_in_sec: int
    is_registered: bool


class DriverOtpVerify(BaseModel):
    phone: str
    otp: str


class DriverSession(BaseModel):
    token: str
    driver: Driver
    permissions_pending: list[str] = []


class DriverRegister(BaseModel):
    phone: str
    name: str
    category: str
    vehicle_model: str
    vehicle_number: str
    zone: str = "Central Kolkata"
    city: str = "Kolkata"


class DriverProfileUpdate(BaseModel):
    name: Optional[str] = None
    zone: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_number: Optional[str] = None


class DriverHome(BaseModel):
    driver: Driver
    kyc_status: str
    documents_pending: int
    documents_rejected: int
    pass_active: bool
    pass_name: Optional[str] = None
    payout_balance: float
    today_earnings: float
    today_rides: int
    open_offers: int
    active_ride_id: Optional[str] = None


class OnlineToggle(BaseModel):
    is_online: bool
    lat: Optional[float] = None
    lng: Optional[float] = None


class PresenceState(BaseModel):
    is_online: bool
    on_trip: bool
    last_heartbeat: Optional[datetime] = None
    expires_in_sec: int
    flagged: bool = False
    message: str = ""


class Heartbeat(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    speed_kmph: float = Field(default=0, ge=0, le=250)


class DocumentSubmit(BaseModel):
    type: str
    number: str
    file_url: Optional[str] = None
    expires_on: Optional[datetime] = None


class PayoutAccount(BaseModel):
    driver_id: str
    method: Literal["bank", "upi"] = "upi"
    upi_id: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None
    verified: bool = False
    updated_at: datetime = Field(default_factory=utcnow)


class PayoutAccountUpdate(BaseModel):
    method: Literal["bank", "upi"]
    upi_id: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc: Optional[str] = None


class RideOffer(BaseModel):
    id: str
    ride_id: str
    ride_code: str
    driver_id: str
    state: Literal["offered", "accepted", "declined", "expired", "lost"]
    category: str = "bike"
    pickup: str = ""
    drop: str = ""
    pickup_lat: float = 0
    pickup_lng: float = 0
    distance_km: float = 0
    distance_m: float = 0
    fare_total: float = 0
    estimated_earning: float = 0
    payment_method: str = "cash"
    expires_in_sec: int = 0
    created_at: datetime = Field(default_factory=utcnow)


class OfferDecision(BaseModel):
    reason: str = ""


class DriverTrip(BaseModel):
    ride: Ride
    rider_phone: Optional[str] = None
    masked_rider_phone: Optional[str] = None
    otp_required: bool = True
    estimated_earning: float = 0
    zero_commission: bool = False


class DriverOtpStart(BaseModel):
    otp: str


class DriverCancel(BaseModel):
    reason: str


class TripComplete(BaseModel):
    waiting_min: int = Field(default=0, ge=0, le=180)
    toll_parking: float = Field(default=0, ge=0, le=5000)
    cash_collected: bool = True


class EarningsSummary(BaseModel):
    today_earnings: float
    today_rides: int
    week_earnings: float
    week_rides: int
    lifetime_earnings: float
    lifetime_rides: int
    commission_paid: float
    commission_this_week: float
    incentives_earned: float
    penalties_charged: float
    payout_balance: float
    pass_active: bool
    pass_name: Optional[str] = None
    pass_expires_at: Optional[datetime] = None
    rating: float


class DriverLedgerEntry(BaseModel):
    id: str
    driver_id: str
    driver_name: str
    entry_type: Literal["credit", "debit"]
    kind: Literal["earning", "incentive", "penalty", "pass_fee", "payout", "adjustment"]
    amount: float
    balance_after: float
    reason: str
    ref_id: Optional[str] = None
    created_at: datetime


class DriverPass(BaseModel):
    id: str
    driver_id: str
    plan_id: str
    plan_name: str
    duration: str
    price: float
    categories: list[str] = []
    rides_used: int = 0
    fair_usage_rides: int = 0
    status: Literal["active", "expired", "cancelled"]
    starts_at: datetime
    expires_at: datetime


class IncentiveProgress(BaseModel):
    id: str
    name: str
    description: str
    target_rides: int
    completed_rides: int
    reward: float
    ends_on: str
    claimed: bool = False


class DriverSos(BaseModel):
    reason: str
    lat: Optional[float] = None
    lng: Optional[float] = None


class DriverDocumentList(BaseModel):
    kyc_status: str
    documents: list[DriverDocument]
    action_required: list[str] = []
