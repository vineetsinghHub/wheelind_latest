// Hand-written mirrors of backend/models/ops.py — keep in sync in the same edit.

export interface CaseMessage {
  author: string;
  author_role: string;
  body: string;
  created_at: string;
}

export type SupportCaseKind =
  | "fare_dispute"
  | "cash_unpaid"
  | "cancellation_review"
  | "fraud_review"
  | "refund_request"
  | "other";

export interface SupportCase {
  id: string;
  reference: string;
  kind: SupportCaseKind;
  subject: string;
  detail: string;
  raised_by: "rider" | "driver" | "admin" | "system";
  rider_id: string | null;
  rider_name: string | null;
  driver_id: string | null;
  driver_name: string | null;
  ride_id: string | null;
  ride_code: string | null;
  amount_claimed: number;
  status: "open" | "in_review" | "resolved" | "rejected";
  resolution: string | null;
  refund_amount: number;
  penalty_amount: number;
  assignee: string | null;
  messages: CaseMessage[];
  created_at: string;
  updated_at: string;
}

export interface SupportCaseList {
  items: SupportCase[];
  total: number;
  open_count: number;
}

export interface SupportCaseCreate {
  kind: SupportCaseKind;
  subject: string;
  detail?: string;
  ride_id?: string | null;
  amount_claimed?: number;
}

export interface SupportCaseUpdate {
  status: "open" | "in_review" | "resolved" | "rejected";
  resolution?: string;
  refund_amount?: number;
  penalty_amount?: number;
  assignee?: string | null;
}

export interface FraudFlag {
  id: string;
  entity_type: "driver" | "rider";
  entity_id: string;
  entity_name: string;
  kind: string;
  detail: string;
  severity: "low" | "medium" | "high";
  ride_code: string | null;
  status: "open" | "cleared" | "actioned";
  created_at: string;
}

export interface FraudDecision {
  status: "cleared" | "actioned";
  note?: string;
  suspend?: boolean;
}

export interface PayoutItem {
  driver_id: string;
  driver_name: string;
  phone: string;
  method: string;
  destination: string;
  rides: number;
  amount: number;
  status: "pending" | "paid" | "failed";
}

export interface PayoutRun {
  id: string;
  reference: string;
  period_start: string;
  period_end: string;
  driver_count: number;
  total_amount: number;
  status: "draft" | "processing" | "paid" | "failed";
  items: PayoutItem[];
  created_by: string;
  created_at: string;
  processed_at: string | null;
  note: string;
}

export interface PayoutRunList {
  items: PayoutRun[];
  total: number;
  pending_amount: number;
}

export interface PayoutRunCreate {
  days: number;
  minimum_amount: number;
  note?: string;
}

export interface PendingPayout {
  driver_id: string;
  driver_name: string;
  phone: string;
  category: string;
  payout_balance: number;
  method: string;
  destination: string;
  account_verified: boolean;
  last_payout_at: string | null;
}

export interface FinanceSummary {
  window_days: number;
  rides_completed: number;
  gross_fares: number;
  discounts: number;
  taxes_collected: number;
  tolls: number;
  platform_commission: number;
  driver_earnings: number;
  pass_revenue: number;
  refunds: number;
  penalties: number;
  net_revenue: number;
  payouts_paid: number;
  payouts_pending: number;
  zero_commission_rides: number;
  commission_rides: number;
}

export interface InvoiceLine {
  label: string;
  amount: number;
}

export interface Invoice {
  invoice_no: string;
  ride_code: string;
  issued_on: string;
  rider_name: string;
  driver_name: string | null;
  vehicle_number: string | null;
  category: string;
  pickup: string;
  drop: string;
  distance_km: number;
  duration_min: number;
  lines: InvoiceLine[];
  subtotal: number;
  tax_pct: number;
  tax_amount: number;
  total: number;
  payment_method: string;
  payment_status: string;
  gstin: string;
  place_of_supply: string;
}

export interface SavedPlace {
  id: string;
  rider_id: string;
  label: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  created_at: string;
}

export interface SavedPlaceCreate {
  label: string;
  name: string;
  area?: string;
  lat: number;
  lng: number;
}

export interface EmergencyContact {
  id: string;
  rider_id: string;
  name: string;
  phone: string;
  relation: string;
  created_at: string;
}

export interface EmergencyContactCreate {
  name: string;
  phone: string;
  relation?: string;
}

export interface RiderProfileUpdate {
  name?: string | null;
  email?: string | null;
}

export interface DispatchOffer {
  id: string;
  ride_id: string;
  ride_code: string;
  driver_id: string;
  driver_name: string;
  state: string;
  distance_m: number;
  fare_total: number;
  created_at: string;
  expires_at: string;
  decline_reason: string | null;
}

export interface SweepResult {
  offers_expired: number;
  searches_expired: number;
  drivers_taken_offline: number;
  scheduled_released: number;
  offers_created: number;
  ran_at: string;
}

export interface DispatchBoard {
  searching_rides: number;
  live_offers: number;
  online_drivers: number;
  stale_presence: number;
  avg_wait_sec: number;
  offers: DispatchOffer[];
}

export interface AdminPermissions {
  role: string;
  permissions: string[];
}
