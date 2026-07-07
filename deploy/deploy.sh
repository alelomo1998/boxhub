#!/usr/bin/env bash
# Deploy BoxHub to a VPS over ssh. Usage: ./deploy/deploy.sh user@host
# Prereqs on VPS: docker + docker compose plugin + curl; /opt/boxhub/docker/.env with:
#   SPRING_PROFILE=prod
#   BOXHUB_JWT_SECRET=<openssl rand -base64 48>
#   POSTGRES_PASSWORD=<strong password>
set -euo pipefail

HOST="${1:?usage: deploy.sh user@host}"

ssh "$HOST" 'mkdir -p /opt/boxhub'
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'target' --exclude 'dist' --exclude 'docker/.env' \
  ./ "$HOST":/opt/boxhub/
ssh "$HOST" 'test -f /opt/boxhub/docker/.env' || { echo "ERROR: /opt/boxhub/docker/.env missing on VPS — create it (see header) before deploying"; exit 1; }
ssh "$HOST" 'cd /opt/boxhub/docker && docker compose up -d --build'
ssh "$HOST" 'for i in $(seq 1 60); do curl -fsS http://localhost/actuator/health && exit 0 || sleep 2; done; echo "health check failed"; exit 1'
echo "Deployed OK."
