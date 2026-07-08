# BoxHub

CrossFit box platform: athletes, coaches, box admins, TV whiteboard. See
`docs/superpowers/specs/2026-07-07-boxhub-design.md` (master spec — read first)
and `docs/superpowers/plans/` (milestone plans).

## Dev

- Backend: `cd backend && SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run` (needs local Postgres
  or use compose db: `docker compose -f docker/docker-compose.yml up -d db`)
- Frontend: `cd frontend && npm start` (proxies /api to :8080)
- Full stack: `docker compose -f docker/docker-compose.yml up --build` → http://localhost
- Dev users (profile `dev`): admin@demo.io / coach@demo.io / athlete@demo.io — password `password123`
- Admin panel: log in as admin@demo.io → /admin (members, invites, plans, settings). Invites are shareable links (no email sending yet).
- Tests: `cd backend && mvn verify` · `cd frontend && npm test` · `cd e2e && npx playwright test`

## Deploy

`./deploy/deploy.sh user@vps` — see script header for VPS prereqs (.env with prod secrets).

## Rules

Milestone lock (work only the active milestone) · Flyway-only schema changes ·
cross-tenant denial tests mandatory · conventional commits · ADRs in docs/adr/.
Out-of-scope ideas → `docs/BACKLOG.md`.
