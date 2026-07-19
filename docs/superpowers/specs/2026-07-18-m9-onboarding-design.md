# M9 — Onboarding

**Date:** 2026-07-18
**Status:** Approved. Next step: `writing-plans`.
**Project:** 1 (The Platform). See `docs/superpowers/specs/2026-07-14-v1-roadmap-design.md`.
**Migration:** Flyway **V13**.

## Why this milestone exists

A gym cannot exist on BoxHub without a superadmin hand-running `POST /api/admin/boxes` and hand-delivering an
invite. Self-serve onboarding is the hard prerequisite for every later milestone: the pilot's accept criterion is a
real box running on BoxHub, and a real box must be able to register itself and invite its people.

## Decisions (locked)

| Question | Decision |
|---|---|
| Signup vs M8 verification | **One form, verify after.** Box name + owner name/email/password in one submit → unverified owner + PENDING box + BOX_ADMIN membership created atomically → M8 verify mail → clicking the link logs the owner in and lands them in their box's first-run. Verification and approval proceed in parallel. |
| Cap × signup-mode | `signup_mode = OPEN \| APPROVAL \| CLOSED` (runtime setting, ships **APPROVAL**). `max_boxes = 100` counts **ACTIVE + PENDING**. At cap — or mode CLOSED — the public page captures email + box name into a **waitlist** table (capture-only; contacting waitlisted gyms is manual; auto-notify = backlog). |
| Rejection | **REJECTED terminal status, data kept.** Owner keeps their normal account, gets a rejection email; anything prepared while PENDING becomes unreachable (box-token 403s). Slug stays taken (freeing = backlog). |
| Slug | **Auto-generated** from box name (lowercase/dashes, `-2` suffix dedupe). Rename = backlog. |

## 1. Data model (V13)

- **`boxes`**: `status text NOT NULL DEFAULT 'ACTIVE'` + CHECK (`PENDING|ACTIVE|SUSPENDED|REJECTED`) — existing rows
  backfill ACTIVE (default covers it); `created_at timestamptz NOT NULL DEFAULT now()`.
- **`platform_settings`** (new): `key text PRIMARY KEY, value text NOT NULL`. Seed `signup_mode='APPROVAL'`,
  `max_boxes='100'`. NOT box-scoped, NOT `@TenantId`. Read through a small `PlatformSettings` service with a short
  in-memory cache (single node — same tradeoff as the rate limiter); superadmin PATCH busts it.
- **`box_waitlist`** (new): `id, email text UNIQUE NOT NULL, box_name text NOT NULL, created_at`.

## 2. Signup endpoint

`POST /api/auth/signup-box {boxName, name, email, password}` — permitAll, added to the per-IP rate-limit set and to
`CookieBearerTokenResolver.PUBLIC_AUTH_PATHS`.

- **Under cap, mode OPEN** → box **ACTIVE**. **Under cap, mode APPROVAL** → box **PENDING**. Either way, atomically:
  unverified owner via the M8 register path (password policy, HIBP, unconditional-encode timing parity), box with the
  slugified name, BOX_ADMIN membership; then the verify mail (its copy doubles as "signup received" — one mail, not
  two). Response **201, body built from the request only** (M8 anti-enumeration invariant).
- **Existing email** → same 201 shape, "someone tried to sign up" mail to the real owner, **no box created**. No
  observable difference.
- **At cap or CLOSED** → 200 `{full: true}`; the FE swaps to the waitlist form. `POST /api/auth/waitlist
  {email, boxName}` → always 202, duplicate emails swallowed. Also rate-limited per IP.
- `GET /api/auth/signup-mode` (public) → `{open: boolean}` so the page renders the right form without a probe.

## 3. Status gating

**One choke point for reachability: box-token mint.** `AuthController.boxToken` loads the box; `SUSPENDED` or
`REJECTED` → 403 `BOX_SUSPENDED` — the kill switch. The 15-minute `bh_bt` TTL bounds the tail of already-minted
tokens. `PENDING` mints normally: the owner must be able to prepare their box.

**PENDING-specific blocks** (403 `BOX_PENDING`):
- Invite creation (`InviteAdminController.create`).
- TV claim (`TvPairingService.claim`).

**TV reachability**: `TvStreamService` connect checks the box is ACTIVE, and suspend/reject disconnects live emitters
(same seam as device revoke). A suspended box's TVs go dark.

Everything else works while PENDING: class types, schedule, settings, media, programming.

## 4. Superadmin API + console

Backend under `/api/admin/**` (already `ROLE_SUPERADMIN` via the JWT claim; console runs on the **user token** — no
box token, no tenancy): `GET /boxes?status=`, `POST /boxes/{id}/approve` (→ACTIVE + "you're live" mail),
`/reject` (→REJECTED + notice mail), `/suspend`, `/reactivate`; `GET /waitlist`; `GET/PATCH /settings`
(signup_mode, max_boxes — PATCH busts the cache). Approve refuses past the cap. `Box`/`Membership` are not
`@TenantId` (only Plan/Invite are) — plain JPQL is safe here.

Frontend: new minimal `/superadmin` surface, route-guarded on the superadmin JWT claim — `AuthService.session` must
start exposing it (`GET /api/me` gains `superadmin: boolean`). Screens: pending queue (approve/reject), all-boxes
table (suspend/reactivate), waitlist list, settings toggle. Plain plumbing from `bh-*` components; M12 restyles.
The existing `features/admin` (BOX_ADMIN shell) is untouched.

## 5. First-run (light, not a wizard)

Post-verify the owner lands in their box. While PENDING: a banner in the admin shell — "Set up now; members unlock
on approval" — and the dashboard shows a three-step guide driven by real state (has class types? has a schedule?
invites unlocked?). The invite and TV pages explain the pending state instead of surfacing raw 403s. No new backend.

## 6. Emails

M8 Mailer + Thymeleaf, two new templates: `box-approved` (CTA into the app), `box-rejected`. The signup
acknowledgement rides the existing verify template's copy. Waitlist sends nothing.

## 7. Testing

Backend: signup-box happy (OPEN→ACTIVE, APPROVAL→PENDING), at-cap `{full:true}`, existing-email parity (body +
no box created), slug dedupe, waitlist 202 + duplicate swallow; gates — PENDING: invite 403, TV claim 403,
class-type create allowed; SUSPENDED: box-token 403, stream connect refused, live emitter disconnected; transitions
approve/reject/suspend/reactivate + emails + approve-past-cap refusal; cap counts ACTIVE+PENDING only; settings
PATCH busts the cache; **role-denied on every new `/api/admin` endpoint** (a BOX_ADMIN box token must not pass).
E2E: signup-box → verify link from Mailpit → land in PENDING box → superadmin approves → invite creation unlocks.
Frontend: superadmin guard, signup/waitlist branch, pending-banner state.

## Out of scope (→ `docs/BACKLOG.md`)

Existing-user-creates-second-box; slug rename / freeing REJECTED slugs; waitlist auto-notify; superadmin audit log;
approval SLA/reminders.
