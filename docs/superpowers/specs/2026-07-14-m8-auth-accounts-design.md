# M8 — Auth & accounts (complete)

**Date:** 2026-07-14
**Status:** Approved. Next step: `writing-plans`.
**Project:** 1 (The Platform). See `docs/superpowers/specs/2026-07-14-v1-roadmap-design.md`.
**Migration:** Flyway **V11**.

## Why this milestone exists

Three holes, all launch-blocking, all found by reading the code:

1. **No revocation.** Logout clears `localStorage` and nothing else — the refresh token stays valid server-side for
   up to 30 days. Logout is a lie today.
2. **Tokens are exfiltrable.** Both JWTs live in `localStorage`. Any XSS anywhere in the app — one bad dependency,
   one `innerHTML` — hands an attacker a 30-day refresh token usable from their own machine.
3. **No verification, no reset, no email.** Nobody can prove they own an address, nobody who forgets a password can
   ever get back in, and invites are "the admin copies a link by hand."

M8 also lays the **transactional-email foundation** every later milestone depends on.

## What exists today (the starting point)

- `users` = `email`, `password_hash` (NOT NULL), `name`. No verified flag, no identities, no timestamps.
- Access JWT (15m) + refresh token (32 random bytes, SHA-256 at rest, single-use rotation, 30d). Both in
  `localStorage`.
- `RefreshTokenService.consume()` **deletes** the row — so a replayed stolen token is indistinguishable from a typo.
- Rate limiting: per-IP, 10/min, on `login` / `register` / `refresh` / `tv/pair` (`AuthRateLimitFilter`, Caffeine).
- Two scopes: user JWT and box JWT. `TenantIdentifierResolver` reads `box_id` from the box JWT. Four milestones of
  tenancy work stand on this.
- Superadmin = email allowlist (`BOXHUB_SUPERADMIN_EMAILS`) → JWT claim. **Unchanged by M8.**

## Decisions (locked during brainstorm)

| Question | Decision | Why |
|---|---|---|
| Token storage | **httpOnly cookies, keep the JWTs** | Kills XSS token theft without demolishing the tenancy architecture. Opaque server sessions would mean two auth systems side by side forever (the TV token stays a JWT). |
| Revocation depth | **Families + reuse detection** | A replayed consumed token *is* evidence of theft. OAuth best practice. |
| Unverified accounts | **Cannot log in at all** | Impossible to get wrong. The alternative ("log in but gate sensitive actions") makes every future endpoint remember a flag — a permanent footgun. |
| Google + existing email | **Verified links; unverified is overwritten** | Closes the pre-registration takeover (attacker registers `victim@gmail.com`, never verifies, waits for the victim to use Google). |
| Identity storage | **`auth_identity` table** | Apple/Facebook later with no migration; `users` stays clean; passwordless users are a first-class case. |
| Mail transport | **Generic SMTP (`spring-boot-starter-mail`)** | Resend/Postmark/Brevo/SES all speak it. Swap by env var. No SDK, no lock-in. |
| Templates | **Thymeleaf** | An invite email is an athlete's first contact with BoxHub. It has to be designable. |
| Brute force | **Per-account exponential backoff, never a hard lock** | A hard lock hands attackers a free DoS: ten bad passwords and a box owner is locked out of their own gym before class. |
| Password policy | **Min 10 + HIBP breach check (fail-open)** | Blocks the attack that actually happens (credential stuffing). No composition theater — "must contain a symbol" produces `Password1!` and nothing else. |
| Account deletion | **Anonymize, keep history** | Once data can't identify a person it's outside GDPR — and the box keeps its class records. |
| 2FA / TOTP | **Out of M8** → `BACKLOG.md` | Real value for box-owner accounts, but a whole flow (enrol, QR, recovery codes). Not v1. |

## 1. Data model (V11)

**`users`** — additive, no destructive change to existing rows:
- `email_verified boolean NOT NULL DEFAULT false` — existing rows backfilled to `true`.
- `password_hash` → **nullable** (a Google-only user has none).
- `failed_attempts int NOT NULL DEFAULT 0`, `throttled_until timestamptz NULL` — durable backoff; survives a restart,
  needs no Redis.
- `created_at`, `updated_at`.

**`auth_identity`** (new):
`id`, `user_id` FK → `users` ON DELETE CASCADE, `provider` ('google'), `provider_subject`, `email`, `created_at`.
UNIQUE `(provider, provider_subject)`. Index on `user_id`.

**`refresh_tokens`** — extended:
`family_id uuid NOT NULL`, `consumed_at timestamptz NULL`, `revoked_at timestamptz NULL`,
`user_agent text NULL`, `ip text NULL`, `created_at`, `last_used_at`.
Rows are now **marked consumed, not deleted** — this is what makes reuse detection possible. Consequence: rows
accumulate, so a **scheduled purge job** for expired/consumed/revoked rows ships in this milestone (not deferred).

`user_agent` / `ip` / `last_used_at` are what the sessions screen renders.

**`email_token`** (new): `id`, `user_id`, `type` (`VERIFY` | `RESET` | `EMAIL_CHANGE`), `token_hash`,
`new_email text NULL` (email-change only), `expires_at`, `consumed_at`, `created_at`.
Single-use, SHA-256 at rest — same discipline as refresh tokens. Lookup by hash.

## 2. Tokens, cookies, CSRF

Three httpOnly cookies:

| Cookie | Holds | TTL | Path | SameSite |
|---|---|---|---|---|
| `bh_at` | access JWT (`scope:user`) | 15m | `/api` | Lax |
| `bh_bt` | box JWT (`scope:box`) | 15m | `/api` | Lax |
| `bh_rt` | refresh token (opaque) | 30d | `/api/auth` | Strict |

All `HttpOnly`; `Secure` is config-driven so local dev over http still works.

**The only new seam is a custom `BearerTokenResolver`** that reads the cookies and prefers `bh_bt` when present,
falling back to `bh_at`. Everything downstream — Spring's JWT validation, the `box_id` claim, `TenantContext`,
`TenantIdentifierResolver`, `RoleGuard`, and every cross-tenant test — is untouched.

`POST /api/auth/box-token` now **sets the `bh_bt` cookie** instead of returning the token in a body.

**CSRF is now real** (cookies auto-attach): Spring's `CookieCsrfTokenRepository` (`XSRF-TOKEN` cookie +
`X-XSRF-TOKEN` header), which Angular's `HttpClient` speaks natively via `withXsrfConfiguration`. `SameSite=Lax`
is the second layer.

**The TV device token stays a bearer JWT in the EventSource query param.** Out of scope here — M11 owns it.

## 3. Endpoints

### Public
| Endpoint | Behaviour |
|---|---|
| `POST /api/auth/register` | Creates an **unverified** user, mails a verify link. **Always 201** — if the email already exists, mail *the real owner* a "someone tried to sign up with your address" note instead. No enumeration. |
| `POST /api/auth/verify` | Consumes a VERIFY token → `email_verified = true`. Single-use. |
| `POST /api/auth/verify/resend` | **Always 202.** Rate-limited **per email address**. |
| `POST /api/auth/login` | Sets `bh_at` + `bh_rt`. **Order matters: credentials are checked first.** Only *after* a correct password does an unverified account get **403 `EMAIL_NOT_VERIFIED`** (a distinct code, so the UI can offer "resend"). Checking verification before the password would turn login into an enumeration oracle. 429 if throttled. Every other failure is a **generic 401** — including a password attempt on a Google-only account (naming Google would leak that the account exists). |
| `POST /api/auth/refresh` | Rotates within the family. **A replayed consumed token ⇒ revoke the whole family, 401.** |
| `POST /api/auth/logout` | Revokes the current family, clears cookies. |
| `POST /api/auth/logout-all` | Revokes every family for the user. |
| `POST /api/auth/box-token` | Sets `bh_bt`. Active-membership check unchanged. |
| `POST /api/auth/password/forgot` | **Always 202.** Rate-limited **per email address** (mail-bomb defense). |
| `POST /api/auth/password/reset` | Consumes a RESET token → sets the password, **marks the email verified** (clicking a link in the inbox proves ownership), and **revokes every session**. Also the way a Google-only user acquires a password. |
| `GET /api/auth/google/start` → `/callback` | Authorization-code, handled server-side. No token in a URL fragment. |

### Authenticated (`/api/me`)
| Endpoint | Behaviour |
|---|---|
| `PATCH /api/me/password` | Requires the current password. **Revokes all other sessions**, keeps the caller's. |
| `POST /api/me/email` | Requires the password. Mails a confirmation to the **new** address; the change applies only when that link is clicked. |
| `GET /api/me/sessions` | Active families: device/user-agent, IP, last seen. |
| `DELETE /api/me/sessions` | Log out everywhere. |
| `GET /api/me/export` | JSON dump of everything the system holds about the user. |
| `DELETE /api/me` | Anonymize (see §6). |

## 4. Google SSO

`spring-boot-starter-oauth2-client`, authorization-code flow, callback handled server-side.

**A Google login is rejected unless Google asserts `email_verified`.** Then, four branches:

1. **No local account** → create one: verified, passwordless, `auth_identity` row.
2. **Local account, already linked** → sign in.
3. **Local account, verified, not linked** → link the identity, sign in. The same human, proven twice.
4. **Local account, unverified** → **Google wins**: mark verified, **destroy the password hash**, link, sign in.

Branch 4 is the security-critical one. The attacker who pre-registered `victim@gmail.com` with a known password
loses that password the moment the real owner signs in with Google. To get a password back, they'd need the real
inbox (reset flow) — which they do not have.

## 5. Email

`spring-boot-starter-mail` + SMTP host/user/pass from env. **Mailpit** in `docker-compose` for dev and e2e — the
tests click a real link out of a real inbox.

Templates (Thymeleaf): **verify**, **reset**, **email-change confirm**, **registration-attempt notice**, and
**invite** — the M1 invite email finally gets *sent*. Invites have been "copy the link by hand" since M1; with a
mailer present that's one template and one call site, so it lands here rather than waiting.

Sends happen **after commit**, never inside the signup transaction. Every failed send is user-recoverable (resend /
forgot), so there is no outbox table.

Deliverability (SPF/DKIM/DMARC) is a DNS job and belongs to the production milestone. Until then, the provider's
sandbox domain.

## 6. Account deletion (anonymize)

`DELETE /api/me` scrubs every identifying field:

- `email` → `deleted-<uuid>@boxhub.invalid`, `name` → `"Deleted athlete"`, avatar file removed,
  `password_hash` → NULL.
- All `auth_identity` rows deleted. All refresh families revoked. All `email_token` rows deleted.

**Memberships, scores, bookings and lift entries survive** — the box's class history and leaderboards stay whole. The
row is simply no longer attached to a person.

Idempotent. The **existing last-admin guard is reused**: a box's only admin cannot delete themselves out of
existence.

`GET /api/me/export` is offered in the UI before the delete.

## 7. Brute force, rate limits, password policy

- **Per-account backoff** (`failed_attempts`, `throttled_until` on `users`): 5 failures → 1 min, 10 → 5 min, capped
  at 15 min, self-healing, reset on success. Rotating IPs stop helping. **Never a permanent lock.**
- **Per-IP limit** (existing `AuthRateLimitFilter`) extended to the new endpoints.
- **Per-email-address limit** on `password/forgot` and `verify/resend` — otherwise either endpoint is a mail-bomb
  cannon pointed at any address.
- **Password policy:** minimum **10** characters, no composition rules. Checked against **Have I Been Pwned**
  (k-anonymity: five characters of a SHA-1 prefix leave the server, never the password). **Fails open** if HIBP is
  unreachable — it can never break signup.

## 8. Frontend

Screens: **login** (+ Google button), **signup**, **check your email**, **verify landing**, **forgot password**,
**reset password**, **profile → security** (change password, change email, sessions + log out everywhere, export,
delete account).

`AuthService` stops holding tokens entirely. Session state bootstraps from `GET /api/me` on app start (the cookie
travels automatically); `localStorage` keeps no credentials. The interceptor sends `withCredentials`, attaches the
XSRF header, and on a 401 tries `refresh` once before redirecting to login.

Guards and roles are unchanged.

**These screens are built correct and plain, not beautiful.** M12 (frontend rework) restyles the whole app; polishing
here would be polishing twice. Correctness — loading states, inline errors, preserved inputs, WCAG AA, 44px targets
— still applies, per design law.

## 9. Testing

**Backend:** cookies set and cleared; CSRF rejected without the header; unverified login with the **correct** password
→ 403 `EMAIL_NOT_VERIFIED`, but unverified login with a **wrong** password → generic 401 (no enumeration oracle);
verify token single-use + expiry; reset revokes every session and verifies the email; rotation; **replayed consumed
token revokes the family**; backoff windows and self-heal; per-email limits on forgot/resend; HIBP fail-open; all
four Google branches including the rejected `email_verified=false` case; anonymize idempotency; last-admin guard;
export shape; purge job.

No new box-scoped endpoints, so no new cross-tenant tests — but the `bh_bt` cookie path gets one, because it is the
new way tenancy is carried.

**Frontend:** auth service + interceptor + guards.
**E2E:** signup → click the verify link out of Mailpit → login → forgot → reset → log out everywhere.

## 10. Migration and risk

- Existing users backfill to `email_verified = true`. `DevDataSeeder` sets it on seeded users.
- `password_hash` becomes nullable — the login path must handle a null hash (Google-only account) without an NPE and
  without leaking which accounts are passwordless.
- Every e2e login becomes cookie-based; Playwright handles cookies natively.
- The dev/e2e rate-limit override (`BOXHUB_AUTH_RATE_LIMIT=200`) stays — see gotcha #6 in `docs/HANDOFF.md`.
- `Secure` cookie flag is config-driven: off for local http, on in production.

## Out of scope (→ `docs/BACKLOG.md`)

- 2FA / TOTP for box owners and superadmins.
- Superadmin auth remains the env allowlist.
- TV stream token in the query param (M11).
- Box deletion / box-level data export (BoxHub is the processor, the box is the controller — a separate design).
- Per-session kill (only revoke-all ships; "I lost my phone" is the real case).
