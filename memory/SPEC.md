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
| `drivers` | partner profile, vehicle, `kyc_status`, `is_online`/`on_trip`, lat/lng, `documents[]` (each with `type`, `number`, `status`, `file_url`, `uploaded_at`), `flags[]`, `commission_model` |
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
- Pass edit (`PUT /api/passes/{id}`): price must be > 0, at least one category, non-negative fair
  usage → else **422**; unknown id → **404**. `active_subscribers` is never overwritten.
- Every mutating route writes an `audit_logs` entry via `lib/auth.log_action`.

## Driver KYC document scans, per-document review & expiry
`DriverDocument.file_url` points at 4 AI-generated **sample** document images (driving licence,
vehicle RC, insurance, identity card) hosted on the Emergent static CDN and assigned in `seed.py`
via the `DOC_IMAGES` map. There is **no real file upload pipeline** — no object storage, no
multipart endpoint. Replacing `DOC_IMAGES` with real S3/GCS keys is the upgrade path.

**Per-document review** — `PATCH /api/drivers/{id}/documents/{doc_type}`:
- A rejection **requires a non-blank reason** (422 otherwise) stored on `reject_reason`.
- Unknown document type or driver → 404.
- `lib/kyc.rollup_kyc_status()` derives the driver-level KYC from the documents: any rejected doc →
  `action_required` (never `rejected` — a reviewer rejects a *document*, not a partner); all
  approved → `approved`; otherwise `pending`. The bulk whole-file decision buttons still exist.
- Approving a previously rejected document clears its `reject_reason`.

**Document re-upload** — `POST /api/drivers/{id}/documents/{doc_type}/reupload`:
- Simulates the partner submitting a fresh scan from the driver app. **Only a `rejected` document
  can be replaced** — 409 otherwise; unknown doc/driver → 404.
- Resets `status` to `pending`, clears `reject_reason`, moves the old reason to
  `previous_reject_reason` (reviewer context), bumps `version`, and stamps `resubmitted_at` +
  `uploaded_at`. Optional body fields `number`, `expires_on`, `file_url` replace those values.
- The KYC rollup then pulls the driver back into the **review queue** (`pending`, or
  `action_required` if another document is still rejected). Other documents are never touched.
- Surfaces: "Re-submitted v2 · <date>" marker and "Previously rejected: …" chip on the document row,
  a **Partner re-upload** button that appears only on rejected documents, a **Re-submitted only**
  roster filter (`GET /api/drivers?resubmitted=true`), and `DashboardStats.resubmitted_documents`
  (counts only re-submitted docs *still pending review*, so it reads as a work queue).
- **This is an admin-side simulation** — there is no driver app and no upload pipeline, so the new
  scan reuses the existing sample image unless a `file_url` is supplied.

**Expiry alerts** — only `Driving Licence` and `Insurance` carry `expires_on` (`EXPIRING_TYPES`).
`lib/kyc.py` computes, server-side on every read (never stored), `expiry_status`
(`expired` | `expiring_soon` | `valid` | `null`) and `days_to_expiry`, using a 30-day
`EXPIRING_SOON_DAYS` window. Surfaces:
- `GET /api/drivers/document-alerts?window_days=30` → soonest-first `DocumentAlert[]`.
- `GET /api/drivers?doc_alert=any|expiring_soon|expired` filters the roster on that computed state.
- `DashboardStats.expiring_documents` / `.expired_documents` feed the "Docs need renewal" tile and
  the dashboard "Document renewal alerts" table.
- Seed spreads `LICENCE_VALIDITY` / `INSURANCE_VALIDITY` so the fleet always contains genuinely
  expired, expiring-soon and healthy documents.
- **No outbound reminders are sent** — there is no SMS/email/push provider wired up; the alerts are
  an in-console worklist only.

## Routes → pages
| Path | Page | What it does |
|---|---|---|
| `/login` | `Login.tsx` | split branded login + 3 demo pills |
| `/` | `Dashboard.tsx` | KPI tiles, hourly ride bar chart, revenue-by-service pie, lifecycle breakdown, open-SOS queue, **document renewal alerts table** |
| `/fleet` | `LiveFleet.tsx` | **Leaflet** dark-cartography Kolkata map of online drivers + active trip monitor |
| `/rides` | `Rides.tsx` | ride lookup, state/category/search filters, detail drawer with full fare breakup, lifecycle actions, refund |
| `/drivers` | `DriversKYC.tsx` | partner roster, expiry-state + re-submitted filters, KYC review drawer, per-document **View → preview modal** with **Approve / Reject / Partner re-upload**, expiry + re-submission badges, whole-file KYC decision, force online/offline |
| `/riders` | `Riders.tsx` | rider directory, 3 balances, active/restricted/blocked controls |
| `/fares` | `FareConfig.tsx` | per-category fare breakup editor + live 8km sample preview, versioned saves |
| `/commissions` | `CommissionPasses.tsx` | commission % per category + zero-commission passes: create, **Edit (prefills the form; `PUT /api/passes/{id}`, preserves `active_subscribers`)**, cancel-edit, pause/activate |
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
