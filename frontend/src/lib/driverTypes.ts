// Hand-written mirrors of backend/models/driver.py.
// The partner client is a React Native app (built separately) — these types exist so the
// admin console and any web tooling speak the same contract as the mobile app.
import type { Driver, DriverDocument, Ride } from "@/lib/types";

export interface DriverOtpChallenge {
  phone: string;
  otp_hint: string;
  expires_in_sec: number;
  is_registered: boolean;
}

export interface DriverSession {
  token: string;
  driver: Driver;
  permissions_pending: string[];
}

export interface DriverRegister {
  phone: string;
  name: string;
  category: string;
  vehicle_model: string;
  vehicle_number: string;
  zone?: string;
  city?: string;
}

export interface DriverHome {
  driver: Driver;
  kyc_status: string;
  documents_pending: number;
  documents_rejected: number;
  pass_active: boolean;
  pass_name: string | null;
  payout_balance: number;
  today_earnings: number;
  today_rides: number;
  open_offers: number;
  active_ride_id: string | null;
}

export interface PresenceState {
  is_online: boolean;
  on_trip: boolean;
  last_heartbeat: string | null;
  expires_in_sec: number;
  flagged: boolean;
  message: string;
}

export interface PayoutAccount {
  driver_id: string;
  method: "bank" | "upi";
  upi_id: string | null;
  account_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  verified: boolean;
  updated_at: string;
}

export interface RideOffer {
  id: string;
  ride_id: string;
  ride_code: string;
  driver_id: string;
  state: "offered" | "accepted" | "declined" | "expired" | "lost";
  category: string;
  pickup: string;
  drop: string;
  pickup_lat: number;
  pickup_lng: number;
  distance_km: number;
  distance_m: number;
  fare_total: number;
  estimated_earning: number;
  payment_method: string;
  expires_in_sec: number;
  created_at: string;
}

export interface DriverTrip {
  ride: Ride;
  rider_phone: string | null;
  masked_rider_phone: string | null;
  otp_required: boolean;
  estimated_earning: number;
  zero_commission: boolean;
}

export interface TripComplete {
  waiting_min: number;
  toll_parking: number;
  cash_collected: boolean;
}

export interface EarningsSummary {
  today_earnings: number;
  today_rides: number;
  week_earnings: number;
  week_rides: number;
  lifetime_earnings: number;
  lifetime_rides: number;
  commission_paid: number;
  commission_this_week: number;
  incentives_earned: number;
  penalties_charged: number;
  payout_balance: number;
  pass_active: boolean;
  pass_name: string | null;
  pass_expires_at: string | null;
  rating: number;
}

export interface DriverLedgerEntry {
  id: string;
  driver_id: string;
  driver_name: string;
  entry_type: "credit" | "debit";
  kind: "earning" | "incentive" | "penalty" | "pass_fee" | "payout" | "adjustment";
  amount: number;
  balance_after: number;
  reason: string;
  ref_id: string | null;
  created_at: string;
}

export interface DriverPass {
  id: string;
  driver_id: string;
  plan_id: string;
  plan_name: string;
  duration: string;
  price: number;
  categories: string[];
  rides_used: number;
  fair_usage_rides: number;
  status: "active" | "expired" | "cancelled";
  starts_at: string;
  expires_at: string;
}

export interface IncentiveProgress {
  id: string;
  name: string;
  description: string;
  target_rides: number;
  completed_rides: number;
  reward: number;
  ends_on: string;
  claimed: boolean;
}

export interface DriverDocumentList {
  kyc_status: string;
  documents: DriverDocument[];
  action_required: string[];
}
