#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

# These values exist only in the isolated CI job. No provider call or customer data is involved.
export LAUNCH_READINESS_ENV=staging
export WEB_ORIGIN=https://app.example.test
export PUBLIC_API_URL=https://api.example.test
export NEXT_PUBLIC_API_URL=https://api.example.test/api/v1
export NEXT_PUBLIC_SITE_URL=https://app.example.test
export MONGODB_URI='mongodb://mongo:27017/pcc_image_smoke?replicaSet=rs0'
export JWT_ACCESS_SECRET="$(openssl rand -hex 48)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 48)"
export EMAIL_PROVIDER=RESEND
export EMAIL_FROM=smoke@example.test
export EMAIL_SENDING_DOMAIN=example.test
export EMAIL_DOMAIN_VERIFIED=true
export RESEND_API_KEY=ci-smoke-only-no-provider-access
export SMS_ENABLED=false
export MPESA_ENABLED=false
export PAYSTACK_ENABLED=false
export DOCUMENT_STORAGE_ENABLED=false
export CCTV_ENABLED=false

compose=(docker compose -p pcc-image-smoke -f docker-compose.coolify.yml -f infrastructure/deployment/docker-compose.smoke.yml)
cleanup() {
  result=$?
  if (( result != 0 )); then
    "${compose[@]}" ps || true
    "${compose[@]}" logs --tail 60 api worker web mongo || true
  fi
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "$result"
}
trap cleanup EXIT

"${compose[@]}" config --quiet
"${compose[@]}" build api web
"${compose[@]}" up -d --wait --wait-timeout 120 mongo
"${compose[@]}" exec -T mongo mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"mongo:27017"}]})'

primary=false
for attempt in {1..30}; do
  if [[ "$("${compose[@]}" exec -T mongo mongosh --quiet --eval 'db.hello().isWritablePrimary' 2>/dev/null | tr -d '\r')" == "true" ]]; then
    primary=true
    break
  fi
  sleep 2
done
if [[ "$primary" != true ]]; then
  echo 'MongoDB smoke replica set did not elect a primary' >&2
  exit 1
fi

"${compose[@]}" up -d --no-build --wait --wait-timeout 180 api worker web
"${compose[@]}" exec -T api node -e "fetch('http://127.0.0.1:9000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
"${compose[@]}" exec -T web node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

heartbeat=false
for attempt in {1..30}; do
  if [[ "$("${compose[@]}" exec -T mongo mongosh --quiet pcc_image_smoke --eval 'db.platformheartbeats.countDocuments({environment:"staging",kind:"WORKER"})' 2>/dev/null | tr -d '\r')" =~ ^[1-9][0-9]*$ ]]; then
    heartbeat=true
    break
  fi
  sleep 2
done
if [[ "$heartbeat" != true ]]; then
  echo 'Worker did not persist a staging heartbeat' >&2
  exit 1
fi

echo 'PASS: Coolify Compose image build, API readiness, web response and worker heartbeat (synthetic CI data)'
