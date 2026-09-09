# Wheelind — Rider App + Admin Portal + Backend (living spec)

## Two apps, one deployment
| App | URL | Auth cookie | Who |
|---|---|---|---|
| **Rider app** | `/` marketing landing, booking at `/ride` (open to guests), sign-in via captcha modal at request time | `wl_rider` (30d) | public consumers |
| **Admin console** | `/admin` (sign-in at `/admin/login`) | `wl_session` (7d) | Wheelind staff |

Separate shells, layouts, designs and sessions; they share one MongoDB, so a rider's booking
appears immediately in the admin Rides/Fleet/SOS screens. A rider session grants **no** admin
access and vice versa. This pod runs one Vite server, so both ship from the same build —
they are not separate deployments.

Rider app source lives in `frontend/src/rider/` (`RiderLayout` + `pages/` + `lib/riderTypes.ts`);
admin source stays in `frontend/src/pages/` + `components/layout/AdminLayout.tsx`.

## What the app is
Kolkata-first ride-hailing platform for **Wheelind** ("Your ride, our pride") — rider web app
plus operations console. **No driver app exists**; driver-side actions are simulated.

Stack actually used: **FastAPI + MongoDB (motor) + React 19 + TS + Tailwind v4**.
The user's original plan named NestJS + PostgreSQL/PostGIS + Redis + BullMQ; they explicitly
approved building on this pod's FastAPI/Mongo stack with the **same API contract**.

Design: matte black (`#090A0C` admin / `#0B0C10` rider) + metallic gold `#D4AF37`.
Fonts: Outfit (headings), Plus Jakarta Sans (body), JetBrains Mono (IDs, money, OTP).
Toasts render **top-center** — bottom-right covered the rider's tab bar and top-right covered
the admin sign-out button (both caused real click-interception bugs).

## Rider app (`/api/rider/*`, `routers/rider.py`)
- **Auth**: `POST /rider/auth/request-otp` → returns the OTP in the response (`otp_hint`) because
  **no SMS provider is wired up**; `POST /rider/auth/verify` accepts **any 4-digit code** and
  auto-creates the account on first sign-in. Blocked riders get 403.
- **Places**: `GET /rider/places?q=` searches a **curated 45-entry Kolkata list**
  (`lib/places.py`). There is **no geocoding provider**.
- **Distance**: haversine × `ROAD_FACTOR` (1.35). There is **no routing provider**, so this is an
  approximation, not a road route.
- **Estimate**: `POST /rider/estimate` prices every category through the shared pricing engine,
  adds a per-category ETA from live nearby supply (2dsphere, 6 km), and applies a supply-driven
  surge (0 partners → 1.5×, 1 partner → 1.2×, capped by `surge_cap`). Disabled categories are
  returned with `available: false` from the admin feature flags.
- **Booking lifecycle**, all server-enforced:
  - `POST /rider/rides` — blocks a second live ride (409), disabled categories (409), invalid or
    exhausted promo codes (422/409), cash for restricted/prepaid-only riders (403), and wallet
    payment beyond balance (409). Applies percentage/flat promo discounts and increments the
    campaign's `budget_used`/`redemptions`. Rides are tagged `source: "rider_app"`.
  - `POST /rider/rides/{id}/match` — 2dsphere `$geoNear` assignment, radius widening with wait
    time (4 → 8 → 15 km), and **expiry at 180s** (§8.1 no infinite search). Marks the driver
    `on_trip`.
  - `POST /rider/rides/{id}/increase-fare` — raises the fare and **re-opens an expired search**.
  - `POST /rider/rides/{id}/advance` — **driver simulator** (no driver app): assigned → arriving
    → waiting_at_pickup → otp_pending.
  - `POST /rider/rides/{id}/start` — **OTP gate**: wrong code 422, wrong stage 409.
  - `POST /rider/rides/{id}/complete` — debits the wallet + writes a ledger entry when paying by
    wallet, computes driver earning, frees the driver.
  - `POST /rider/rides/{id}/cancel` — charges the config's `cancellation_charge` once the driver
    has arrived (§8.2) and books it to the ledger.
  - `POST /rider/rides/{id}/rate`, `/sos` (**lands in the admin SOS console**), `/share`
    (mock link, 90 min).
- **Wallet**: `GET /rider/wallet`, `POST /rider/wallet/recharge` — **payments are simulated, no
  gateway**. Top-ups ≥ ₹1,000 earn 5% cashback (max ₹100) into the separate cashback pool.
- **Promos**: `GET /rider/promos` — active rider campaigns still inside budget.
- Masked calling is a **display-only** fake number (`+91 80 4718 ••••`); no telephony provider.

## Admin console

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

## Pricing engine (`backend/lib/pricing.py`)
Pure function `quote_fare(config, commission_pct, ...)` — no DB, no ambient clock beyond
`is_night_ist()` — so quotes are reproducible and unit-testable. Documented order of operations,
because fare disputes hinge on it:
1. `base + distance + time + waiting`
2. surge applies to **base + distance only** (never time/waiting)
3. night charge = `night_charge_pct` of base + distance, on the **IST** clock (23:00–05:00), never UTC
4. rider-added fare on top
5. `minimum_fare` floor applies to the ride fare, before discount/tax/toll
6. discount, then tax on the discounted ride fare
7. toll/parking added last — **never taxed, never commissioned** (driver keeps it)

`POST /api/pricing/quote` reads the live `fare_configs` + `commission_configs` (honouring
`promo_override_pct`), rejects surge above that category's `surge_cap` (**422**), unknown category
(**404**), inactive config (**409**), and out-of-range trip inputs via Pydantic `Field` bounds.
Returns the breakup plus `commission` / `driver_earning`, `config_version`, and
`minimum_fare_applied` / `night_charge_applied` flags. `zero_commission: true` models an active pass.

## Geospatial dispatch (2dsphere)
`drivers.location` is a GeoJSON Point (`[lng, lat]`) backfilled by `seed.py`, indexed by a
`GEOSPHERE` IndexModel in `lib/db.py` (`location_2dsphere`).

`GET /api/dispatch/nearby-drivers?lat=&lng=&radius_km=&category=&limit=&include_on_trip=`
runs a Mongo `$geoNear` aggregation (spherical, `maxDistance` in metres) and returns drivers
closest-first with a real `distance_km` plus an `eta_min` derived from per-category Kolkata road
speeds. Eligibility mirrors dispatch rules and is applied **inside** `$geoNear.query`:
`kyc_status == approved`, `is_online == true`, and `on_trip == false` unless `include_on_trip`.
Offline or unapproved partners can never surface. Returns **503** if the index/backfill is missing.

**This is the lookup layer only — not a dispatch engine.** There are still no timed offers,
accept/decline tracking, request locks, search-radius expansion, or 3–5 minute expiry; those need
Redis. Driver positions are static seed coordinates with no heartbeat feed.

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

## Rider routes → pages (`frontend/src/rider/`)
| Path | Page | What it does |
|---|---|---|
| `/` | `RiderLanding.tsx` | full marketing landing page (hero, 8 services, how-it-works, safety, offers, captain pass, FAQ, CTA) |
| `/welcome` | `RiderWelcome.tsx` | hero landing + phone → OTP sign-in (code shown on screen), link to the admin console |
| `/` | `RiderBook.tsx` | place-search pickup/drop, road distance, per-category fare cards with ETA/surge, promo chips, payment picker, request ride; auto-redirects to a live trip |
| `/trip/:rideId` | `RiderTrip.tsx` | live stage tracking (4s poll), search progress bar with 180s timeout, driver card with masked call + trip share, OTP-to-start, driver simulator, SOS, cancel, completion + star rating |
| `/trips` | `RiderTrips.tsx` | ride history with state chips and saved ratings |
| `/wallet` | `RiderWalletPage.tsx` | 3-pool balances, simulated top-up (5% cashback ≥ ₹1,000), live offers, transaction ledger |

## Admin routes → pages (all under `/admin`)
| Path | Page | What it does |
|---|---|---|
| `/login` | `Login.tsx` | split branded login + 3 demo pills |
| `/` | `Dashboard.tsx` | KPI tiles, hourly ride bar chart, revenue-by-service pie, lifecycle breakdown, open-SOS queue, **document renewal alerts table** |
| `/fleet` | `LiveFleet.tsx` | **Leaflet** dark-cartography Kolkata map of online drivers + active trip monitor |
| `/rides` | `Rides.tsx` | ride lookup, state/category/search filters, detail drawer with full fare breakup, lifecycle actions, refund |
| `/dispatch` | `DispatchLab.tsx` | fare quote form (all breakup inputs, night mode, zero-comm pass) + 2dsphere nearest-driver panel with radius slider, service-match toggle, and a map showing pickup, search radius and candidate lines |
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
90 drivers (each with a GeoJSON `location`), 60 riders, 420 rides, 8 fare configs, 8 commission
configs, 3 passes, 16 feature flags, 9 campaigns, 300 ledger entries, 12 SOS incidents, 30 audit
logs. Kolkata zones: Park Street, Salt Lake Sector V, Howrah Station, CCU Airport, New Town,
Ballygunge, Esplanade, Jadavpur (mirrored in `KOLKATA_ZONES` in `frontend/src/lib/types.ts`).
Live categories by default: bike, auto, cab, sedan, xl. Off: rentals, outstation, parcel.

## Maps
Leaflet with **keyless OpenStreetMap tiles**; the dark basemap is achieved by CSS-inverting
`.leaflet-tile-pane` in `index.css` (markers live in other panes and stay true-colour).
CARTO's dark basemap was dropped — it now stamps "API KEY REQUIRED" across every tile.

## Spec deviations (intentional — not bugs)
1. **FastAPI + MongoDB instead of NestJS + PostgreSQL/PostGIS**; user-approved.
2. **No Redis / BullMQ**: no driver-location heartbeat expiry worker, no offer timers, no payout
   batch jobs. Driver presence is a stored `is_online` flag an admin can override.
3. **No real-time dispatch engine**: `GET /api/dispatch/nearby-drivers` provides the 2dsphere
   nearest-driver *lookup*, but there are still no timed offers, accept/decline tracking, request
   locks, controlled search expansion, or 3–5 min request expiry. Ride states are admin-driven.
4. **RBAC is display-only** — roles are recorded and audited, not enforced per route.
5. **No third-party integrations**: no Razorpay, SMS/OTP, masked calling, push, or object storage.
   Map tiles are the only external call (CARTO dark basemap).
6. **No driver app** — driver-side progress is simulated from the rider trip screen. No payout
   execution. Rider app is a **web** app, not React Native.
7. **No geocoding or routing provider** — curated place list + haversine×1.35 distance.
8. **No payment gateway, SMS provider, or masked-calling provider** — all simulated.
7. Fare config is versioned via a counter; full historical version rows are not retained.

## Rider auth (updated)
- Landing (`/`) and booking (`/ride`) are fully public. `/api/rider/estimate` and `/api/rider/promos`
  no longer require the `wl_rider` cookie, so guests see live fares and offers.
- Sign-in happens in `rider/components/SignInModal.tsx` (arithmetic captcha -> OTP), triggered by
  `requireSignIn()` from `rider/lib/riderAuth.ts` when a guest taps Request ride, or opens /trips or /wallet.
- `RiderLayout` is now a single sticky header (Ride / My Trips / Wallet + Download app + session) with
  no bottom tab bar, matching the landing chrome.


# Backend v2 — complete rider / driver / admin surface (this session)

The driver client is a **React Native mobile app the user will build separately**; the
backend below is the contract it consumes. No driver web UI exists by design.

## New libs
| File | Role |
|---|---|
| `lib/rbac.py` | permission catalogue + `require("perm")` route dependency; roles: super_admin / fleet_manager / ops_lead. Reads open, every write gated, checked against the DB per request |
| `lib/driver_auth.py` | driver Bearer-token sessions (`driver_sessions`), `current_driver` / `approved_driver` |
| `lib/state_machine.py` | ride transition table + `assert_transition` (OTP gate lives here) |
| `lib/dispatch.py` | timed offers, one-lock-per-ride accept, radius expansion, search timeout (240s), heartbeat expiry (120s), scheduled release, `sweep()` |
| `lib/earnings.py` | one earnings engine for commission plan + zero-commission pass; driver ledger, penalties, summaries |
| `lib/fraud.py` | GPS-jump detection, ignored-offer priority decay, repeat-cancellation prepaid lock, OTP-bypass flags |

## New collections
`ride_offers`, `driver_sessions`, `driver_otps`, `driver_ledger`, `driver_passes`,
`payout_accounts`, `payout_runs`, `support_cases`, `fraud_flags`, `saved_places`,
`emergency_contacts`, `cron_runs` — all indexed in `lib/db.py`.

## Driver partner API (`/api/driver/*`, Bearer token)
auth request-otp / verify / register / logout · `me` · `profile` · `documents` (GET, POST submit
or re-upload) · `payout-account` (GET/PUT) · `online` · `presence` · `heartbeat` · `offers`,
`offers/{id}/accept`, `offers/{id}/decline` · `trips/active`, `trips`, `trips/{id}/arrived`,
`/start` (OTP), `/complete` (waiting + toll + cash-collected), `/cancel` · `earnings` · `ledger` ·
`passes`, `my-pass`, `passes/{id}/subscribe` · `incentives`, `incentives/{id}/claim` · `sos` ·
`disputes` (GET/POST) · `nearby-demand`.

## Admin API added
- `/api/dispatch/board`, `/dispatch/offers`, `/dispatch/sweep`, `/dispatch/rides/{id}/fan-out`, `/assign-nearest`
- `/api/finance/summary` (P&L), `/finance/export/rides`, `/finance/export/payouts` (CSV),
  `/api/rides/{id}/invoice` (GST invoice)
- `/api/payouts/pending`, `/payouts/runs` (create/list/get), `/payouts/runs/{id}/process`
  (debits partner balances + ledger; the bank/UPI transfer itself is MOCKED)
- `/api/support/cases` (list/get/create/notes/PATCH resolve → refund + penalty), `/api/fraud/flags`, PATCH decision
- `/api/auth/permissions` — what the signed-in admin may write

## Rider API added
`PATCH /rider/profile` · `/rider/places/saved` (GET/POST/DELETE) · `/rider/emergency-contacts`
(GET/POST/DELETE) · `/rider/rides/{id}/invoice` · `/rider/disputes` (GET/POST).
`/rider/rides/{id}/match` now drives the real dispatch engine (fan-out of timed offers, first
accept wins) and only falls back to nearest-driver assignment after 20s, so the web rider
journey stays demonstrable until the partner app ships.

## Scheduled work (`.emergent/crons.yml` + `/api/cron/*`, Bearer WEBHOOK_CRON_SECRET)
`dispatch-sweep` every 15 min · `campaign-life` hourly (activate/expire campaigns, expire passes) ·
`document-expiry` daily 04:00 IST (blocks partners with expired docs, prunes old offers).
All three ack immediately and run the work in a background task, keyed on `X-Webhook-Id`.

## Verification
`backend/tests/smoke_full_api.sh` — 52 assertions over the public URL covering admin auth/RBAC,
partner onboarding → KYC → online → heartbeat → offer accept → OTP trip → settlement → payout,
rider invoice/dispute/extras and the cron endpoints (incl. negative cases).
