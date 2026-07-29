# M12c — Production readiness (design)

**Date:** 2026-07-28 · **Status:** approved · **Base:** `main` @ `8f9e2b4` (M12b merged)
**Flyway:** none. No schema change in this milestone. Next migration is still V18.

## Why this milestone exists

M11 hardened the application. M12c hardens the **deploy** — the gap between "the code is correct"
and "the thing that runs on a VPS is correct". Two of the items are live bugs that no test can see
today because both live in files no test reads: `docker/nginx.conf` and `docker/docker-compose.yml`.

Both bugs share a shape worth naming, because it is why they survived M11's sweep: **a security
property enforced in Java can be silently undone by the infrastructure that starts the JVM.**
`SecretDefaultsTest` proves `application.yml` has no usable secret defaults; compose then supplies
committed defaults anyway, one layer up, where that test cannot look. The fixes below all push the
guarantee down to the layer that actually decides.

## Scope

Four backlog items, plus two traps found while reading their files and folded in on approval.
The fifth backlog bullet (TLS/HSTS, domain, firewall, SSH hardening, Postgres backups + restore
drill, secrets delivery, log retention, CI deploy on green) **stays in Launch → Production** and is
not built here.

| # | Item | Source |
|---|---|---|
| T1 | compose `env_file` + `.env.example`; `BOXHUB_COOKIE_SECURE`; deploy sentinel guard; CI | backlog + folded trap |
| T2 | nginx `/oauth2` locations; explicit OAuth redirect-uri; dev client id; two tests | backlog + folded trap |
| T3 | drop WebP uploads | backlog |
| T4 | mask recipient addresses in logs; extend `LogHygieneTest` to PII | backlog |
| T5 | gates, docs, backlog, merge | orchestrator |

T1 lands before T2: both edit `docker-compose.yml`, and T2's dev client id is one line added to the
`.env.example` T1 creates.

## Hardening invariants — must not regress

Binding on every task. An executor that cannot satisfy one **escalates instead of relaxing it.**

1. **`AuthzConformanceTest` is untouchable.** No task here needs to edit it. If enabling the OAuth2
   chain changes Spring's route table, that is a finding to report, not a file to edit.
2. **`SecretDefaultsTest` keeps passing unchanged.** T1 must not add a fallback to `application.yml`
   to make compose easier.
3. **`LogHygieneTest`'s existing credential assertions survive T4 verbatim.** T4 *adds* a PII
   assertion; it does not rewrite the secret ones. Every M11 `toString()` redaction stays.
4. **The CSP, the five security headers and the `secure_link` media validation are unchanged.**
   T2's new nginx locations set no `add_header` of their own, so they inherit the server-level
   snippet — `add_header` replaces rather than merges, which is exactly why they must not declare one.
5. **No secret gains a working default anywhere**, including in `.env.example`, which is a *dev*
   file and is labelled and guarded as such.
6. **The OAuth2 chain stays off unless a client id is configured.** `OAuth2ChainConditionTest` and
   `OAuth2SecurityConfig`'s `@ConditionalOnExpression` + `hasText` gating are not weakened; T2 turns
   the chain on in dev by *supplying a value*, which is the mechanism working as designed.
7. **`AuthRateLimitFilter`'s IP-identity policy is not weakened.** It resolves the client from
   nginx-authoritative `X-Real-IP` and falls back to `getRemoteAddr()` — never client-supplied
   `X-Forwarded-For`, which nginx appends to. Added *after* T2's first attempt violated it
   indirectly; see the rejected `server.forward-headers-strategy` note under T2. The lesson
   generalises: a global Spring filter can undo a local security control in a file the change never
   touches, and only the full suite sees it.

## T1 — Compose secrets fail closed

### The bug

`docker/docker-compose.yml` supplies shell-level `:-` fallbacks for every secret:

- `SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD:-boxhub}` (line 33)
- `BOXHUB_JWT_SECRET: ${BOXHUB_JWT_SECRET:-dev-only-secret-must-be-at-least-32-bytes!}` (line 35)
- `BOXHUB_STRIPE_ENC_KEYS: ${BOXHUB_STRIPE_ENC_KEYS:-1:AkuNet…}` (line 49)
- `BOXHUB_MEDIA_LINK_SECRET: ${BOXHUB_MEDIA_LINK_SECRET:-dev-only-media-link-secret-change-me}` (lines 50, 71)

Compose interpolation resolves *before* Spring ever sees a placeholder, so a deploy driven from this
file boots happily on committed dev key material — a git-history JWT signing key that mints
`BOX_ADMIN` tokens for any box, and a git-history media link secret that forges any signed media URL.
`SPRING_PROFILES_ACTIVE: ${SPRING_PROFILE:-dev}` (line 34) invites `SPRING_PROFILE=prod` on the same
file, which reads as an endorsement of exactly this path.

**Deleting the `:-` is not the fix.** Compose would then substitute the empty string and warn, and
Spring treats a present-but-blank property as configured — trading a known-bad secret for a
zero-length one.

### The fix

`docker/.env` becomes the single source of environment for the stack. Compose resolves both
`env_file:` paths and its own `.env` auto-load relative to the compose file's directory, so
`docker/.env` serves interpolation and container environment from one file with no path skew.

- **`docker/.env.example`** — committed. Carries clearly labelled `DEV ONLY` values for
  `POSTGRES_PASSWORD`, `BOXHUB_JWT_SECRET`, `BOXHUB_STRIPE_ENC_KEYS`, `BOXHUB_MEDIA_LINK_SECRET`,
  plus `SPRING_PROFILES_ACTIVE=dev`, `BOXHUB_COOKIE_SECURE=false` and the relaxed dev rate limits.
  `cp docker/.env.example docker/.env` yields a working dev stack in one command. A header block
  states which values must be regenerated for production and how.
- **`docker/.env` gitignored.** It is **not** in `.gitignore` today — this is a prerequisite edit,
  not a cleanup.
- **Every `:-` on a secret deleted**, and the secrets move out of `environment:` into `env_file`.
  An absent key is then genuinely absent in the container, Spring's bare `${BOXHUB_JWT_SECRET}`
  fails placeholder resolution, and the container refuses to boot. That is the intended behaviour:
  a deploy that forgot a secret must fail loudly, not run on a guessable one.
  Non-secret fixed values (`SPRING_DATASOURCE_URL`, `BOXHUB_MEDIA_DIR`, `BOXHUB_SMTP_HOST`) stay in
  `environment:`, which also keeps `SPRING_DATASOURCE_PASSWORD`'s mapping from `POSTGRES_PASSWORD`
  explicit — `environment:` overriding `env_file` is the documented precedence and is what we want.
  **The `frontend` service needs `env_file` too**, not just `backend`: it carries its own copy of
  `BOXHUB_MEDIA_LINK_SECRET` (line 71), envsubst'd into `nginx.conf` at container start, and it must
  be the same value the backend signs with or every media URL 403s.
  `SPRING_PROFILES_ACTIVE: ${SPRING_PROFILE:-dev}` (line 34) leaves `environment:` entirely and
  becomes a plain `SPRING_PROFILES_ACTIVE` key in `.env`, so there is one name for it rather than
  two and no default that reads as an invitation.
- **`BOXHUB_COOKIE_SECURE`** is added. It exists in `application.yml` (`boxhub.cookie.secure`,
  default `false`) and is set **nowhere** in compose, so a prod deploy from this file issues
  `bh_at` / `bh_bt` / `bh_rt` without the `Secure` attribute over TLS.
- **`.github/workflows/ci.yml`** gets `cp docker/.env.example docker/.env` before the
  `docker compose … up -d --build` at line 38. Without it CI goes red the moment this lands.
- **`README.md`** documents the `cp` as step one of running the stack.

### The deploy guard

`deploy/deploy.sh` already refuses to deploy when `/opt/boxhub/docker/.env` is missing (line 15). It
now also refuses when that file still contains a `DEV ONLY` sentinel value, **or** when it sets
`SPRING_PROFILES_ACTIVE=dev`.

The profile check is the sharper of the two. `DevDataSeeder` is `@Profile("dev")` — the only
profile-gated bean in the backend — so a production deploy left on the dev profile seeds
`admin@demo.io`, `coach@demo.io`, `athlete@demo.io` and `super@demo.io` with a password published in
the README, into production, with a superadmin among them.

The guard is what makes "copy the example onto the VPS" a caught mistake rather than a silent one.
It is the reason the example is allowed to carry working dev values at all.

### Verification

`docker compose config` renders no secret value when `docker/.env` is absent; the backend container
then fails to start with a placeholder-resolution error rather than booting. Full stack up from a
fresh `cp` and e2e green proves the dev path still works. `deploy.sh`'s guard is exercised against a
sentinel-bearing file — it must exit non-zero **before** any rsync or remote command runs.

## T2 — Google SSO reachable and correct behind nginx

### The bugs

**(a) No `/oauth2` location has ever existed.** `docker/nginx.conf` proxies `/api/tv/stream`,
`/api/`, `/actuator/health` and `/media/`; everything else falls through to `location /`'s
`try_files … /index.html`. So `<a href="/oauth2/authorization/google">` — rendered by
`login.page.ts:31` and `signup.page.ts:32` — is served the SPA, which routes it through the `**`
wildcard back to `auth/login`. The button does nothing. It is invisible in dev because
`OAuth2SecurityConfig` is `@ConditionalOnExpression`-gated on `BOXHUB_GOOGLE_CLIENT_ID`, which the
dev compose has never set: the endpoint the button targets does not exist in dev either way.

**(b) The OAuth `redirect_uri` is built from the request.** `OAuth2SecurityConfig` builds its
`ClientRegistration` from `CommonOAuth2Provider.GOOGLE`, whose default redirect-uri is the template
`{baseUrl}/login/oauth2/code/{registrationId}`. `{baseUrl}` resolves from the request as Spring sees
it — behind nginx, plain http on an internal host. That yields
`http://…/login/oauth2/code/google`, which cannot match an `https://` registration in the Google
console. Fixing (a) alone ships a button that still fails in production, which is why this is folded
in rather than deferred.

**`server.forward-headers-strategy` was the obvious fix and is REJECTED.** It installs Spring's
`ForwardedHeaderFilter` globally, which rewrites `getRemoteAddr()` from `X-Forwarded-For` for every
request in the app. nginx sets that header with `$proxy_add_x_forwarded_for`, which *appends* to
whatever the client sent, so its leftmost entry is attacker-controlled.
`AuthRateLimitFilter.clientIp()` falls back to `getRemoteAddr()` precisely because it is the one
value a client cannot forge — the filter's own comment says "never trust client-supplied
X-Forwarded-For for rate-limit identity". Enabling the strategy therefore re-opens the IP-spoofing
hole M1-T9 closed, and `RateLimitTest.spoofedForwardedForDoesNotCreateFreshBucket` catches it: 401
instead of 429, the limiter silently not firing. Found by the T2 executor's full-suite gate, not by
this spec.

Note what is *not* broken: `googleSuccessHandler`'s failure redirects to `/login?error=google`
(`OAuth2SecurityConfig.java:107`) and there is no `login` route — but Angular's `**` redirect to
`auth/login` preserves query params and `login.page.ts:77-79` reads them, so the error copy renders.
Accidental, working, and out of scope.

### The fix

1. `docker/nginx.conf` — `location /oauth2/` and `location /login/oauth2/`, each proxying to
   `http://backend:8080` with the same header set the `/api/` block uses (`Host`,
   `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP`). These match
   `OAuth2SecurityConfig.java:71`'s `securityMatcher("/oauth2/**", "/login/oauth2/**")`. Neither
   location declares an `add_header`, so both inherit the server-level security headers — see
   invariant 4.
2. `OAuth2SecurityConfig.clientRegistrationRepository` — an explicit
   `.redirectUri(base + "/login/oauth2/code/google")`, where `base` is `boxhub.app-url`
   (`BOXHUB_APP_URL`) with any trailing slash trimmed. This is not a workaround for the rejected
   strategy; it is the codebase's existing convention. `BOXHUB_APP_URL` is already the single source
   of truth for every absolute URL BoxHub emits — `Mailer.link`, the Stripe checkout return URLs —
   and OAuth2 was the one place still deriving one from the request. It needs no proxy-header trust
   of any kind, which is why it leaves `AuthRateLimitFilter` untouched.
3. `docker/.env.example` — a fake `BOXHUB_GOOGLE_CLIENT_ID`, so the chain is live in dev and the
   routing is testable at all.

### Proof

The nginx half and the redirect_uri half need different tests: e2e can see the routing, but the dev
stack's `BOXHUB_APP_URL` is `http://localhost`, so it cannot tell a configured URL from a
request-derived one.

- **e2e** — `GET /oauth2/authorization/google` returns `302` with a `Location` on
  `accounts.google.com`. Before the fix it is `200 text/html`, so the assertion discriminates by
  construction. No outbound request is made: the redirect is generated locally and never followed.
- **backend** — the OAuth2 chain enabled via `@TestPropertySource` with
  `boxhub.app-url=https://boxhub.example`, asserting the `redirect_uri` is that public https URL
  even though the request itself arrives as plain http on localhost, exactly as nginx forwards it.
  Negative control: dropping the `.redirectUri(...)` call yields
  `http://localhost/login/oauth2/code/google`.

Enabling the chain in dev makes the Google button render on the login and signup pages, since
`auth.providers()` will report `google: true`. Existing e2e does not assert its absence; the full
suite is the check, not the new spec alone.

### Deferred to Launch → Production

A backlog entry: **verify Google SSO end to end against real Google credentials on the real
domain.** The fake client id proves routing and `redirect_uri` *shape* — it never performs a token
exchange, and nothing here proves the consent screen, the callback or `GoogleLinkService`'s linking
policy work against the live provider.

## T3 — Drop WebP uploads

`MediaStorage.store` strips EXIF by decoding to a `BufferedImage` and re-encoding — metadata cannot
survive, because decode keeps pixels only. The JDK ships no WebP `ImageIO` codec, so
`MediaStorage.java:60-67` special-cases WebP: a RIFF magic-byte check, then the bytes are stored
**as uploaded**, EXIF and GPS intact. The `ponytail:` comment there names the ceiling and TwelveMonkeys
as the upgrade path.

The upgrade path does not survive contact: TwelveMonkeys' WebP support is reader-only, so
decode/re-encode would silently transcode a user's WebP to JPEG or PNG — changing the stored format
behind their back — and it adds a dependency to a scanned backend for a partial fix.

**WebP is dropped instead.** It appears nowhere in this repo but the allowed-types map and two
`accept` attributes: no test, no seed, no fixture, no documentation. Removing it closes the gap
completely rather than narrowing it, and costs users a delivery format that phone cameras and
screenshots do not produce.

- `image/webp` out of `MediaStorage.TYPES` (line 28); the `if ("webp")` branch and its `ponytail:`
  comment deleted along with the RIFF check, collapsing `store` to the single re-encode path.
- The 415 message at line 56 becomes `Only JPEG or PNG`.
- `image/webp` out of `types.page.ts:48` and `profile-sheet.component.ts:26`.
- Test: a WebP upload returns 415.

## T4 — Recipient addresses out of the logs

`Mailer.java:57` logs `mail sent: template={} to={}` at INFO on every send, and line 59 logs the
same on failure at ERROR. Every verification, reset, invite, receipt, lapse and lifecycle mail
therefore writes a member's address to the log. M11's `LogHygieneTest` guards secrets, JWTs and key
material only, so this is uncovered — PII in logs, not a credential leak, and the logs have no
retention policy yet (that is a Launch → Production item).

- `Mailer` logs a masked address (`a***@example.com`). Enough to correlate a delivery failure with a
  member, without writing the identifier itself. The masking helper is one function, used by both
  the INFO and the ERROR line.
- Any remaining DTO `toString()` that carries an address gets the redaction treatment M11 applied to
  credentials — same pattern, same reason (Spring MVC logs deserialized request and response bodies
  at DEBUG).
- **`LogHygieneTest` grows an email-address assertion**, and must drive a `Mailer` send to cover it —
  the four surfaces it drives today (login, refresh, Stripe connect, webhook) do not include one, so
  without that the guarantee would not reach the line that prompted the item.

Expect the new assertion to go red on first run against unmodified code. That is the failing-first
evidence, and it is required before the fix lands.

## Testing and gates

Per-task: the new tests named above, each with a negative control — the assertion must be seen to
fail against the unfixed code, not merely to pass against the fixed code.

Milestone gate (orchestrator, T5):

- `rm -rf backend/target` first, every time — iCloud conflict-copy `.class` files otherwise make
  classpath scanning take 10+ minutes and look like a hang.
- Backend suite: 405 + new, zero failures, zero skips. Never concurrently with Karma.
- `ng build --configuration production` — the only gate that type-checks Angular templates, and T3
  touches two templates.
- Full e2e on a **fresh** stack (`down -v`, then `cp docker/.env.example docker/.env`, then
  `up -d --build`) at `retries: 0`.
- CI checked after the push. A local green is not the gate, and T1 changes CI's own setup.

## Risks

- **T1 breaks CI and every local `docker compose up` if the `cp` step is missed.** Both call sites
  are named above; the e2e gate on a fresh stack is what catches a miss.
- **T2 changes the dev stack's rendered login page.** Full e2e, not the new spec alone.
- **T2 and `AuthzConformanceTest`.** `oauth2Login` contributes filter-chain endpoints rather than MVC
  handler mappings, so the sweep is expected to be unaffected — expected, not assumed. The suite is
  the check, and invariant 1 governs the outcome.
- **T4 edits records M11 hardened.** Existing assertions are read before anything near them changes,
  and none of them move.
