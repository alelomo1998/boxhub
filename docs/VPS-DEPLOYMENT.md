# VPS Deployment Context

This document records the agreed infrastructure target for rxed (formerly BoxHub). It is
operational context, not permission to redesign the application or deployment architecture.

## Product And Load Shape

rxed is a multi-tenant CrossFit box platform:

- Angular frontend served as static files by nginx.
- Spring Boot 3.5 / Java 21 backend.
- PostgreSQL 16 database.
- Authentication, box memberships, scheduling, bookings, waitlists and check-in.
- WOD programming, scores, PRs and leaderboards.
- TV pairing and live board updates over Server-Sent Events.
- Small JPEG/PNG media uploads, maximum 5 MB per upload.
- Stripe integration, optional Google SSO and transactional email.

The current architecture is intentionally a single-node Docker Compose deployment. It does not
require Kubernetes, Redis, a message broker, server-side rendering, video transcoding or a second
application node. In-memory SSE connections, rate limits and caches are deliberate single-node
tradeoffs.

## Agreed OVHcloud Target

Current order: OVHcloud VPS-2 2027 in Europe, Strasbourg.

| Resource | Target |
|---|---|
| CPU | 4 vCores |
| Memory | 8 GB RAM |
| Primary disk | 75 GB SSD NVMe |
| Additional disk | 50 GB local storage |
| Network | Up to 1 Gbps public bandwidth |
| Traffic | Unlimited, subject to provider terms |
| Public address | Dedicated IPv4 included |
| Operating system | Ubuntu 26.04 |
| Backup option | Automated Backup Standard, currently promotional |

This sizing is sufficient for the pilot and initial production with moderate traffic. The 4 vCores
and 8 GB RAM are not the limiting concern for the current workload. The main capacity risks are
database/media growth, Docker build cache and backups.

## Disk Rules

The extra 50 GB disk is not used automatically by Docker named volumes. Mounting and assigning it
must be an explicit deployment decision; do not assume that `pgdata` or `media` moves there by
itself.

- Keep PostgreSQL data on the 75 GB NVMe disk unless measured storage growth requires otherwise.
- Use the additional disk for media only after confirming its mount, persistence and backup policy.
- Keep Docker images, build cache and system logs under observation.
- Do not store the only copy of database or media backups on the VPS.

## OVHcloud Backup Limits

The included Standard VPS backup is reported as daily with one day of retention. It is replicated
within the same datacenter and does not cover additional disks. It is useful for basic rollback,
but it is not a complete disaster-recovery plan.

Production must also have an independent backup path, at minimum:

- regular PostgreSQL logical dumps copied off the VPS;
- media copied or backed up independently if stored on the additional disk;
- a restore test before treating the deployment as production-safe.

Never put credentials, `.env` contents, tokens or encryption keys in this document.

## Deployment Constraints

The existing deployment path is `deploy/deploy.sh` and expects Docker, the Docker Compose plugin
and `curl` on the VPS. It deploys to `/opt/boxhub`, refuses a missing or development `.env`, syncs
the repository with `rsync --delete`, builds the images on the VPS and checks the backend health
through nginx.

Before a real deployment:

- use production secrets and leave `SPRING_PROFILES_ACTIVE` empty;
- set `BOXHUB_COOKIE_SECURE=true` when serving HTTPS;
- confirm DNS, firewall, SSH hardening and real TLS termination;
- take and verify a database backup before destructive or schema-changing operations;
- expect the first Docker build to temporarily use more CPU, RAM and disk than steady state.

## Known Pre-Production Blockers

These are recorded so they are not mistaken for VPS sizing problems:

- The current Compose topology points backend SMTP at the bundled Mailpit service. Real email
  delivery must be configured before relying on verification, reset or invite emails in production.
- The standard frontend Compose service serves HTTP. The TLS profile uses development certificate
  material and is not a production certificate solution.
- The OVH backup option does not replace independent PostgreSQL and media backups.

Do not fix these items by changing unrelated application code or by replacing the single-node
architecture. Address them as explicit deployment tasks with their own verification.
