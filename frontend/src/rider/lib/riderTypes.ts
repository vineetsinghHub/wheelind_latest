// Hand-written mirrors of backend/models/rider.py.
import type { FareBreakup, Ride, Rider } from "@/lib/types";

export interface OtpChallenge {
  phone: string;
  otp_hint: string;
  expires_in_sec: number;
  is_new_user: boolean;
}

export interface Place {
  name: string;
  area: string;
  lat: number;
  lng: number;
  label: string;
}

export interface CategoryEstimate {
  category: string;
  label: string;
  seats: number;
  total: number;
  breakup: FareBreakup;
  distance_km: number;
  duration_min: number;
  eta_min: number | null;
  nearby_drivers: number;
  surge_multiplier: number;
  available: boolean;
  unavailable_reason: string | null;
}

export interface EstimateResponse {
  distance_km: number;
  options: CategoryEstimate[];
}

export interface RideWithDriver {
  ride: Ride;
  driver_lat: number | null;
  driver_lng: number | null;
  driver_phone: string | null;
  driver_rating: number | null;
  vehicle_model: string | null;
  vehicle_number: string | null;
  masked_driver_phone: string | null;
  seconds_searching: number | null;
}

export interface RiderProfile {
  rider: Rider;
  total_spent: number;
  completed_rides: number;
}

export interface RiderLedgerEntry {
  id: string;
  entry_type: "credit" | "debit";
  pool: "user_funded" | "promotional" | "cashback";
  amount: number;
  balance_after: number;
  reason: string;
  ref_id: string | null;
  created_at: string;
}

export interface RiderWallet {
  wallet_balance: number;
  promo_balance: number;
  cashback_balance: number;
  entries: RiderLedgerEntry[];
}

export interface RiderPromo {
  id: string;
  name: string;
  code: string | null;
  discount_type: string;
  value: number;
  max_discount: number;
  categories: string[];
  ends_on: string;
}

export interface TripShare {
  share_url: string;
  expires_in_min: number;
}

export const PAYMENT_METHODS = [
  { v: "upi", l: "UPI" },
  { v: "wallet", l: "Wheelind Wallet" },
  { v: "credit_card", l: "Credit Card" },
  { v: "debit_card", l: "Debit Card" },
  { v: "net_banking", l: "Net Banking" },
  { v: "cash", l: "Cash" },
] as const;

export const RIDE_STAGE_COPY: Record<string, { title: string; sub: string }> = {
  searching: { title: "Finding you a ride", sub: "Matching with nearby partners" },
  driver_assigned: { title: "Driver assigned", sub: "Your partner is on the way" },
  driver_arriving: { title: "Driver arriving", sub: "Keep an eye out for your vehicle" },
  waiting_at_pickup: { title: "Driver has arrived", sub: "Share your OTP to start" },
  otp_pending: { title: "Share your OTP", sub: "Trip starts once the code is verified" },
  in_progress: { title: "On the way", sub: "Enjoy your ride" },
  completed: { title: "Trip completed", sub: "Thanks for riding with Wheelind" },
  cancelled: { title: "Ride cancelled", sub: "Book again whenever you're ready" },
  expired: { title: "No driver found", sub: "Try raising the fare and searching again" },
};
