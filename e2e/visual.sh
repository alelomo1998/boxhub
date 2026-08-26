#!/usr/bin/env bash
# Visual regression runs ONLY here, inside the same Linux renderer that enforces it.
#
# Baselines generated on macOS and enforced on Linux is not a stricter check, it is no check at
# all: Playwright suffixes snapshot paths by platform, so each side silently ignores the other's
# files. snapshotPathTemplate drops {platform}, and this script is the only thing that writes them.
#
# Image tag is pinned to the installed @playwright/test version (verify with
# `node -e "console.log(require('@playwright/test/package.json').version)"` in e2e/) — a container
# Playwright that differs from the local one renders differently, and the resulting baseline churn
# looks exactly like a real regression.
#
#   ./visual.sh                    verify against the committed baselines
#   ./visual.sh --update-snapshots regenerate them (review the diff before committing)
set -euo pipefail

cd "$(dirname "$0")"

# host.docker.internal reaches the compose stack from inside the container. --network host does
# not work on Docker Desktop for macOS, which is why baseURL is env-driven.
docker run --rm \
  -v "$PWD:/e2e" -w /e2e \
  -e BH_VISUAL=1 \
  -e E2E_BASE_URL=http://host.docker.internal \
  mcr.microsoft.com/playwright:v1.62.1-noble \
  npx playwright test visual.spec.ts "$@"
