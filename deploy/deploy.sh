#!/usr/bin/env bash
# Deploy BoxHub to a VPS over ssh. Usage: ./deploy/deploy.sh user@host
# Prereqs on VPS: docker + docker compose plugin + curl, and /opt/boxhub/docker/.env built from
# docker/.env.example with EVERY DEV-ONLY value regenerated (the file says how) plus:
#   SPRING_PROFILES_ACTIVE=        (empty — 'dev' seeds demo accounts into production)
#   BOXHUB_COOKIE_SECURE=true
set -euo pipefail

HOST="${1:?usage: deploy.sh user@host}"
REMOTE_ENV=/opt/boxhub/docker/.env

ssh "$HOST" 'mkdir -p /opt/boxhub'

# Checked BEFORE rsync: refusing after shipping the code leaves a half-deployed host.
ssh "$HOST" "test -f $REMOTE_ENV" || {
  echo "ERROR: $REMOTE_ENV missing on VPS — build it from docker/.env.example before deploying"; exit 1; }

# The committed dev values, verbatim. A .env still carrying one of these is docker/.env.example
# copied unedited: the JWT secret mints BOX_ADMIN tokens for any box, the media secret forges any
# signed media URL, and SPRING_PROFILES_ACTIVE=dev activates DevDataSeeder, which would seed
# admin@demo.io and a superadmin on a README-published password into production.
DEV_SENTINELS='dev-only-secret-must-be-at-least-32-bytes!|dev-only-media-link-secret-change-me|AkuNetEmYeBStw8saSIH351fqJMEG2Y6o7ds3YFu/wc=|^POSTGRES_PASSWORD=boxhub$|^SPRING_PROFILES_ACTIVE=dev$'
if ssh "$HOST" "grep -Eq '$DEV_SENTINELS' $REMOTE_ENV"; then
  echo "ERROR: $REMOTE_ENV still contains DEV-ONLY values or SPRING_PROFILES_ACTIVE=dev."
  echo "       Regenerate every DEV-ONLY value (see docker/.env.example) before deploying."
  exit 1
fi

rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'target' --exclude 'dist' --exclude 'docker/.env' \
  ./ "$HOST":/opt/boxhub/
ssh "$HOST" 'cd /opt/boxhub/docker && docker compose up -d --build'
ssh "$HOST" 'for i in $(seq 1 60); do curl -fsS http://localhost/actuator/health && exit 0 || sleep 2; done; echo "health check failed"; exit 1'
echo "Deployed OK."
