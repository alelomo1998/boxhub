# M12c Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four production-readiness gaps between "the code is correct" and "what runs on a VPS is correct" — two of which are live bugs today.

**Architecture:** No schema change, no new dependency, no new module. Three of the four tasks edit
infrastructure files that no test currently reads (`docker/docker-compose.yml`, `docker/nginx.conf`,
`deploy/deploy.sh`) and give each one a test that does. The fourth pushes an existing standing
guarantee (`LogHygieneTest`) from credentials to PII.

**Tech Stack:** Docker Compose, nginx, Spring Boot 3.5 / Java 21, Angular 19, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-28-m12c-production-readiness-design.md`
**Branch:** `m12c-production-readiness`, off `main` @ `12000a6`.

## Global Constraints

- `JAVA_HOME=/opt/homebrew/opt/openjdk@21` for every backend `mvn` invocation.
- `rm -rf backend/target` before every backend `mvn` run. Non-negotiable: iCloud conflict-copy
  `.class` files otherwise make classpath scanning take 10+ minutes and look like a hang.
- Never pipe a gate through `grep`/`tail` — the pipeline buffers and a working run looks dead.
  Never kill a run that looks stuck. macOS has no `timeout`.
- Never run the backend suite and Karma concurrently.
- Conventional commits, body ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Flyway: **none this milestone.** Next migration is still V18.
- **Every new test carries a negative control** — the assertion must be *seen to fail* against the
  unfixed code. "It passes" is not evidence; "it failed before the fix, for the right reason" is.

## Hardening invariants — binding on every task

An executor that cannot satisfy one of these **stops and escalates to the orchestrator.** Do not
relax, allowlist, or work around any of them.

1. **`backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java` is not edited by any task
   in this plan.** If a change here makes it fail, that is a finding to report, not a file to touch.
2. **`SecretDefaultsTest` keeps passing unchanged.** Task 1 must not add a fallback to
   `application.yml` to make compose convenient.
3. **`LogHygieneTest`'s existing credential assertions (lines 250-264) survive Task 4 verbatim.**
   Task 4 *adds* assertions. It does not rewrite, relax or delete an existing one, and every M11
   `toString()` redaction stays exactly as strict as it is now.
4. **The CSP, the five security headers and the `secure_link` media validation are unchanged.**
   Task 2's new nginx locations declare **no** `add_header` of their own — nginx's `add_header`
   *replaces* rather than merges, so a location that sets one loses the inherited server-level
   security headers.
5. **No secret gains a working default anywhere,** including in `.env.example` — that is a dev file,
   and it is labelled and guarded as such.
6. **The OAuth2 chain stays off unless a client id is configured.** `OAuth2ChainConditionTest` and
   `OAuth2SecurityConfig`'s `@ConditionalOnExpression` + `hasText` gating are not weakened. Task 2
   turns the chain on in dev by *supplying a value*, which is that mechanism working as designed.
7. **`AuthRateLimitFilter`'s IP-identity policy is not weakened.** It resolves the client from
   nginx-authoritative `X-Real-IP` and falls back to `getRemoteAddr()` — never client-supplied
   `X-Forwarded-For`, which nginx appends to. Added *after* Task 2's first design violated it
   indirectly via `server.forward-headers-strategy`; see Task 2 step 3. The lesson generalises: a
   global Spring filter can undo a local security control in a file the change never touches, and
   only the full suite sees it.

## File Structure

**Task 1 — compose secrets fail closed**
- Create: `docker/.env.example` — the single documented source of stack environment; committed.
- Modify: `docker/docker-compose.yml` — `env_file` on `backend`; every secret `:-` fallback removed.
- Modify: `.gitignore` — ignore `docker/.env`.
- Modify: `deploy/deploy.sh` — sentinel + dev-profile guard, moved ahead of `rsync`.
- Modify: `.github/workflows/ci.yml:38` — create `docker/.env` before `docker compose up`.
- Modify: `README.md` — the `cp` becomes step one of running the stack.

**Task 2 — Google SSO reachable and correct**
- Modify: `docker/nginx.conf` — `location /oauth2/` and `location /login/oauth2/`.
- Modify: `backend/src/main/java/com/boxhub/shared/OAuth2SecurityConfig.java` — explicit `redirectUri`.
- Modify: `docker/.env.example` — a fake `BOXHUB_GOOGLE_CLIENT_ID`.
- Create: `backend/src/test/java/com/boxhub/shared/OAuth2RedirectUriTest.java`.
- Modify: `e2e/tests/security.spec.ts` — the nginx routing assertion.

**Task 3 — drop WebP**
- Modify: `backend/src/main/java/com/boxhub/shared/MediaStorage.java:25-28,54-79`.
- Modify: `frontend/src/app/features/programming/types.page.ts:48`.
- Modify: `frontend/src/app/features/athlete/profile-sheet.component.ts:26`.
- Test: `backend/src/test/java/com/boxhub/shared/MediaApiTest.java`.

**Task 4 — recipient addresses out of the logs**
- Modify: `backend/src/main/java/com/boxhub/shared/Mailer.java:44-61`.
- Modify: `backend/src/main/java/com/boxhub/identity/AuthController.java:77`.
- Modify: `backend/src/main/java/com/boxhub/box/InviteAdminController.java:38-51`.
- Test: `backend/src/test/java/com/boxhub/security/LogHygieneTest.java`,
  `backend/src/test/java/com/boxhub/shared/MailerTest.java`.

**Task 5 — gates, docs, backlog, merge.** Orchestrator only. Not dispatched.

---

### Task 1: Compose secrets fail closed

**Files:**
- Create: `docker/.env.example`
- Modify: `docker/docker-compose.yml` (whole file)
- Modify: `.gitignore`
- Modify: `deploy/deploy.sh:11-16`
- Modify: `.github/workflows/ci.yml:38`
- Modify: `README.md:7-16, 18-20`

**Interfaces:**
- Consumes: nothing.
- Produces: `docker/.env.example` — Task 2 appends `BOXHUB_GOOGLE_CLIENT_ID` to it. The dev demo
  password (`boxhub-demo-2026`), the dev Postgres password (`boxhub`) and the relaxed dev rate
  limits are unchanged by this task, so the existing e2e suite must stay green.

**Context you need before editing.** `docker/docker-compose.yml` today supplies shell-level `:-`
fallbacks for every secret (lines 33, 35, 49, 50, 71). Compose interpolation resolves *before*
Spring ever sees a placeholder, so a deploy driven from this file boots on committed dev key
material — a git-history JWT signing key that mints `BOX_ADMIN` tokens, and a git-history media link
secret that forges any signed media URL. **Deleting the `:-` is not the fix**: compose would then
substitute the empty string, and a present-but-blank env var is not the same as an absent one.

Three facts that make `env_file` the right mechanism, all verified in the source — do not re-derive
them, but do not contradict them either:

- Compose resolves `env_file:` paths **and** its own automatic `.env` load relative to the compose
  file's own directory, so both mean `docker/.env`. One file, no path skew.
- With `env_file`, a key absent from the file is **genuinely absent** in the container, so Spring's
  bare `${BOXHUB_JWT_SECRET}` fails placeholder resolution and the container refuses to boot.
- A *blank* value is caught one layer down by the consumers, which already validate:
  `JwtConfig.java:22` ("must be at least 32 bytes"), `MediaSigner.java:32,34` ("must be set and
  non-blank" / "at least 32 characters"), `CryptoService.java:51-67` (version:base64key, 32 bytes).
  You are not adding validation; you are removing the thing that bypassed it.

- [ ] **Step 1: Ignore `docker/.env` before anything else can commit it**

`docker/.env` is **not** currently ignored. Append to `.gitignore`:

```
docker/.env
```

- [ ] **Step 2: Write `docker/.env.example`**

Create `docker/.env.example`:

```sh
# BoxHub stack environment. Copy to docker/.env before starting the stack:
#
#     cp docker/.env.example docker/.env
#
# docker/.env is gitignored. Compose reads it for BOTH interpolation and (for the backend)
# container environment, so this file is the single source of truth for the stack.
#
# ---------------------------------------------------------------------------------------------
# PRODUCTION: regenerate every value marked DEV-ONLY below. They are committed to a public-ish
# git history and are worthless as secrets. deploy/deploy.sh REFUSES to deploy a .env that still
# contains any of them, or that leaves SPRING_PROFILES_ACTIVE on dev.
#
#   BOXHUB_JWT_SECRET         openssl rand -base64 48
#   BOXHUB_MEDIA_LINK_SECRET  openssl rand -base64 48      (>= 32 chars, enforced at startup)
#   BOXHUB_STRIPE_ENC_KEYS    1:$(openssl rand -base64 32) (exactly 32 bytes, enforced at startup)
#   POSTGRES_PASSWORD         openssl rand -base64 24
#
# and set SPRING_PROFILES_ACTIVE= (empty) and BOXHUB_COOKIE_SECURE=true.
# ---------------------------------------------------------------------------------------------

# 'dev' activates DevDataSeeder, which seeds admin@demo.io / coach@demo.io / athlete@demo.io /
# super@demo.io on a password published in the README. It is the ONLY profile-gated bean in the
# backend, and it must never be active in production.
SPRING_PROFILES_ACTIVE=dev

# DEV-ONLY
POSTGRES_PASSWORD=boxhub
# DEV-ONLY
BOXHUB_JWT_SECRET=dev-only-secret-must-be-at-least-32-bytes!
# DEV-ONLY
BOXHUB_MEDIA_LINK_SECRET=dev-only-media-link-secret-change-me
# DEV-ONLY — version:base64key, newest first (see CryptoService). Rotating = prepend "2:<newkey>,"
# and keep the old entry so existing rows still decrypt.
BOXHUB_STRIPE_ENC_KEYS=1:AkuNetEmYeBStw8saSIH351fqJMEG2Y6o7ds3YFu/wc=

# false for the plain-HTTP dev stack. MUST be true in production or the auth cookies
# (bh_at / bh_bt / bh_rt) go out without the Secure attribute over TLS.
BOXHUB_COOKIE_SECURE=false

BOXHUB_APP_URL=http://localhost
BOXHUB_SUPERADMIN_EMAILS=super@demo.io

# Dev/e2e: the serial Playwright suite logs in many times from one IP inside the 1-minute
# window. Production wants the strict application.yml defaults instead — leave these unset there.
BOXHUB_AUTH_RATE_LIMIT=200
BOXHUB_WRITE_RATE_LIMIT=500
BOXHUB_LOOKUP_RATE_LIMIT=500
BOXHUB_GLOBAL_RATE_LIMIT=5000

HTTP_PORT=80
```

- [ ] **Step 3: Rewrite `docker/docker-compose.yml`**

Replace the whole file with:

```yaml
# Environment comes from docker/.env — see docker/.env.example, and copy it before first run.
# NOTE the deliberate absence of ":-" fallbacks on every secret below. Compose interpolation
# resolves before Spring sees a placeholder, so a fallback here silently defeats
# application.yml's fail-closed bare ${VAR} (and SecretDefaultsTest, which guards it) for
# exactly the path an operator would take. env_file omits an unset key entirely, so the
# backend refuses to boot rather than running on a committed dev key.
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: boxhub
      POSTGRES_USER: boxhub
      # Postgres itself refuses to initialise with a blank password, so this fails closed
      # without needing env_file — and db has no business seeing the app's secrets.
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U boxhub -d boxhub"]
      interval: 5s
      timeout: 3s
      retries: 10

  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "127.0.0.1:8025:8025"   # web UI — open http://localhost:8025 to read dev mail
    environment:
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1

  backend:
    build:
      context: ..
      dockerfile: docker/backend.Dockerfile
    # The only service that needs the app secrets, so the only one that gets the whole file.
    env_file:
      - .env
    environment:
      # Fixed, non-secret, container-topology values. `environment` overrides `env_file`, which
      # is what we want for the datasource mapping.
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/boxhub
      SPRING_DATASOURCE_USERNAME: boxhub
      SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD}
      BOXHUB_MEDIA_DIR: /data/media
      BOXHUB_SMTP_HOST: mailpit
      BOXHUB_SMTP_PORT: "1025"
    volumes:
      - media:/data/media
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8080/actuator/health | grep -q UP"]
      interval: 5s
      timeout: 3s
      retries: 20

  frontend:
    build:
      context: ..
      dockerfile: docker/frontend.Dockerfile
    ports:
      - "${HTTP_PORT:-80}:80"
    environment:
      # Same secret as the backend — nginx validates the signature the API mints. envsubst'd
      # into nginx.conf at container start (see frontend.Dockerfile / nginx.conf.template).
      # No env_file here: nginx needs exactly this one value, and the frontend only ever starts
      # behind a backend that already booted, i.e. one that had a real secret.
      BOXHUB_MEDIA_LINK_SECRET: ${BOXHUB_MEDIA_LINK_SECRET}
    volumes:
      - media:/media:ro
    depends_on:
      backend:
        condition: service_healthy

volumes:
  pgdata:
  media:
```

Note what moved and why: `SPRING_PROFILES_ACTIVE: ${SPRING_PROFILE:-dev}` is gone from
`environment:` entirely and is now a plain `SPRING_PROFILES_ACTIVE` key in `.env`. One name
instead of two, and no default that reads as an invitation to set `SPRING_PROFILE=prod` on a file
full of dev secrets.

- [ ] **Step 4: Prove it fails closed — the negative control**

The discriminating check for the whole task, in three parts. What has to be proven is that the OLD
file leaked committed dev secrets and the NEW one cannot.

**(a) The old file, with `docker/.env` absent** — the bug, demonstrated. Rendering it in place
matters: `context: ..` only resolves from `docker/`.

```bash
git show HEAD:docker/docker-compose.yml > docker/docker-compose.old.yml
docker compose -f docker/docker-compose.old.yml config > /tmp/m12c-old-render.txt 2>&1; echo "EXIT:$?"
grep -c 'dev-only-secret-must-be-at-least-32-bytes!' /tmp/m12c-old-render.txt
grep -c 'AkuNetEmYeBStw8saSIH351fqJMEG2Y6o7ds3YFu/wc=' /tmp/m12c-old-render.txt
grep -c 'dev-only-media-link-secret-change-me' /tmp/m12c-old-render.txt
rm docker/docker-compose.old.yml
```

Expected: `EXIT:0` and a non-zero count for all three — the old file renders every committed dev
secret with no `.env` anywhere on disk. Write to a file and grep the file; never pipe
`docker compose config` through `grep` directly. Confirm the scratch file is deleted — it must not
reach the commit.

**(b) The new file, with `docker/.env` absent.**

```bash
docker compose -f docker/docker-compose.yml config; echo "EXIT:$?"
```

Expected on Compose v5.3.0: `EXIT:1`, no config rendered at all, with
`env file …/docker/.env not found`. Compose treats a missing `env_file` **path** as a hard error
rather than a per-variable warning, so the failure is total refusal rather than selective blanking.
That is the fail-closed behaviour, and it is stronger than a render with empty values: there is no
path where the stack starts on a partial environment. **Do not add `required: false` to `env_file`
to soften this** — it would defeat the entire task.

**(c) The new file, with `docker/.env` present.**

```bash
cp docker/.env.example docker/.env
docker compose -f docker/docker-compose.yml config; echo "EXIT:$?"
```

Expected: `EXIT:0`, every value present. Record all three outputs in your report.

- [ ] **Step 5: Teach CI to create the file**

`.github/workflows/ci.yml` line 38 is `- run: docker compose -f docker/docker-compose.yml up -d --build`
inside the `e2e` job. Insert a step immediately **before** it:

```yaml
      - run: cp docker/.env.example docker/.env
```

Without this the e2e job cannot start the stack and CI goes red the moment this lands.

- [ ] **Step 6: Add the deploy guard**

`deploy/deploy.sh` currently checks for the remote `.env` **after** rsync (line 15). Move the check
ahead of rsync and add the sentinel guard. Replace lines 1-15 with:

```bash
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
```

Leave lines 16-18 (`docker compose up -d --build`, the health poll, `echo "Deployed OK."`) as they
are — they follow the replaced block unchanged.

- [ ] **Step 7: Prove the guard fires**

The guard runs over ssh, so exercise its logic locally against the real file:

```bash
DEV_SENTINELS='dev-only-secret-must-be-at-least-32-bytes!|dev-only-media-link-secret-change-me|AkuNetEmYeBStw8saSIH351fqJMEG2Y6o7ds3YFu/wc=|^POSTGRES_PASSWORD=boxhub$|^SPRING_PROFILES_ACTIVE=dev$'
grep -Eq "$DEV_SENTINELS" docker/.env.example && echo "GUARD FIRES (correct)" || echo "GUARD MISSED (bug)"
```

Expected: `GUARD FIRES (correct)`. Then check each of the five alternatives individually and report
which matched — a pattern that never matches anything is a guard that does nothing:

```bash
for p in 'dev-only-secret-must-be-at-least-32-bytes!' 'dev-only-media-link-secret-change-me' 'AkuNetEmYeBStw8saSIH351fqJMEG2Y6o7ds3YFu/wc=' '^POSTGRES_PASSWORD=boxhub$' '^SPRING_PROFILES_ACTIVE=dev$'; do
  printf '%s -> ' "$p"; grep -Eq "$p" docker/.env.example && echo MATCH || echo "NO MATCH"
done
```

Expected: all five `MATCH`. **If any says `NO MATCH`, stop and report it** — the pattern and the
file have drifted, and shipping that is a guard with a hole in it.

- [ ] **Step 8: Update the README**

In `README.md`, replace line 12:

```markdown
- Full stack: `cp docker/.env.example docker/.env` (once), then `docker compose -f docker/docker-compose.yml up --build` → http://localhost
```

and replace line 20:

```markdown
`./deploy/deploy.sh user@vps` — see script header for VPS prereqs. The VPS needs
`/opt/boxhub/docker/.env` built from `docker/.env.example` with every DEV-ONLY value regenerated;
the script refuses to deploy otherwise.
```

- [ ] **Step 9: Bring the stack up from a clean copy and run e2e**

```bash
docker compose -f docker/docker-compose.yml down -v
cp docker/.env.example docker/.env
docker compose -f docker/docker-compose.yml up -d --build
```

Wait for health, then:

```bash
cd e2e && npx playwright test
```

Expected: 26 passed. The demo password, the dev Postgres password and the relaxed rate limits are
unchanged by this task, so any e2e failure here means the environment plumbing dropped a value —
report exactly which spec and which value.

Then confirm the operator-facing failure is intelligible. A fail-closed deploy is only useful if
whoever tripped it can tell why:

```bash
mv docker/.env docker/.env.bak
docker compose -f docker/docker-compose.yml up -d; echo "EXIT:$?"
mv docker/.env.bak docker/.env
```

Report the message verbatim.

- [ ] **Step 10: Commit**

```bash
git add docker/.env.example docker/docker-compose.yml .gitignore deploy/deploy.sh .github/workflows/ci.yml README.md
git commit -m "fix(m12c): make compose secrets fail closed via env_file

Compose interpolation resolves before Spring sees a placeholder, so the
:- fallbacks meant a deploy driven from docker-compose.yml silently ran
on committed dev key material — defeating application.yml's fail-closed
bare \${VAR} and SecretDefaultsTest for exactly the path an operator
would take. env_file omits an unset key entirely, so the backend now
refuses to boot instead.

Also adds BOXHUB_COOKIE_SECURE, which was set nowhere in compose: a prod
deploy from this file issued bh_at/bh_bt/bh_rt without Secure over TLS.

deploy.sh refuses a .env still carrying a DEV-ONLY value or
SPRING_PROFILES_ACTIVE=dev — the latter activates DevDataSeeder, which
would seed demo accounts and a superadmin into production on a
README-published password.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Google SSO reachable and correct behind nginx

**Files:**
- Modify: `docker/nginx.conf` — insert after the `location /actuator/health` block (line 42)
- Modify: `backend/src/main/resources/application.yml`
- Modify: `docker/.env.example`
- Create: `backend/src/test/java/com/boxhub/shared/OAuth2RedirectUriTest.java`
- Modify: `e2e/tests/security.spec.ts`

**Interfaces:**
- Consumes: `docker/.env.example` from Task 1.
- Produces: nothing later tasks depend on.

**Context you need before editing.** Two independent bugs, both invisible in dev today:

1. `docker/nginx.conf` proxies `/api/tv/stream`, `/api/`, `/actuator/health` and `/media/`.
   Everything else falls through to `location /`'s `try_files $uri $uri/ /index.html`. So
   `<a href="/oauth2/authorization/google">` — rendered at `login.page.ts:31` and
   `signup.page.ts:32` — is served the SPA, which routes it through the `**` wildcard back to
   `auth/login`. The button does nothing, and has never done anything.
2. The OAuth `redirect_uri` is built from the request. `CommonOAuth2Provider.GOOGLE`'s default
   redirect-uri is the template `{baseUrl}/login/oauth2/code/{registrationId}`, and `{baseUrl}`
   resolves from the request as Spring sees it — plain http on an internal host behind nginx. That
   will not match an `https://` registration in the Google console. **Fixing (1) alone ships a
   button that still fails in production.**

`OAuth2SecurityConfig.java:71` declares `securityMatcher("/oauth2/**", "/login/oauth2/**")`; the
nginx locations must cover both. The whole config is `@ConditionalOnExpression`-gated on
`BOXHUB_GOOGLE_CLIENT_ID` having text, which is why nothing in dev has ever exercised this.

**Do not "fix" `googleSuccessHandler`'s `/login?error=google` redirect** (`OAuth2SecurityConfig.java:107`).
There is no `login` route, but Angular's `**` redirect to `auth/login` preserves query params and
`login.page.ts:77-79` reads them, so the error copy renders. It is out of scope.

- [ ] **Step 1: Write the failing backend test**

Create `backend/src/test/java/com/boxhub/shared/OAuth2RedirectUriTest.java`:

```java
package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * BoxHub runs behind nginx, which terminates TLS. Spring's default OAuth2 redirect_uri template
 * ({@code {baseUrl}/login/oauth2/code/{registrationId}}) is built from the request as the
 * servlet container saw it — plain http, on an internal host — so it never matches the https
 * registration in the Google console.
 * <p>
 * The fix is <b>not</b> {@code server.forward-headers-strategy}: that installs
 * {@code ForwardedHeaderFilter} globally, which rewrites {@code getRemoteAddr()} from the
 * client-appendable {@code X-Forwarded-For} header and re-opens the rate-limit IP spoofing that
 * M1-T9 closed (see {@code AuthRateLimitFilter.clientIp()} and
 * {@code RateLimitTest.spoofedForwardedForDoesNotCreateFreshBucket}, which pins it). Instead
 * {@code OAuth2SecurityConfig.clientRegistrationRepository} sets an explicit {@code redirectUri}
 * built from {@code boxhub.app-url} — the same source every other absolute URL BoxHub emits
 * already uses ({@code Mailer.link}, the Stripe checkout return URLs). No proxy header is
 * trusted at all.
 */
@TestPropertySource(properties = {
        "BOXHUB_GOOGLE_CLIENT_ID=m12c-test-client-id.apps.googleusercontent.com",
        "boxhub.app-url=https://boxhub.example"
})
class OAuth2RedirectUriTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void redirectUriComesFromTheConfiguredAppUrlNotTheProxiedRequest() throws Exception {
        // The request arrives exactly as nginx forwards it: plain http, internal host. The
        // redirect_uri must still be the public https URL registered in the Google console.
        String location = mvc.perform(get("/oauth2/authorization/google"))
                .andExpect(status().is3xxRedirection())
                .andReturn().getResponse().getHeader("Location");

        assertThat(location).as("authorization redirect").startsWith("https://accounts.google.com/");

        String redirectUri = UriComponentsBuilder.fromUriString(location)
                .build().getQueryParams().getFirst("redirect_uri");
        assertThat(redirectUri).as("redirect_uri query parameter").isNotNull();
        assertThat(URLDecoder.decode(redirectUri, StandardCharsets.UTF_8))
                .isEqualTo("https://boxhub.example/login/oauth2/code/google");
    }
}
```

- [ ] **Step 2: Run it and watch it fail for the right reason**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=OAuth2RedirectUriTest
```

Expected: FAIL, with the decoded `redirect_uri` coming back as
`http://localhost/login/oauth2/code/google` — the template resolving against the request.

- [ ] **Step 3: Set the redirect URI from the configured app URL**

In `backend/src/main/java/com/boxhub/shared/OAuth2SecurityConfig.java`, the
`clientRegistrationRepository` bean becomes:

```java
    @Bean
    ClientRegistrationRepository clientRegistrationRepository(
            @Value("${BOXHUB_GOOGLE_CLIENT_ID}") String clientId,
            @Value("${BOXHUB_GOOGLE_CLIENT_SECRET:}") String clientSecret,
            @Value("${boxhub.app-url}") String appUrl) {
        // Absolute, from the app's own configured public URL — NOT Spring's default
        // "{baseUrl}/login/oauth2/code/{registrationId}" template. Behind nginx the request
        // Spring sees is plain http on an internal host, so the template yields an http://
        // redirect_uri that cannot match an https:// registration in the Google console, and
        // Google rejects the callback. Every other absolute URL BoxHub emits already comes from
        // BOXHUB_APP_URL (Mailer.link, the Stripe checkout return URLs); this makes OAuth2 the
        // same. Deliberately NOT solved with server.forward-headers-strategy: that installs
        // ForwardedHeaderFilter globally, which rewrites getRemoteAddr() from the
        // client-appendable X-Forwarded-For and re-opens the rate-limit IP spoofing that M1-T9
        // closed. Pinned by RateLimitTest.spoofedForwardedForDoesNotCreateFreshBucket.
        String base = appUrl.endsWith("/") ? appUrl.substring(0, appUrl.length() - 1) : appUrl;
        ClientRegistration google = CommonOAuth2Provider.GOOGLE.getBuilder("google")
                .clientId(clientId)
                .clientSecret(clientSecret)
                .redirectUri(base + "/login/oauth2/code/google")
                .build();
        return new InMemoryClientRegistrationRepository(google);
    }
```

**Do not add `server.forward-headers-strategy` to `application.yml`.** It was this plan's first
design and is rejected — see the test javadoc above, invariant 7, and the spec's T2 section.

- [ ] **Step 4: Run it and watch it pass**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=OAuth2RedirectUriTest
```

Expected: PASS. Then re-run the **full** backend suite before moving on — this changes how the app
authenticates against an external identity provider, so it is not a local change:

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```

Expected: all green, zero failures, zero skips. **Report the exact count.** If
`AuthzConformanceTest` fails, stop and escalate — invariant 1.

- [ ] **Step 5: Add the nginx locations**

In `docker/nginx.conf`, insert immediately after the `location /actuator/health { … }` block that
ends at line 42:

```nginx
    # Google SSO. Spring's OAuth2 chain matches /oauth2/** (the authorization redirect) and
    # /login/oauth2/** (Google's callback) — see OAuth2SecurityConfig.securityMatcher. Without
    # these two blocks both fall through to the SPA catch-all below and the login page's Google
    # button silently does nothing, which is how it shipped from M8 to M12c.
    #
    # No add_header here on purpose: nginx's add_header REPLACES rather than merges, so a
    # location that sets one loses every server-level security header. These inherit.
    #
    # The redirect_uri comes from BOXHUB_APP_URL (OAuth2SecurityConfig), not from any of these
    # headers — deliberately: trusting X-Forwarded-For to rebuild the request would also feed
    # AuthRateLimitFilter's IP resolution, reopening the spoofing M1-T9 closed. They're set here
    # for parity with the /api/ block above, not because anything here reads them for URL
    # construction.
    location /oauth2/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /login/oauth2/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
```

- [ ] **Step 6: Turn the chain on in dev**

Append to `docker/.env.example`:

```sh
# Google SSO. A REAL client id here makes the login/signup Google button live; this fake one
# exists so the nginx /oauth2 routing is exercised by e2e at all (the whole OAuth2 chain is
# @ConditionalOnExpression-gated on this var having text, so with it unset there is no endpoint
# to route to and the security.spec assertion could not discriminate). It reaches Google's
# consent screen and stops there — no token exchange is ever attempted.
# Production: set the real client id AND BOXHUB_GOOGLE_CLIENT_SECRET.
BOXHUB_GOOGLE_CLIENT_ID=m12c-dev-placeholder.apps.googleusercontent.com
```

- [ ] **Step 7: Write the failing e2e assertion**

Append to `e2e/tests/security.spec.ts`:

```ts
// M12c: no /oauth2 location existed in docker/nginx.conf from M8 until now, so
// /oauth2/authorization/google — the href on the login and signup pages' Google button — was
// served index.html by the SPA catch-all and the button did nothing. Invisible in dev because
// the OAuth2 chain is conditional on BOXHUB_GOOGLE_CLIENT_ID, which the dev stack never set.
test('the Google SSO authorization endpoint is proxied to Spring, not swallowed by the SPA', async ({ request }) => {
  const res = await request.get('/oauth2/authorization/google', { maxRedirects: 0 });

  // Before the nginx location existed this was 200 text/html. That is what makes this discriminate.
  expect(res.status()).toBe(302);

  const location = new URL(res.headers()['location']);
  expect(location.host).toBe('accounts.google.com');
  expect(location.searchParams.get('redirect_uri')).toMatch(/\/login\/oauth2\/code\/google$/);
});
```

- [ ] **Step 8: Run it against a stack WITHOUT the nginx fix — the negative control**

Stash only the nginx change, rebuild, and watch the assertion fail:

```bash
git stash push docker/nginx.conf
docker compose -f docker/docker-compose.yml up -d --build frontend
cd e2e && npx playwright test security.spec.ts
```

Expected: FAIL on `expect(res.status()).toBe(302)` with `Received: 200`. Record the exact message.
Then restore:

```bash
git stash pop
```

- [ ] **Step 9: Run the full stack and the full e2e suite**

```bash
docker compose -f docker/docker-compose.yml down -v
cp docker/.env.example docker/.env
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && npx playwright test
```

Expected: 27 passed (26 + the new one). The Google button now renders on the login and signup
pages, because `GET /api/auth/providers` reports `google: true`. **If any existing spec fails
because of that, report which one and how** — do not hide the button to make a spec pass.

- [ ] **Step 10: Commit**

```bash
git add docker/nginx.conf docker/.env.example \
        backend/src/main/java/com/boxhub/shared/OAuth2SecurityConfig.java \
        backend/src/test/java/com/boxhub/shared/OAuth2RedirectUriTest.java e2e/tests/security.spec.ts
git commit -m "fix(m12c): make Google SSO reachable and correct behind nginx

Two bugs, both invisible in dev. docker/nginx.conf never had an /oauth2
location, so the login page's Google button was served index.html by the
SPA catch-all and did nothing — dead since M8, because the OAuth2 chain
is conditional on BOXHUB_GOOGLE_CLIENT_ID and the dev stack never set it.

And the redirect_uri came from CommonOAuth2Provider.GOOGLE's default
{baseUrl} template, resolved against the request as the servlet container
saw it — plain http on an internal host — which cannot match an https
registration in the Google console. It now comes from BOXHUB_APP_URL,
the same source Mailer.link and the Stripe return URLs already use.

server.forward-headers-strategy was the first design and was rejected:
it installs ForwardedHeaderFilter globally, which rewrites
getRemoteAddr() from the client-appendable X-Forwarded-For and re-opens
the rate-limit IP spoofing M1-T9 closed. RateLimitTest caught it —
spoofedForwardedForDoesNotCreateFreshBucket went 429 -> 401, the limiter
silently not firing.

A fake client id in .env.example makes the chain live in dev so e2e can
assert the routing at all; the backend test covers the redirect_uri,
which a dev stack whose APP_URL is http://localhost cannot.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Drop WebP uploads

**Files:**
- Modify: `backend/src/main/java/com/boxhub/shared/MediaStorage.java:25-28, 54-79`
- Modify: `frontend/src/app/features/programming/types.page.ts:48`
- Modify: `frontend/src/app/features/athlete/profile-sheet.component.ts:26`
- Test: `backend/src/test/java/com/boxhub/shared/MediaApiTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

**Context.** `MediaStorage.store` strips EXIF by decoding to a `BufferedImage` and re-encoding —
metadata cannot survive, because decode keeps pixels only. The JDK ships no WebP `ImageIO` codec,
so `MediaStorage.java:60-67` special-cases WebP: a RIFF magic-byte check, then the bytes are
stored **as uploaded**, EXIF and GPS intact.

The `ponytail:` comment there names TwelveMonkeys as the upgrade path, but that does not survive
contact: TwelveMonkeys' WebP support is reader-only, so decode/re-encode would silently transcode
a user's WebP to JPEG or PNG. WebP appears nowhere else in the repo but the allowed-types map and
two `accept` attributes — no test, no seed, no fixture, no doc. Dropping it closes the gap
completely instead of narrowing it.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/boxhub/shared/MediaApiTest.java`, next to `rejectsWrongType()`
(line 136):

```java
    /**
     * WebP was accepted until M12c and stored byte-for-byte: the JDK has no WebP ImageIO codec,
     * so the decode/re-encode that strips EXIF everywhere else could not run on it, and GPS
     * metadata survived upload. Rejecting the format closes that completely — TwelveMonkeys,
     * the upgrade path the old comment named, is reader-only and would have silently transcoded
     * the user's file to JPEG.
     */
    @Test
    void rejectsWebpBecauseItsExifCannotBeStripped() throws Exception {
        // A minimal but structurally real RIFF/WEBP header — the shape the old code let through
        // on the strength of its magic bytes alone.
        byte[] webp = new byte[]{'R', 'I', 'F', 'F', 0x1a, 0, 0, 0, 'W', 'E', 'B', 'P',
                'V', 'P', '8', 'L', 0x0e, 0, 0, 0};

        mvc.perform(multipart("/api/box/media")
                        .file(new MockMultipartFile("file", "a.webp", "image/webp", webp))
                        .header("Authorization", "Bearer " + athlete))
                .andExpect(status().isUnsupportedMediaType());
    }
```

- [ ] **Step 2: Run it and watch it fail**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=MediaApiTest
```

Expected: FAIL — `Status expected:<415> but was:<201>`. That 201 *is* the bug: a WebP with EXIF
would have been stored intact.

- [ ] **Step 3: Remove WebP from the backend**

In `MediaStorage.java`, change the types map (lines 25-28) to:

```java
    // JPEG and PNG only. WebP was dropped in M12c: the JDK ships no WebP ImageIO codec, so the
    // decode/re-encode below — which is the entire EXIF-strip mechanism — cannot run on it, and
    // an uploaded WebP kept its GPS metadata. Adding a format here without a working ImageIO
    // round-trip re-opens that hole.
    private static final Map<String, String> TYPES = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png");
```

Change the 415 message on line 56 to:

```java
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only JPEG or PNG");
```

Then delete the whole `if ("webp".equals(ext)) { … } else {` / closing-brace structure (lines
60-79), collapsing `store` to the single re-encode path. The body of `try` becomes:

```java
            byte[] bytes = file.getBytes();
            BufferedImage img = ImageIO.read(new java.io.ByteArrayInputStream(bytes));
            if (img == null)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid image");
            // Re-encoding through a fresh BufferedImage strips all metadata (EXIF/GPS
            // included) — decode keeps pixels only, nothing carries the source's markers
            // forward into the write.
            ByteArrayOutputStream reencoded = new ByteArrayOutputStream();
            if (!ImageIO.write(img, ext, reencoded))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid image");
            byte[] toStore = reencoded.toByteArray();
            Path dir = root.resolve(boxId.toString());
            Files.createDirectories(dir);
            String name = UUID.randomUUID() + "." + ext;
            Files.write(dir.resolve(name), toStore);
            return "/media/" + boxId + "/" + name;
```

- [ ] **Step 4: Run the media tests and watch them pass**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=MediaApiTest
```

Expected: PASS, 6 tests (5 existing + the new one). `uploadedJpegLosesExifGpsData` must still pass
— it is the proof the re-encode path is intact after the collapse.

- [ ] **Step 5: Remove WebP from the two file inputs**

`frontend/src/app/features/programming/types.page.ts` line 48 — change
`accept="image/jpeg,image/png,image/webp"` to `accept="image/jpeg,image/png"`. The full line:

```html
                    <input type="file" accept="image/jpeg,image/png" (change)="onImage(g, $event)"
```

`frontend/src/app/features/athlete/profile-sheet.component.ts` line 26 — the same change:

```html
                <input type="file" accept="image/jpeg,image/png" (change)="onFile($event)"
```

- [ ] **Step 6: Verify the frontend still builds**

```bash
cd frontend && npm run build
```

Expected: success. Use the real production build, not `tsc --noEmit` — `tsc` does not type-check
Angular templates, and both edits are template edits.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/boxhub/shared/MediaStorage.java \
        backend/src/test/java/com/boxhub/shared/MediaApiTest.java \
        frontend/src/app/features/programming/types.page.ts \
        frontend/src/app/features/athlete/profile-sheet.component.ts
git commit -m "fix(m12c): drop WebP uploads, whose EXIF could not be stripped

The JDK ships no WebP ImageIO codec, so the decode/re-encode that strips
EXIF for JPEG and PNG could not run on WebP — it was stored byte for
byte, GPS metadata intact. TwelveMonkeys, the upgrade path the old
ponytail comment named, is reader-only and would have silently
transcoded the user's file to JPEG.

WebP appeared nowhere in the repo but the allowed-types map and two
accept attributes, so removing it closes the gap completely rather than
narrowing it.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Recipient addresses out of the logs

**Files:**
- Modify: `backend/src/main/java/com/boxhub/shared/Mailer.java:44-61`
- Modify: `backend/src/main/java/com/boxhub/identity/AuthController.java:77`
- Modify: `backend/src/main/java/com/boxhub/box/InviteAdminController.java:38-51`
- Test: `backend/src/test/java/com/boxhub/security/LogHygieneTest.java`,
  `backend/src/test/java/com/boxhub/shared/MailerTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: `Mailer.mask(String)` — package-private static, `String -> String`. Used by
  `Mailer`'s own two log lines and asserted directly by `MailerTest`.

**Context.** `Mailer.java:57` logs `mail sent: template={} to={}` at INFO on every send, and line 59
logs the same at ERROR on failure. Every verification, reset, invite, receipt, lapse and lifecycle
mail therefore writes a member's address to the log. M11's `LogHygieneTest` guards secrets, JWTs
and key material only, so none of this is covered.

**Read `LogHygieneTest` in full before editing it.** It attaches a `ListAppender` to the ROOT
logger, forces TRACE, drives seven credential-handling surfaces, and asserts absence *after*
proving the capture window saw real work. Invariant 3 applies: the existing assertions at lines
250-264 are not touched.

Two things that will make the new assertion go red, both by design:

- `AuthController.LoginRequest.toString()` (line 77) prints `email=` in full. Spring MVC's
  `RequestResponseBodyMethodProcessor` logs the deserialized argument, so the login the test drives
  puts the address straight into the log.
- `InviteAdminController.CreateInviteRequest` (line 38) has **no** `toString()` override at all,
  and `CreatedInviteResponse.toString()` (line 48) prints `email=` in full — Spring logs response
  bodies too.

- [ ] **Step 1: Write the failing assertions**

In `backend/src/test/java/com/boxhub/security/LogHygieneTest.java`:

Add the field, next to the other `@Autowired`s (after line 100):

```java
    @Autowired Mailer mailer;
```

and the import for `Mailer`:

```java
import com.boxhub.shared.Mailer;
```

Insert a step 8 immediately before the `// --- now assert on what was actually captured ---` line
(line 241):

```java
        // 8. A real mail send. Mailer logs the recipient on BOTH its success and its failure
        //    branch, and no other surface in this test drives it — without this the PII
        //    assertion below would not cover the line that prompted the whole item.
        String recipient = "mail-hygiene-" + n + "@t.io";
        mailer.send(recipient, "Verify your email", "verify",
                Map.of("name", "Hygiene", "link", "https://boxhub.test/auth/verify?token=x"));
        // send() is @Async, so it returns before the log line is written. Poll rather than sleep
        // a fixed amount; whether the SMTP connection succeeds or is refused, one of the two
        // Mailer log lines names the template.
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline && !capturedText().contains("template=verify")) {
            Thread.sleep(50);
        }
```

with the import:

```java
import java.util.Map;
```

Then append after the existing assertion block (after line 264):

```java
        // --- M12c: PII, not credentials. Same standing-guarantee shape as the assertions above:
        // a future log line that writes a member's address fails the build.
        assertThat(text).as("Mailer really ran inside the capture window, so the recipient "
                + "assertion below is not vacuous").contains("template=verify");
        assertThat(text).as("mail recipient address in logs").doesNotContain(recipient);
        assertThat(text).as("login request email address in logs").doesNotContain(email);
```

- [ ] **Step 2: Run it and record exactly what goes red**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=LogHygieneTest
```

Expected: FAIL on the `recipient` and/or `email` assertions.

**Report the full failure output, and identify which log line carried each address.** AssertJ
prints the containing text, so the source is visible. This is the evidence that the redactions in
step 3 are the right ones, and it is also how you find any address-carrying line this plan did not
anticipate.

**STOP AND ESCALATE if an address turns out to be logged by Spring's own loggers rather than by
BoxHub code** (for example a Spring Security line naming the authenticated principal). That cannot
be fixed by a DTO redaction, and the honest options — narrowing the assertion or muting a framework
logger — are the orchestrator's call, not yours.

- [ ] **Step 3: Mask the address in `Mailer`**

In `backend/src/main/java/com/boxhub/shared/Mailer.java`, replace the two log lines (57 and 59) and
add the helper. The log calls become:

```java
            log.info("mail sent: template={} to={}", template, mask(to));
        } catch (Exception e) {
            log.error("mail FAILED: template={} to={} — {}", template, mask(to), e.getMessage());
        }
```

and add, below `send`:

```java
    /**
     * Enough of an address to correlate a delivery failure with a member, without writing the
     * identifier itself into a log file that has no retention policy. Mail delivery is the one
     * place BoxHub logs anything about a person at all.
     */
    static String mask(String email) {
        if (email == null || email.isBlank()) return "(none)";
        int at = email.indexOf('@');
        if (at <= 0) return "***";
        return email.charAt(0) + "***" + email.substring(at);
    }
```

- [ ] **Step 4: Redact the address out of the two implicated DTOs**

In `backend/src/main/java/com/boxhub/identity/AuthController.java`, line 77 becomes:

```java
        @Override public String toString() { return "LoginRequest[email=***, password=***]"; }
```

In `backend/src/main/java/com/boxhub/box/InviteAdminController.java`, the request record (lines
38-40) gains a `toString()`:

```java
    /** email redacted — Spring MVC logs the deserialized request body at DEBUG; see
     *  AuthController.RegisterRequest for the full note. A member's address is PII, and the log
     *  has no retention policy. */
    record CreateInviteRequest(@NotBlank @Email String email,
                               @NotBlank @Pattern(regexp = "ATHLETE|COACH|BOX_ADMIN") String role,
                               UUID planId) {
        @Override public String toString() {
            return "CreateInviteRequest[email=***, role=" + role + ", planId=" + planId + "]";
        }
    }
```

and the response record's `toString()` (lines 47-50) becomes:

```java
        @Override public String toString() {
            return "CreatedInviteResponse[id=" + id + ", email=***, role=" + role
                    + ", planId=" + planId + ", expiresAt=" + expiresAt + ", link=***]";
        }
```

**Apply the same one-line `email=***` treatment to any other record the step 2 output implicated,
and list every file you changed in your report.** Do not pre-emptively redact records the failure
output did not name — an unverified redaction is untested work, and the ones this test does not
drive are being recorded as a known limit instead.

- [ ] **Step 5: Run it and watch it pass**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=LogHygieneTest
```

Expected: PASS. Confirm in your report that the vacuous-pass guards still hold — the run must have
asserted `contains("box_stripe")` and `contains("template=verify")` before claiming any absence.

- [ ] **Step 6: Add direct coverage for the masking edge cases**

Append to `backend/src/test/java/com/boxhub/shared/MailerTest.java`:

```java
    @Test
    void maskKeepsEnoughToCorrelateAndNoMore() {
        assertThat(Mailer.mask("alessandro@gmail.com")).isEqualTo("a***@gmail.com");
        assertThat(Mailer.mask("a@b.io")).isEqualTo("a***@b.io");
        // Not an address at all — reveal nothing rather than guess at a structure.
        assertThat(Mailer.mask("garbage")).isEqualTo("***");
        assertThat(Mailer.mask("@nolocalpart.io")).isEqualTo("***");
        assertThat(Mailer.mask(null)).isEqualTo("(none)");
        assertThat(Mailer.mask("  ")).isEqualTo("(none)");
    }
```

- [ ] **Step 7: Run the full backend suite**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```

Expected: all green, zero failures, zero skips. **Report the exact count.** Other tests may assert
on `Mailer`'s log output or on a redacted `toString()` — if one fails, report it rather than
adjusting the new redaction to suit it.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/boxhub/shared/Mailer.java \
        backend/src/main/java/com/boxhub/identity/AuthController.java \
        backend/src/main/java/com/boxhub/box/InviteAdminController.java \
        backend/src/test/java/com/boxhub/security/LogHygieneTest.java \
        backend/src/test/java/com/boxhub/shared/MailerTest.java
git commit -m "fix(m12c): keep member email addresses out of the logs

Mailer logged the full recipient on every send, and the login and invite
DTOs printed the address in toString() — which Spring MVC writes to the
log when anyone turns request/response body logging up. M11's
LogHygieneTest guarded credentials only, so none of it was covered.

Mailer now logs a masked address, enough to correlate a delivery failure
with a member without writing the identifier itself. LogHygieneTest
gains an email assertion and, for the first time, drives a real Mailer
send — without that the guarantee would not have reached the line that
prompted the item.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Gates, docs, backlog, merge — ORCHESTRATOR ONLY

Not dispatched to an executor. Listed so the plan is complete.

- [ ] **Step 1: Full gate on a clean tree**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```

Expected: 405 + 3 new (`OAuth2RedirectUriTest`, `MediaApiTest.rejectsWebpBecauseItsExifCannotBeStripped`,
`MailerTest.maskKeepsEnoughToCorrelateAndNoMore`) = **408**, zero failures, zero skips. `LogHygieneTest`
gains assertions inside an existing test method, so it does not raise the count.

- [ ] **Step 2: Frontend**

```bash
cd frontend && npm run build
```

The production build, because Task 3 edits two templates and `tsc --noEmit` does not type-check
Angular templates. Karma (`npm test -- --watch=false --browsers=ChromeHeadless`) takes about an hour
locally and emits nothing until the end — start it early, never alongside the backend suite, and if
it cannot be waited out, say plainly that Karma did not run and treat CI as the verdict.

- [ ] **Step 3: e2e on a fresh stack**

```bash
docker compose -f docker/docker-compose.yml down -v
cp docker/.env.example docker/.env
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && npx playwright test
```

Expected: 27 passed at `retries: 0`.

- [ ] **Step 4: Docs**

- `docs/BACKLOG.md`: delete the M12c section; archive each item with its evidence. Add to
  **Launch → Production**: verify Google SSO end to end against real Google credentials on the real
  domain (the fake client id proves routing and `redirect_uri` shape, never a token exchange).
  Add as a known limit: `LogHygieneTest`'s PII guarantee covers only the surfaces it drives —
  `MemberDto`, `RosterEntry`, `MeResponse`, `PreviewResponse`, `WaitlistRow`, `SignupBoxResponse`
  and `UserResponse` also carry an address and are not driven by it.
- `docs/HANDOFF.md`: M12c status, the new test counts, the `cp docker/.env.example docker/.env`
  step in "How to run / test", and the deploy guard.
- `.superpowers/sdd/progress.md`: the M12c section, task → SHA.

- [ ] **Step 5: Merge and check CI**

`--no-ff` merge to `main`, push, then **read the CI run**. A local green is not the gate, and Task 1
changes CI's own setup — the e2e job cannot start the stack without the new `cp` step.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: T1 ↔ "Compose secrets fail closed" (including
`BOXHUB_COOKIE_SECURE`, the deploy guard, CI and README); T2 ↔ "Google SSO reachable and correct"
(nginx, the explicit OAuth `redirectUri`, dev client id, both tests, the deferred real-Google backlog
entry in Task 5); T3 ↔ "Drop WebP uploads"; T4 ↔ "Recipient addresses out of the logs"; T5 ↔
"Testing and gates". The spec's six hardening invariants are restated verbatim at the top of this
plan and referenced from the steps where they bite (Task 2 step 4, Task 4 steps 2 and 4).

**Placeholders.** None. Every code step carries the actual code; every command carries its expected
output; the one deliberately open-ended instruction (Task 4 step 4, "any other record the step 2
output implicated") is bounded by a preceding step that produces the list, and is paired with an
explicit prohibition on guessing beyond it.

**Type consistency.** `Mailer.mask(String) -> String` is declared package-private static in Task 4
step 3 and called as `Mailer.mask(...)` from `MailerTest` in step 6 — same package
(`com.boxhub.shared`), so the visibility works. `capturedText()` and the `text` local in
`LogHygieneTest` are the existing names. The e2e assertion uses the `request` fixture with
`maxRedirects: 0`; `baseURL` is `http://localhost` per `e2e/playwright.config.ts:5`.
