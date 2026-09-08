# Wheelind — Admin Portal & Backend (living spec)

## What the app is
Kolkata-first ride-hailing operations console for **Wheelind** ("Your ride, our pride").
This build covers the **backend API + admin web portal only** (no rider/driver mobile apps).

Stack actually used: **FastAPI + MongoDB (motor) + React 19 + TS + Tailwind v4**.
The user's original plan named NestJS + PostgreSQL/PostGIS + Redis + BullMQ; they explicitly
approved building on this pod's FastAPI/Mongo stack with the **same API contract** so a NestJS
rewrite stays straightforward. See "Spec deviations".

Design system: matte black (`#090A0C` page / `#11141A` panel) + metallic gold `#D4AF37`.
Fonts: Outfit (headings), Plus Jakarta Sans (body), JetBrains Mono (IDs, money, OTP).

## Auth
- Email + password, **httpOnly cookie session** (`wl_session`), 7-day TTL-indexed.
- Routes under `/api/auth/*`: `POST /login`, `GET /me`, `POST /logout`.
- Every other endpoint depends on `current_admin` → **401 without a session cookie**.
- Login page has three one-click demo buttons. Credentials in `memory/test_credentials.md`.
- Roles exist on the admin record (`super_admin`, `fleet_manager`, `ops_lead`) and are shown in
  the topbar + audit logs, but **route-level RBAC gating is not enforced** — all three roles see
  every screen (declared deviation).

## Data model (MongoDB collections, string `uuid4` `id` fields, never ObjectId)
| Collection | Purpose |
|---|---|
| `admins` | admin users + `password_hash` (sha256, salted constant) |
| `admin_sessions` | session tokens, TTL index on `expires_at` |
| `drivers` | partner profile, vehicle, `kyc_status`, `is_online`/`on_trip`, lat/lng, `documents[]`, `flags[]`, `commission_model` |
| `riders` | customer profile, 3 balance fields, `status`, `prepaid_only` |
| `rides` | 11-state lifecycle, `FareBreakup` sub-document, `otp` + `otp_verified`, commission/earning |
| `fare_configs` | one per service category, **versioned** (`version` bumps on save) |
| `commission_configs` | percentage per category + promo override |
| `subscription_passes` | zero-commission passes (daily/weekly/monthly) |
| `feature_flags` | `category.*`, `zone.*`, `city.*` scoped toggles |
| `campaigns` | rider + driver offers, budget cap, redemptions, status machine |
| `ledger` | **immutable** wallet entries; 3 pools: `user_funded`, `promotional`, `cashback` |
| `sos_incidents` | safety incidents + `action_history[]` |
| `audit_logs` | actor/role/action/entity for every mutation |

Indexes live in `backend/lib/db.py` `INDEXES` and are applied by `ensure_indexes()` at startup.

## Ride lifecycle (strict state machine)
`draft → searching → driver_assigned → driver_arriving → waiting_at_pickup → otp_pending →
in_progress → completed`, plus `cancelled`, `expired`, `disputed`.

Enforced server-side in `PATCH /api/rides/{id}/state`:
- Unknown state → **422**.
- Terminal ride (`completed`/`cancelled`/`expired`) → only `disputed`/`completed` allowed, else **409**.
- `in_progress` requires `otp_verified` → else **409** ("OTP not verified — trip start is blocked").

## Key backend rules
- Refund (`POST /api/rides/{id}/refund`): amount must be > 0 (**422**) and ≤ ride fare (**409**);
  credits the rider wallet **and writes a ledger entry**, then flips `payment_status` to `refunded`.
- Fare save: `minimum_fare < base_fare` → **422**; version bumps + audit entry.
- Commission: must be 0–40% → **422** outside.
- Campaign create: positive budget/value, `ends_on >= starts_on`, percentage ≤ 100 → else **422**.
  Campaigns are created as **draft**; `expired` campaigns cannot be reactivated (**409**).
- SOS: already-`resolved` incident cannot be acted on again (**409**).
- Every mutating route writes an `audit_logs` entry via `lib/auth.log_action`.

## Routes → pages
| Path | Page | What it does |
|---|---|---|
| `/login` | `Login.tsx` | split branded login + 3 demo pills |
| `/` | `Dashboard.tsx` | KPI tiles, hourly ride bar chart, revenue-by-service pie, lifecycle breakdown, open-SOS queue |
| `/fleet` | `LiveFleet.tsx` | **Leaflet** dark-cartography Kolkata map of online drivers + active trip monitor |
| `/rides` | `Rides.tsx` | ride lookup, state/category/search filters, detail drawer with full fare breakup, lifecycle actions, refund |
| `/drivers` | `DriversKYC.tsx` | partner roster, KYC review drawer with documents, approve/action-required/reject, force online/offline |
| `/riders` | `Riders.tsx` | rider directory, 3 balances, active/restricted/blocked controls |
| `/fares` | `FareConfig.tsx` | per-category fare breakup editor + live 8km sample preview, versioned saves |
| `/commissions` | `CommissionPasses.tsx` | commission % per category + zero-commission pass CRUD/pause |
| `/campaigns` | `Campaigns.tsx` | rider/driver campaign register, create form, activate/pause/expire, budget bars |
| `/wallet` | `WalletLedger.tsx` | 3-pool totals + immutable ledger table with pool/type/search filters |
| `/sos` | `SOSIncidents.tsx` | incident register + safety console drawer (rider/driver/vehicle/location/action history) |
| `/flags` | `FeatureFlags.tsx` | category/zone/city toggles |
| `/audit` | `AuditLogs.tsx` | full action trail with entity + actor filters |

## Seed data (`cd /app/backend && python seed.py`, idempotent — drops then reseeds)
48 drivers, 60 riders, 420 rides, 8 fare configs, 8 commission configs, 3 passes, 16 feature flags,
9 campaigns, 300 ledger entries, 12 SOS incidents, 30 audit logs. Kolkata zones: Park Street,
Salt Lake Sector V, Howrah Station, CCU Airport, New Town, Ballygunge, Esplanade, Jadavpur.
Live categories by default: bike, auto, cab, sedan, xl. Off: rentals, outstation, parcel.

## Spec deviations (intentional — not bugs)
1. **FastAPI + MongoDB instead of NestJS + PostgreSQL/PostGIS**; user-approved.
2. **No Redis / BullMQ**: no driver-location heartbeat expiry worker, no offer timers, no payout
   batch jobs. Driver presence is a stored `is_online` flag an admin can override.
3. **No real-time dispatch engine**: no nearest-driver geospatial matching, no timed offers, no
   3–5 min request expiry loop. Ride states are admin-driven; rides arrive pre-seeded.
4. **RBAC is display-only** — roles are recorded and audited, not enforced per route.
5. **No third-party integrations**: no Razorpay, SMS/OTP, masked calling, push, or object storage.
   Map tiles are the only external call (CARTO dark basemap).
6. **No rider/driver mobile apps** and no payout execution — out of the requested scope.
7. Fare config is versioned via a counter; full historical version rows are not retained.
