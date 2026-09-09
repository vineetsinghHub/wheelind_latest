#!/usr/bin/env bash
# End-to-end smoke over the full Wheelind API: admin RBAC, driver partner app, dispatch
# offers, OTP trip, earnings, payouts, invoices, support cases and cron.
set -u
B="${1:-https://wheelind-admin.preview.emergentagent.com}"
AC=/tmp/wl_admin.txt
RC=/tmp/wl_rider.txt
rm -f $AC $RC
pass=0; fail=0
chk() { # chk <label> <expected> <actual>
  if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; pass=$((pass+1));
  else echo "  FAIL $1 expected=$2 got=$3"; fail=$((fail+1)); fi
}
code() { curl -s -o /tmp/wl_body.json -w "%{http_code}" "$@"; }

echo "== admin auth =="
chk "admin login" 200 "$(code -c $AC -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@wheelind.in","password":"Wheelind@2026"}')"
chk "permissions" 200 "$(code -b $AC $B/api/auth/permissions)"; cat /tmp/wl_body.json; echo
chk "finance summary" 200 "$(code -b $AC "$B/api/finance/summary?days=30")"
chk "dispatch board" 200 "$(code -b $AC $B/api/dispatch/board)"
chk "dispatch sweep" 200 "$(code -b $AC -X POST $B/api/dispatch/sweep)"; cat /tmp/wl_body.json; echo
chk "support cases" 200 "$(code -b $AC $B/api/support/cases)"
chk "fraud flags" 200 "$(code -b $AC $B/api/fraud/flags)"
chk "pending payouts" 200 "$(code -b $AC "$B/api/payouts/pending?minimum=1")"
chk "rides csv export" 200 "$(code -b $AC "$B/api/finance/export/rides?days=7")"

echo "== driver partner app =="
PH="+9198$((RANDOM % 90000000 + 10000000))"
chk "driver otp" 200 "$(code -X POST $B/api/driver/auth/request-otp -H 'Content-Type: application/json' -d "{\"phone\":\"$PH\"}")"
chk "driver register" 200 "$(code -X POST $B/api/driver/auth/register -H 'Content-Type: application/json' -d "{\"phone\":\"$PH\",\"name\":\"Smoke Partner\",\"category\":\"bike\",\"vehicle_model\":\"Activa 6G\",\"vehicle_number\":\"WB01SM0001\"}")"
TOK=$(python3 -c "import json;print(json.load(open('/tmp/wl_body.json'))['token'])")
DID=$(python3 -c "import json;print(json.load(open('/tmp/wl_body.json'))['driver']['id'])")
AUTH="Authorization: Bearer $TOK"
chk "driver me" 200 "$(code -H "$AUTH" $B/api/driver/me)"
chk "documents" 200 "$(code -H "$AUTH" $B/api/driver/documents)"
chk "submit doc" 200 "$(code -X POST -H "$AUTH" -H 'Content-Type: application/json' $B/api/driver/documents -d '{"type":"Driving Licence","number":"WB0120250001"}')"
chk "payout account" 200 "$(code -X PUT -H "$AUTH" -H 'Content-Type: application/json' $B/api/driver/payout-account -d '{"method":"upi","upi_id":"smoke@upi"}')"
chk "online blocked before kyc" 403 "$(code -X POST -H "$AUTH" -H 'Content-Type: application/json' $B/api/driver/online -d '{"is_online":true}')"

chk "admin approves kyc" 200 "$(code -b $AC -X PATCH $B/api/drivers/$DID/kyc -H 'Content-Type: application/json' -d '{"status":"approved","note":"smoke"}')"
chk "go online" 200 "$(code -X POST -H "$AUTH" -H 'Content-Type: application/json' $B/api/driver/online -d '{"is_online":true,"lat":22.5535,"lng":88.3520}')"
chk "heartbeat" 200 "$(code -X POST -H "$AUTH" -H 'Content-Type: application/json' $B/api/driver/heartbeat -d '{"lat":22.5540,"lng":88.3525,"speed_kmph":22}')"
chk "presence" 200 "$(code -H "$AUTH" $B/api/driver/presence)"; cat /tmp/wl_body.json; echo
chk "nearby demand" 200 "$(code -H "$AUTH" $B/api/driver/nearby-demand)"
chk "passes" 200 "$(code -H "$AUTH" $B/api/driver/passes)"
chk "incentives" 200 "$(code -H "$AUTH" $B/api/driver/incentives)"

echo "== rider books, driver accepts the offer =="
RPH="+919830112233"
chk "rider otp" 200 "$(code -c $RC -X POST $B/api/rider/auth/request-otp -H 'Content-Type: application/json' -d "{\"phone\":\"$RPH\"}")"
OTP=$(python3 -c "import json;print(json.load(open('/tmp/wl_body.json'))['otp_hint'])")
chk "rider verify" 200 "$(code -b $RC -c $RC -X POST $B/api/rider/auth/verify -H 'Content-Type: application/json' -d "{\"phone\":\"$RPH\",\"otp\":\"$OTP\"}")"
# clear any live ride so booking is allowed
ACT=$(curl -s -b $RC $B/api/rider/rides/active)
AID=$(python3 -c "
import json,sys
d=json.loads('''$ACT''' or 'null')
print(d['ride']['id'] if d else '')" 2>/dev/null)
[ -n "$AID" ] && curl -s -b $RC -X POST $B/api/rider/rides/$AID/cancel >/dev/null
chk "book ride" 200 "$(code -b $RC -X POST $B/api/rider/rides -H 'Content-Type: application/json' -d '{"category":"bike","pickup":"Park Street","drop":"Salt Lake Sector III","pickup_lat":22.5535,"pickup_lng":88.3520,"drop_lat":22.5800,"drop_lng":88.4100,"payment_method":"cash","rider_added_fare":0}')"
RIDE=$(python3 -c "import json;d=json.load(open('/tmp/wl_body.json'));print(d['id'])")
ROTP=$(python3 -c "import json;d=json.load(open('/tmp/wl_body.json'));print(d['otp'])")
chk "rider match poll" 200 "$(code -b $RC -X POST $B/api/rider/rides/$RIDE/match)"
chk "driver sees offers" 200 "$(code -H "$AUTH" $B/api/driver/offers)"
OFFER=$(python3 -c "
import json
o=json.load(open('/tmp/wl_body.json'))
print(o[0]['id'] if o else '')")
if [ -n "$OFFER" ]; then
  chk "accept offer" 200 "$(code -X POST -H "$AUTH" $B/api/driver/offers/$OFFER/accept)"
else
  echo "  info no offer in this wave (another partner may hold the lock) — assigning nearest"
  chk "admin assign nearest" 200 "$(code -b $AC -X POST $B/api/dispatch/rides/$RIDE/assign-nearest)"
fi
chk "driver active trip" 200 "$(code -H "$AUTH" $B/api/driver/trips/active)"
chk "arrived" 200 "$(code -X POST -H "$AUTH" $B/api/driver/trips/$RIDE/arrived)"
chk "wrong otp blocked" 422 "$(code -X POST -H "$AUTH" -H 'Content-Type: application/json' $B/api/driver/trips/$RIDE/start -d '{"otp":"0000"}')"
chk "start with otp" 200 "$(code -X POST -H "$AUTH" -H 'Content-Type: application/json' $B/api/driver/trips/$RIDE/start -d "{\"otp\":\"$ROTP\"}")"
chk "complete trip" 200 "$(code -X POST -H "$AUTH" -H 'Content-Type: application/json' $B/api/driver/trips/$RIDE/complete -d '{"waiting_min":2,"toll_parking":0,"cash_collected":true}')"
chk "earnings" 200 "$(code -H "$AUTH" $B/api/driver/earnings)"; cat /tmp/wl_body.json; echo
chk "driver ledger" 200 "$(code -H "$AUTH" $B/api/driver/ledger)"
chk "rider invoice" 200 "$(code -b $RC $B/api/rider/rides/$RIDE/invoice)"
chk "rider dispute" 200 "$(code -b $RC -X POST $B/api/rider/disputes -H 'Content-Type: application/json' -d "{\"kind\":\"fare_dispute\",\"subject\":\"Fare looks high\",\"detail\":\"smoke\",\"ride_id\":\"$RIDE\",\"amount_claimed\":20}")"
CASE=$(python3 -c "import json;print(json.load(open('/tmp/wl_body.json'))['id'])")
chk "admin resolves case" 200 "$(code -b $AC -X PATCH $B/api/support/cases/$CASE -H 'Content-Type: application/json' -d '{"status":"resolved","resolution":"Goodwill refund","refund_amount":20,"penalty_amount":0}')"

echo "== rider extras =="
chk "saved place add" 200 "$(code -b $RC -X POST $B/api/rider/places/saved -H 'Content-Type: application/json' -d '{"label":"Home","name":"Ballygunge","area":"South Kolkata","lat":22.52,"lng":88.36}')"
PLACE=$(python3 -c "import json;print(json.load(open('/tmp/wl_body.json'))['id'])")
chk "saved places list" 200 "$(code -b $RC $B/api/rider/places/saved)"
chk "saved place delete" 200 "$(code -b $RC -X DELETE $B/api/rider/places/saved/$PLACE)"
chk "emergency contact" 200 "$(code -b $RC -X POST $B/api/rider/emergency-contacts -H 'Content-Type: application/json' -d '{"name":"Ma","phone":"+919830000000","relation":"family"}')"
chk "rider profile" 200 "$(code -b $RC -X PATCH $B/api/rider/profile -H 'Content-Type: application/json' -d '{"name":"Wheelind Rider"}')"

echo "== payout run =="
chk "create payout run" 200 "$(code -b $AC -X POST $B/api/payouts/runs -H 'Content-Type: application/json' -d '{"days":7,"minimum_amount":1,"note":"smoke run"}')"
RUN=$(python3 -c "import json;print(json.load(open('/tmp/wl_body.json'))['id'])")
chk "process payout run" 200 "$(code -b $AC -X POST $B/api/payouts/runs/$RUN/process)"
chk "payout runs list" 200 "$(code -b $AC $B/api/payouts/runs)"

echo "== cron =="
SECRET=$(grep WEBHOOK_CRON_SECRET /app/backend/.env | cut -d= -f2)
chk "cron unauthorised" 401 "$(code -X POST $B/api/cron/dispatch-sweep)"
chk "cron sweep" 200 "$(code -X POST $B/api/cron/dispatch-sweep -H "Authorization: Bearer $SECRET" -H 'X-Webhook-Id: smoke-1' -H 'Content-Type: application/json' -d '{"event":"schedule.triggered","run_id":"smoke-1"}')"
chk "cron idempotent" 200 "$(code -X POST $B/api/cron/dispatch-sweep -H "Authorization: Bearer $SECRET" -H 'X-Webhook-Id: smoke-1' -H 'Content-Type: application/json' -d '{"event":"schedule.triggered","run_id":"smoke-1"}')"
chk "cron campaigns" 200 "$(code -X POST $B/api/cron/campaign-lifecycle -H "Authorization: Bearer $SECRET" -H 'X-Webhook-Id: smoke-2')"
chk "cron documents" 200 "$(code -X POST $B/api/cron/document-expiry -H "Authorization: Bearer $SECRET" -H 'X-Webhook-Id: smoke-3')"

echo
echo "PASS=$pass FAIL=$fail"
[ "$fail" = 0 ]
