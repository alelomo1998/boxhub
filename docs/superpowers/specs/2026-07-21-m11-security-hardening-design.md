# M11 — Security Hardening

**Date:** 2026-07-21
**Status:** Approved. Next step: `writing-plans`.
**Project:** 1 (The Platform). See `docs/superpowers/specs/2026-07-14-v1-roadmap-design.md`.
**Migration:** Flyway **V15** (superadmin audit log; media/token changes are config, not schema).

## Why this milestone exists

Every backend domain now exists, so the whole server surface can harden in one pass — and nothing later gets built
on top of an un-hardened auth surface. M8 made accounts real; M9 opened self-serve signup to the public internet;
M10 introduced money and per-box Stripe credentials. The attack surface has grown three times without a
corresponding pass over it.

The bar is **public-launch-safe**, not pilot-safe: assume a hostile internet **and hostile tenants** — any box
admin may attack another box, any athlete may attack their own box.

## Decisions (locked in brainstorm)

| Question | Decision |
|---|---|
| Threat model | **Public-launch-safe.** Hostile internet + hostile tenants. Not "one trusted pilot box". |
| App vs infra | **App + secrets handling.** TLS, firewall, SSH, backups, restore drills belong to the Launch → Production phase, against a real host. Keeps M11 verifiable in CI. |
| How tenancy is proven | **Automated conformance sweep** over Spring's own route table — a standing guarantee, not a one-time audit. |
| Media reads | **Signed, short-lived URLs** validated by nginx. Not an authenticated Java proxy, not "unguessable is enough". |
| Rate limiting | **Extend to abuse-prone endpoints** + a global per-IP ceiling. Stays in-memory/single-node; Redis remains the documented upgrade. |
| Milestone shape | **One milestone, sweep first.** Task 1 builds *and runs* the sweep so its findings shape the remaining tasks. |
| Superadmin audit | **Minimal now** (append-only, 5 lifecycle actions, plain list view). Full audit → backlog. |
| Per-session kill | **In scope.** `DELETE /api/auth/sessions/{id}` — "I lost my phone" is the real case. |
| MFA | **Out of scope.** Gets its own milestone, **M14**, added to the roadmap. |

## 1. The conformance sweep (the spine)

A test that asks Spring for its route table (`RequestMappingHandlerMapping`) and, for every mapped route, asserts
three denials:

1. **No credentials** → 401
2. **A foreign box's token** (valid user, valid box, wrong box) → 403/404
3. **Insufficient role** (athlete token against an admin route) → 403

Two properties make this real rather than decorative:

**The allowlist is the security artifact.** Endpoints that legitimately are not box-scoped — `/api/auth/**`,
`/api/stripe/webhook`, `/api/tv/pair`, `/api/tv/pair/poll`, the public invite preview — live in an explicit
allowlist, each entry carrying a written justification. **The default is deny:** an endpoint added in a later
milestone that nobody thought about fails CI until someone either secures it or consciously allowlists it.

**A 400 is a failure, not a pass.** If a route rejects a foreign-box request with "400 bad body", validation ran
*before* authorization — which means the test learned nothing about whether authz exists, and a well-formed
request might sail through. The assertion is "responded with a denial"; a 400 fails the sweep and is fixed by
moving the authz check ahead of validation.

**The sweep runs in Task 1 and produces a finding list.** Later tasks fix what it reports. This spec deliberately
does not pretend to know today whether that list has 2 entries or 30.

## 2. Confidentiality

### 2.1 Signed media URLs

`POST /api/box/media` is unchanged; reads change. The API mints a signed, expiring URL at the point where it
already knows who is asking — in the DTO builder — and **nginx validates the signature itself** (`secure_link`),
keeping Java out of the image hot path.

- **Per-image-class rules, named explicitly.** An athlete avatar is visible to members of that box (the M5 privacy
  rule: photo + name always visible to box members). A **box logo is public** — it renders on invite previews
  before login. Class-type photos are box-members-only. The minting call encodes which rule applies.
- **The TV is the hard case.** A board left running all day would watch its URLs expire underneath it. It already
  re-renders from SSE pushes, so **each push carries freshly-minted URLs** — which is what lets the token lifetime
  stay short (~10 minutes) without breaking the room.
- **EXIF stripping on upload** rides along, since the upload path is already being touched. GPS in a member's gym
  photo is indefensible at launch.

**Mechanism caveat, recorded deliberately:** nginx `secure_link` uses MD5 as a *keyed* digest (secret appended, so
no length-extension). Forgery requires the secret, not a collision, and this is the standard nginx mechanism. If
MD5 is judged unacceptable during implementation, the fallback is `auth_request` to Spring: one cheap authz call
per image, still no file bytes through the JVM.

### 2.2 TV stream token off the query string

Today a 400-day HS256 JWT rides in `?token=` on `/api/tv/stream` and lands in nginx access logs. It moves to an
**httpOnly cookie scoped to `/api/tv`**, set at pair-claim — `EventSource` sends cookies natively, so the token
leaves the URL entirely. Revocation is still checked on connect. nginx stops logging query strings on that path.

## 3. Secrets and the payment surface

**Codify the M10 lesson.** A real AES key shipped as an `application.yml` default and would have let a keyless
production deploy boot happily, encrypting every box's Stripe credentials with a key committed to the repo. The
rule: **no secret gets a working default; a missing secret fails startup.** Enforced by a test that scans config
for secret-bearing properties and fails on any usable fallback — same fail-closed shape as the sweep, so it cannot
regress later.

**Key rotation is currently impossible.** `BOXHUB_STRIPE_ENC_KEY` is a single AES-GCM key; rotating it orphans
every box's stored Stripe credentials and forces every box to re-enter their keys. Fix is **key versioning**:
ciphertext carries a key id, decrypt supports old keys, encrypt always uses the current one.

**Log hygiene, proven not asserted.** A test drives auth, Stripe connect and the webhook while capturing logs, and
fails if any known secret value, JWT, or session cookie appears.

**Payment surface.** Close M10's known leftover: the webhook answers 200 for an unknown session id but 400 for a
known one whose box has no credentials — an existence oracle over Stripe session ids for an unauthenticated
caller. Make it uniform. Plus a targeted check that a box's restricted key cannot escape through any DTO, error
body, or exception message.

**Superadmin audit log (minimal).** Append-only table (**Flyway V15**), one row per superadmin lifecycle action —
approve, reject, suspend, reactivate, settings change — recording actor email, action, target box, and timestamp,
plus a plain list in the existing superadmin console. The richer version (every admin action, member-data access,
hash-chained immutability, retention, search/filter, export) is backlogged.

**Per-session kill.** `DELETE /api/auth/sessions/{id}` revokes one refresh-token family. M8 shipped the sessions
list and logout-everywhere; the actual user need is revoking a single lost device.

## 4. Hygiene tier

**Security headers + CSP**, set centrally at nginx (the single ingress): `nosniff`, `frame-ancestors 'none'`,
`Referrer-Policy`, `Permissions-Policy`, and HSTS (header now, meaningful once TLS lands in Production). The real
work is CSP: Angular injects component styles as runtime `<style>` tags, so a strict policy needs Angular's
`ngCspNonce` rather than `style-src 'unsafe-inline'`. Scripts get no `unsafe-inline` and no `unsafe-eval`. Fonts
are already data-URIs, so that part is free.

**Rate limiting** extends the existing per-IP Bucket4j filter to `signup-box`, invite creation, media upload,
checkout creation, booking, and the public invite-preview/receipt lookups, plus a **global per-IP ceiling** as a
backstop. Stays in-memory and single-node (documented); Redis is the known upgrade for when a second node exists.

**Purge jobs** for expired `refresh_tokens`, consumed/expired `email_tokens`, accepted/expired invites, and stale
PENDING TV pairing codes. **These are gotcha #1 in its purest form** — cross-box sweeps over `@TenantId` entities
(invites especially), so each must be native SQL or it will silently purge nothing and pass its own test. That
exact failure already happened twice on invites.

**The `@TenantId` native-query audit** is its own task, and **the sweep is blind to it**: the sweep tests
endpoints, while this is about repository methods that quietly filter to the caller's box when they were meant to
be tenant-agnostic. Hand audit of every repository method on a `@TenantId` entity, plus a convention note so the
next one is obvious.

**Dependency scanning** in CI — OWASP dependency-check for Maven plus `npm audit`, failing on high/critical, with
a reviewed suppression file (an unsuppressed scan goes noisy and then gets ignored, which is worse than none).

## 5. Testing and done criteria

Each piece carries the test that would catch its regression:

- **The sweep** — green, with a reviewed and justified allowlist.
- **Config** — no secret-bearing property has a usable default.
- **Log hygiene** — no secret, JWT or cookie value in captured logs.
- **Media** — unsigned denied, expired denied, foreign-box member denied, TV pushes carry fresh URLs, EXIF stripped.
- **Purge jobs** — seeded across **two boxes**. M10 taught that a single-box test passes happily while a cross-box
  sweep silently does nothing.
- **CSP must be proven in a real browser.** A strict policy passes every unit test and then breaks the live app;
  e2e asserts the headers are present *and* that the console shows zero CSP violations across the main journeys.

**Operational trap to design around from the start:** new rate limits will collide with the e2e suite, which is
serial and fires far more requests per minute from one IP than any human. This is exactly why
`BOXHUB_AUTH_RATE_LIMIT=200` already exists in the dev/e2e compose env. **Every new limit needs the same dev-env
override**, or the e2e specs start failing for a reason that looks like flake and is not.

**Done** = sweep green with a reviewed allowlist; every sweep finding fixed; no secret has a default; log-hygiene
green; CSP on with zero browser violations; dependency scan gating CI; backend, frontend and e2e all green.

## Out of scope

**→ Launch → Production phase** (needs a real host): TLS/HSTS enforcement, domain, firewall, SSH hardening,
Postgres backups **and a restore drill**, secrets delivery on the host, log retention, CI deploy on green.

**→ M14 (new milestone, added to the roadmap):** MFA/2FA — TOTP for BOX_ADMIN and superadmin, recovery codes,
optional for athletes. A real feature with enrollment UX, not a hardening pass.

**→ `docs/BACKLOG.md`:** Redis-backed distributed rate limiting (conditional on a second node existing); the full
audit log (every admin action, member-data access, hash-chained immutability, retention, search/filter UI,
export); a superadmin account model to replace the `BOXHUB_SUPERADMIN_EMAILS` env allowlist.
