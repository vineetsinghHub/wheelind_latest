// Hand-written mirrors of backend/models/schemas.py — keep both sides in sync in one edit.

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "fleet_manager" | "ops_lead";
  created_at: string;
}

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface CategorySplit {
  category: string;
  rides: number;
  revenue: number;
}

export interface DashboardStats {
  rides_today: number;
  revenue_today: number;
  active_drivers: number;
  online_drivers: number;
  total_riders: number;
  completion_rate: number;
  cancellation_rate: number;
  open_sos: number;
  pending_kyc: number;
  live_rides: number;
  expiring_documents: number;
  expired_documents: number;
  hourly_rides: SeriesPoint[];
  category_split: CategorySplit[];
  state_breakdown: SeriesPoint[];
}

export interface DriverDocument {
  type: string;
  number: string;
  status: "pending" | "approved" | "rejected";
  file_url: string | null;
  uploaded_at: string | null;
  expires_on: string | null;
  reject_reason: string | null;
  expiry_status: "expired" | "expiring_soon" | "valid" | null;
  days_to_expiry: number | null;
}

export interface DocumentAlert {
  driver_id: string;
  driver_name: string;
  phone: string;
  category: string;
  zone: string;
  vehicle_number: string;
  doc_type: string;
  number: string;
  expires_on: string;
  days_to_expiry: number;
  expiry_status: "expired" | "expiring_soon";
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  city: string;
  zone: string;
  category: string;
  vehicle_model: string;
  vehicle_number: string;
  kyc_status: "pending" | "approved" | "rejected" | "action_required";
  is_online: boolean;
  on_trip: boolean;
  rating: number;
  total_rides: number;
  lifetime_earnings: number;
  commission_model: "commission" | "subscription";
  pass_plan_id: string | null;
  lat: number;
  lng: number;
  last_heartbeat: string | null;
  documents: DriverDocument[];
  flags: string[];
  created_at: string;
}

export interface Rider {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string;
  total_rides: number;
  wallet_balance: number;
  promo_balance: number;
  cashback_balance: number;
  status: "active" | "restricted" | "blocked";
  prepaid_only: boolean;
  created_at: string;
}

export interface FareBreakup {
  base_fare: number;
  distance_charge: number;
  time_charge: number;
  waiting_charge: number;
  surge_amount: number;
  night_charge: number;
  rider_added_fare: number;
  toll_parking: number;
  discount: number;
  tax: number;
  total: number;
}

export interface Ride {
  id: string;
  code: string;
  rider_id: string;
  rider_name: string;
  driver_id: string | null;
  driver_name: string | null;
  category: string;
  state: string;
  pickup: string;
  drop: string;
  pickup_lat: number;
  pickup_lng: number;
  distance_km: number;
  duration_min: number;
  payment_method: "upi" | "credit_card" | "debit_card" | "net_banking" | "cash" | "wallet";
  payment_status: "paid" | "pending" | "refunded" | "disputed";
  otp: string;
  otp_verified: boolean;
  fare: FareBreakup;
  commission: number;
  driver_earning: number;
  cancellation_reason: string | null;
  surge_multiplier: number;
  created_at: string;
}

export interface RideList {
  items: Ride[];
  total: number;
}

export interface FareConfig {
  id: string;
  category: string;
  city: string;
  base_fare: number;
  minimum_fare: number;
  per_km: number;
  per_minute: number;
  waiting_charge_per_min: number;
  cancellation_charge: number;
  surge_cap: number;
  night_charge_pct: number;
  tax_pct: number;
  version: number;
  active: boolean;
  updated_at: string;
}

export interface CommissionConfig {
  id: string;
  category: string;
  percentage: number;
  promo_override_pct: number | null;
  active: boolean;
  updated_at: string;
}

export interface SubscriptionPass {
  id: string;
  name: string;
  duration: "daily" | "weekly" | "monthly";
  price: number;
  categories: string[];
  zones: string[];
  fair_usage_rides: number;
  active_subscribers: number;
  status: "active" | "paused";
  created_at: string;
}

export interface FeatureFlag {
  id: string;
  key: string;
  label: string;
  scope: "category" | "zone" | "city";
  enabled: boolean;
  note: string;
}

export interface Campaign {
  id: string;
  name: string;
  app: "rider" | "driver";
  type: string;
  code: string | null;
  discount_type: "percentage" | "flat" | "cashback" | "bonus";
  value: number;
  max_discount: number;
  categories: string[];
  zones: string[];
  payment_methods: string[];
  audience: "all" | "new_users" | "existing_users";
  starts_on: string;
  ends_on: string;
  budget_cap: number;
  budget_used: number;
  usage_limit_per_user: number;
  redemptions: number;
  stackable: boolean;
  status: "draft" | "active" | "paused" | "expired";
  version: number;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  owner_type: "rider" | "driver";
  owner_id: string;
  owner_name: string;
  entry_type: "credit" | "debit";
  pool: "user_funded" | "promotional" | "cashback";
  amount: number;
  balance_after: number;
  reason: string;
  ref_id: string | null;
  created_at: string;
}

export interface WalletSummary {
  user_funded_total: number;
  promotional_total: number;
  cashback_total: number;
  credits_30d: number;
  debits_30d: number;
  entries: LedgerEntry[];
  total_entries: number;
}

export interface SosIncident {
  id: string;
  ride_id: string;
  ride_code: string;
  rider_name: string;
  rider_phone: string;
  driver_name: string;
  driver_phone: string;
  vehicle_number: string;
  trigger_source: "rider" | "driver" | "system";
  reason: string;
  lat: number;
  lng: number;
  location_label: string;
  severity: "critical" | "high" | "medium";
  status: "open" | "acknowledged" | "escalated" | "resolved";
  action_history: string[];
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  actor_role: string;
  action: string;
  entity: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogList {
  items: AuditLog[];
  total: number;
}

export interface FleetDriver {
  id: string;
  name: string;
  category: string;
  vehicle_number: string;
  zone: string;
  lat: number;
  lng: number;
  on_trip: boolean;
  rating: number;
}

export interface LiveTrip {
  id: string;
  code: string;
  state: string;
  rider_name: string;
  driver_name: string | null;
  category: string;
  pickup: string;
  drop: string;
  lat: number;
  lng: number;
  fare_total: number;
}

export interface FleetSnapshot {
  drivers: FleetDriver[];
  live_trips: LiveTrip[];
  online_count: number;
  on_trip_count: number;
}

export const SERVICE_CATEGORIES = [
  "bike",
  "auto",
  "cab",
  "sedan",
  "xl",
  "rentals",
  "outstation",
  "parcel",
] as const;

export const RIDE_STATES = [
  "draft",
  "searching",
  "driver_assigned",
  "driver_arriving",
  "waiting_at_pickup",
  "otp_pending",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
  "disputed",
] as const;

export const STATE_COLORS: Record<string, string> = {
  draft: "#64748B",
  searching: "#F59E0B",
  driver_assigned: "#3B82F6",
  driver_arriving: "#8B5CF6",
  waiting_at_pickup: "#EC4899",
  otp_pending: "#F97316",
  in_progress: "#10B981",
  completed: "#059669",
  cancelled: "#6B7280",
  expired: "#9CA3AF",
  disputed: "#EF4444",
};

export const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const inr2 = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const titleize = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export const expiryLabel = (days: number) => {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  return `${days}d left`;
};

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
