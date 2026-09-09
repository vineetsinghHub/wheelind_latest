"""Rider-app models. Mirrored by frontend/src/rider/lib/riderTypes.ts."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from models.schemas import FareBreakup, Ride, Rider


class OtpRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=15)


class OtpChallenge(BaseModel):
    phone: str
    otp_hint: str  # dev-only: no SMS provider is wired up
    expires_in_sec: int
    is_new_user: bool


class OtpVerify(BaseModel):
    phone: str
    otp: str = Field(min_length=4, max_length=6)
    name: Optional[str] = None


class Place(BaseModel):
    name: str
    area: str
    lat: float
    lng: float
    label: str


class EstimateRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    drop_lat: float
    drop_lng: float


class CategoryEstimate(BaseModel):
    category: str
    label: str
    seats: int
    total: float
    breakup: FareBreakup
    distance_km: float
    duration_min: int
    eta_min: Optional[int]
    nearby_drivers: int
    surge_multiplier: float
    available: bool
    unavailable_reason: Optional[str] = None


class EstimateResponse(BaseModel):
    distance_km: float
    options: list[CategoryEstimate]


class BookRequest(BaseModel):
    category: str
    pickup: str
    drop: str
    pickup_lat: float
    pickup_lng: float
    drop_lat: float
    drop_lng: float
    payment_method: Literal["upi", "credit_card", "debit_card", "net_banking", "cash", "wallet"]
    promo_code: Optional[str] = None
    rider_added_fare: float = Field(default=0, ge=0, le=500)
    # ISO datetime for a later trip; None books immediately.
    scheduled_for: Optional[datetime] = None


class MapsConfig(BaseModel):
    provider: str
    client_key: str
    configured: bool
    tile_url: str
    attribution: str


class ReverseGeocode(BaseModel):
    name: str
    area: str
    lat: float
    lng: float
    label: str
    distance_km: float


class FareBumpRequest(BaseModel):
    amount: float = Field(gt=0, le=200)


class OtpStartRequest(BaseModel):
    otp: str


class RateRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = ""


class RechargeRequest(BaseModel):
    amount: float = Field(gt=0, le=50000)
    method: Literal["upi", "credit_card", "debit_card", "net_banking"]


class SosRequest(BaseModel):
    reason: str = "Rider pressed SOS from the ride screen"


class TripShare(BaseModel):
    share_url: str
    expires_in_min: int


class RiderWallet(BaseModel):
    wallet_balance: float
    promo_balance: float
    cashback_balance: float
    entries: list[dict]


class RiderPromo(BaseModel):
    id: str
    name: str
    code: Optional[str]
    discount_type: str
    value: float
    max_discount: float
    categories: list[str]
    ends_on: str


class RideWithDriver(BaseModel):
    ride: Ride
    driver_lat: Optional[float] = None
    driver_lng: Optional[float] = None
    driver_phone: Optional[str] = None
    driver_rating: Optional[float] = None
    vehicle_model: Optional[str] = None
    vehicle_number: Optional[str] = None
    masked_driver_phone: Optional[str] = None
    seconds_searching: Optional[int] = None


class RiderProfile(BaseModel):
    rider: Rider
    total_spent: float
    completed_rides: int
