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
  --exclude '.git' --exclude 'node_modules' --exclude 'target' --exclude 'dist' \
  ./ "$HOST":/opt/boxhub/
ssh "$HOST" 'cd /opt/boxhub/docker && docker compose up -d --build'
ssh "$HOST" 'for i in $(seq 1 60); do curl -fsS http://localhost/actuator/health && exit 0 || sleep 2; done; echo "health check failed"; exit 1'
echo "Deployed OK."
