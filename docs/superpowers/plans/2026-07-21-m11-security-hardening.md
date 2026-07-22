# M11 — Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the whole application surface to a public-launch bar — hostile internet *and* hostile tenants — with tenancy proven by a standing automated guarantee rather than a one-time audit.

**Architecture:** Task 1 builds an authz/tenancy **conformance sweep** over Spring's own route table and runs it; whatever it finds is catalogued in an explicit `KNOWN_GAPS` set and fixed in Task 2, which empties that set. The remaining tasks close the confidentiality surface (signed media URLs, TV token off the query string), the secrets surface (no-default enforcement, encryption-key versioning, log hygiene), and the hygiene tier (rate limits, purge jobs, CSP/headers, dependency scanning).

**Tech Stack:** Spring Boot 3.4 / Java 21, Spring Security 6.4.2, Flyway V15, Postgres 16, Caffeine (rate limiting), nginx `secure_link`, Angular 19 (`ngCspNonce`), Playwright, OWASP dependency-check.

**Spec:** `docs/superpowers/specs/2026-07-21-m11-security-hardening-design.md` — read before Task 1.

## Global Constraints

- `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` before every backend `mvn`. **Flyway V15 only** (Task 7); never edit V1–V14.
- **Tenancy (binding):** `Plan`, `Subscription`, `Payment`, `Invite`, `Track` and every other `@TenantId` entity are silently filtered to the caller's box. Any query that must be tenant-agnostic (cross-box job, lookup by unguessable token) **MUST be native SQL** — a JPQL/derived query with no tenant set resolves to the all-zeros root tenant and returns NOTHING without erroring. This has shipped as a real bug twice on invites and once on the M10 lapse job.
- **System-level writers have no tenant.** Schedulers and jobs writing `@TenantId` entities must establish a synthetic box tenant **before the transaction opens** (`runAsBox(...)` — see `TvStreamService`, `SubscriptionLapseJob`), or `@TenantId` resolves to the sentinel and inserts fail on FK.
- **No secret gets a working default.** A missing secret must fail startup, not fall back (M10 shipped a real AES key as an `application.yml` default).
- **Every new box-scoped endpoint** gets happy + auth-denied + cross-tenant-denied tests. After Task 1 the sweep enforces this automatically.
- Design law: tokens only (a raw hex outside `frontend/src/styles/_tokens.scss` is a bug), shared `bh-*` components, loading/error/empty per fetch, pending + inline-error per save, WCAG AA.
- Gates: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test` · `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build` · e2e on a fresh stack (`docker compose -f docker/docker-compose.yml down -v` first).
- Conventional commits ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. macOS dup files break builds: `find . -name "* 2.*" -not -path "*/node_modules/*" -not -path "*/dist/*" -delete`.
- **Repo orientation rule (binding):** run `graphify query "<question>"` before exploring/grepping; direct reads of files you are about to modify are allowed. Include this rule in every subagent prompt.

## Execution model — per-task model tiering (decided 2026-07-21)

Orchestrator = the main session's own model. Executors are dispatched with an **explicit** `model`, chosen per task:

| Tier | Tasks | Rationale |
|---|---|---|
| **opus** | T1 (sweep), T2 (authz fixes), T6 (secrets/crypto), T12 final review | These set the milestone's guarantee, touch crypto correctness, or fix the holes themselves. |
| **sonnet** | T3, T4, T5, T7, T8, T9, T10, T11 | The plan carries the code; judgment is bounded. |
| **haiku** | none | Every M11 task carries security judgment. M10's evidence: the "mechanical" Stripe task needed three fix rounds for real money bugs. |

**Reviewer model scales to diff risk**, not a fixed tier: opus reviews T1/T2/T6, sonnet reviews the rest.

**Escalation ladder (binding):** if an executor returns BLOCKED, or a review returns a Critical, the *fix* dispatch
goes **one tier up** from the tier that produced the defect. Cheapest-model-first is a false economy when a task
needs three rounds — turn count beats token price.

## File Structure

**Backend — new:**

| File | Responsibility |
|---|---|
| `backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java` | The sweep: enumerates routes, asserts three denials, owns the allowlist + role table + `KNOWN_GAPS`. |
| `backend/src/test/java/com/boxhub/security/SecretDefaultsTest.java` | Fails if any secret-bearing config property has a usable default. |
| `backend/src/test/java/com/boxhub/security/LogHygieneTest.java` | Drives auth/Stripe flows with a log appender attached; fails on any secret in output. |
| `backend/src/main/java/com/boxhub/shared/MediaSigner.java` | Mints `secure_link` tokens; the only place the media secret is used. |
| `backend/src/main/java/com/boxhub/box/SuperadminAudit.java` + `SuperadminAuditRepository.java` | Append-only superadmin lifecycle log. |
| `backend/src/main/resources/db/migration/V15__superadmin_audit.sql` | The audit table. |

**Backend — modified:** `shared/SecurityConfig.java` (role table alignment, headers), `shared/AuthRateLimitFilter.java` (extended limits + global ceiling), `shared/CryptoService.java` (key versioning), `shared/MediaStorage.java` (EXIF strip), `shared/RefreshTokenPurgeJob.java` (email tokens, invites, TV pairing — native SQL), `display/TvPairController.java` + `TvStreamController.java` (cookie), `box/StripeWebhookController.java` (uniform 200), `identity/AuthController.java` (per-session kill), `box/SuperadminBoxController.java` (audit writes), `docker/nginx.conf`, `docker/docker-compose.yml`, `.github/workflows/ci.yml`, `application.yml`.

**Frontend — modified:** `index.html` / `main.ts` (CSP nonce), `features/account/security.page.ts` (per-session kill), `features/admin/console.page.ts` (audit list), any DTO consumer of media paths.

**E2E:** `e2e/tests/security.spec.ts` (headers present, zero CSP violations).

---

### Task 1: The conformance sweep

**Files:**
- Create: `backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java`

**Interfaces:**
- Produces: a passing test whose `KNOWN_GAPS` set names every route that currently fails, each with a comment. Task 2 consumes and empties it.

- [ ] **Step 1: Write the sweep**

Enumerate from Spring's own mapping so no route can hide. Substitute a random UUID for every path variable. Note two traps baked in below: **(a)** a no-`Authorization` write request hits the CSRF filter *before* the authorization filter and returns 403, masking the 401 — so write methods use `.with(csrf())` for the unauthenticated case (same pattern as `SuperadminBoxApiTest.everyEndpointRejectsUnauthenticated`); **(b)** a 400 means validation ran before authz and the assertion learned nothing — it fails.

```java
package com.boxhub.security;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.request.RequestPostProcessor.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

/**
 * The M11 standing guarantee. Every mapped route must deny (a) no credentials, (b) a foreign box's
 * token, (c) an insufficient role. Default is DENY: a route that is neither allowlisted nor listed
 * in MIN_ROLE fails, so an endpoint added later cannot quietly skip tenancy.
 */
class AuthzConformanceTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired RequestMappingHandlerMapping mapping;
    @Autowired SweepFixture fixture; // see Step 3

    /** Deliberately not box-scoped. EVERY entry needs a justification comment. */
    private static final Set<String> PUBLIC_ALLOWLIST = Set.of(
            "/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/csrf",
            "/api/auth/providers", "/api/auth/verify", "/api/auth/verify/resend",
            "/api/auth/password/forgot", "/api/auth/password/reset",
            "/api/auth/signup-box", "/api/auth/waitlist", "/api/auth/signup-mode",
            "/api/me/email/confirm",          // token in the link is the credential
            "/api/invites/{token}",           // public invite preview, unguessable token
            "/api/tv/pair", "/api/tv/pair/poll", "/api/tv/stream", // device pairing, pre-identity
            "/api/stripe/webhook",            // Stripe signature IS the credential
            "/actuator/health");

    /** Minimum role per box-scoped route. A route missing here FAILS — state intent explicitly. */
    private static final Map<String, String> MIN_ROLE = Map.ofEntries(
            Map.entry("POST /api/box/subscriptions", "BOX_ADMIN"),
            Map.entry("DELETE /api/box/subscriptions/{id}", "BOX_ADMIN"),
            Map.entry("POST /api/box/subscriptions/checkout", "ATHLETE"),
            Map.entry("GET /api/box/me/subscription", "ATHLETE"),
            Map.entry("GET /api/box/receipts/{paymentId}", "ATHLETE"),
            Map.entry("GET /api/box/plans", "ATHLETE"),
            Map.entry("POST /api/box/plans", "BOX_ADMIN"),
            Map.entry("PATCH /api/box/plans/{id}", "BOX_ADMIN"),
            Map.entry("GET /api/box/stripe", "BOX_ADMIN"),
            Map.entry("PUT /api/box/stripe", "BOX_ADMIN"),
            Map.entry("DELETE /api/box/stripe", "BOX_ADMIN"),
            Map.entry("GET /api/box/members", "BOX_ADMIN"),
            Map.entry("PATCH /api/box/members/{membershipId}", "BOX_ADMIN"),
            Map.entry("POST /api/box/media", "ATHLETE"));
    // NOTE: the list above is a STARTING POINT, not complete. Step 2 prints every unlisted route;
    // add each one with its real intended role before the test can pass.

    /** Routes known to fail TODAY. Task 2 fixes each and empties this set. */
    private static final Set<String> KNOWN_GAPS = Set.of(); // filled in Step 4

    private record Route(String method, String pattern) {
        String key() { return method + " " + pattern; }
    }

    private List<Route> routes() {
        List<Route> out = new ArrayList<>();
        mapping.getHandlerMethods().forEach((info, handler) -> {
            var patterns = info.getPathPatternsCondition() != null
                    ? info.getPathPatternsCondition().getPatternValues()
                    : Set.<String>of();
            var methods = info.getMethodsCondition().getMethods();
            for (String p : patterns) {
                if (!p.startsWith("/api/")) continue;
                if (methods.isEmpty()) out.add(new Route("GET", p));
                else methods.forEach(m -> out.add(new Route(m.name(), p)));
            }
        });
        return out;
    }

    /** Path variables get a random UUID — authz must reject before any id is resolved. */
    private String concrete(String pattern) {
        return pattern.replaceAll("\\{[^}]+}", UUID.randomUUID().toString());
    }

    private MockHttpServletRequestBuilder req(Route r) {
        var b = request(HttpMethod.valueOf(r.method()), concrete(r.pattern()))
                .contentType(APPLICATION_JSON).content("{}");
        // A write with no Authorization header hits the CSRF filter first and 403s, hiding the
        // 401 we are actually testing. Same reason SuperadminBoxApiTest uses .with(csrf()).
        return "GET".equals(r.method()) ? b : b.with(csrf());
    }

    @Test
    void everyRouteDeniesAnonymousForeignTenantAndInsufficientRole() throws Exception {
        List<String> failures = new ArrayList<>();
        List<String> unlisted = new ArrayList<>();

        for (Route r : routes()) {
            if (PUBLIC_ALLOWLIST.contains(r.pattern())) continue;
            if (KNOWN_GAPS.contains(r.key())) continue;

            // (a) no credentials
            int anon = mvc.perform(req(r)).andReturn().getResponse().getStatus();
            if (anon != 401) failures.add(r.key() + " anonymous -> " + anon + " (want 401)");

            if (!r.pattern().startsWith("/api/box/")) continue;

            // (b) a valid token for a DIFFERENT box
            int foreign = mvc.perform(req(r).header("Authorization", "Bearer " + fixture.foreignBoxToken()))
                    .andReturn().getResponse().getStatus();
            if (foreign < 400 || foreign == 400)
                failures.add(r.key() + " foreign-box -> " + foreign + " (want 403/404; 400 means validation ran before authz)");

            // (c) insufficient role
            String need = MIN_ROLE.get(r.key());
            if (need == null) { unlisted.add(r.key()); continue; }
            if ("BOX_ADMIN".equals(need)) {
                int athlete = mvc.perform(req(r).header("Authorization", "Bearer " + fixture.athleteToken()))
                        .andReturn().getResponse().getStatus();
                if (athlete != 403) failures.add(r.key() + " athlete-on-admin-route -> " + athlete + " (want 403)");
            }
        }

        assertThat(unlisted)
                .as("Routes with no declared minimum role. Add each to MIN_ROLE with its real intent.")
                .isEmpty();
        assertThat(failures).as("Authz conformance failures").isEmpty();
    }
}
```

- [ ] **Step 2: Run it and capture the route inventory**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=AuthzConformanceTest`
Expected: FAIL, listing every unlisted route and every conformance failure. **This output is the task's real deliverable.** Save it verbatim into the report file.

- [ ] **Step 3: Add the fixture**

Create `SweepFixture` as a `@TestComponent` (or a plain helper the test constructs) exposing `foreignBoxToken()` and `athleteToken()`: two boxes, an ATHLETE membership in box A, a BOX_ADMIN in box B, minted via `TokenService.boxToken(user, membership)`. Follow `SubscriptionApiTest`'s setup exactly — it already builds two boxes and three tokens.

- [ ] **Step 4: Complete `MIN_ROLE`, then triage into `KNOWN_GAPS`**

Add every route Step 2 printed to `MIN_ROLE` with its **real** intended minimum role (read the controller — do not guess). Re-run. Every route that still fails goes into `KNOWN_GAPS` as `"METHOD /pattern"` with a one-line comment naming what is wrong. The test must now be GREEN with a non-empty `KNOWN_GAPS`.

- [ ] **Step 5: Full suite + commit**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test` → green.

```bash
git add backend/src/test/java/com/boxhub/security/
git commit -m "$(cat <<'EOF'
test(m11): authz/tenancy conformance sweep over the live route table

Enumerates every mapped route and asserts it denies anonymous callers, a
foreign box's token, and an insufficient role. Default is deny: a route that
is neither allowlisted nor assigned a minimum role fails the sweep, so an
endpoint added later cannot quietly skip tenancy.

A 400 is treated as a failure, not a pass — it means validation ran before
authorization, so the assertion proved nothing about whether authz exists.

Routes failing today are catalogued in KNOWN_GAPS; Task 2 empties it.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Fix every sweep finding

**Files:** Modify: whatever `KNOWN_GAPS` names. Modify: `AuthzConformanceTest.java` (empty `KNOWN_GAPS`).

**Interfaces:** Consumes Task 1's `KNOWN_GAPS`. Produces: a green sweep with `KNOWN_GAPS` empty.

- [ ] **Step 1: Fix each gap at the root, one commit per coherent group**

For each entry: read the controller, add the missing guard (`RoleGuard.requireBoxAdmin()`, a tenant-scoped `findByIdAndBoxId`, or a `TenantContext.requireBoxId()` scope), and **move the authz check ahead of any validation** where the failure was a 400.

Do NOT "fix" a gap by adding it to `PUBLIC_ALLOWLIST` unless the endpoint is genuinely public — and if so, the justification comment must say why, and it belongs in the report for the reviewer to challenge.

- [ ] **Step 2: Remove each fixed entry from `KNOWN_GAPS`**

- [ ] **Step 3: Verify** — `mvn test -Dtest=AuthzConformanceTest` green with `KNOWN_GAPS = Set.of()`, then full `mvn test` green.

- [ ] **Step 4: Commit** `fix(m11): close every authz gap the conformance sweep found`

---

### Task 3: `@TenantId` native-query audit

**Files:** Modify: any repository found wrong. Create: `docs/TENANCY.md`.

**Interfaces:** Produces: `docs/TENANCY.md` — the convention note referenced from `CLAUDE.md`.

The sweep is **blind** to this: it tests endpoints, while this is about repository methods that silently filter to the caller's box when they were meant to be tenant-agnostic.

- [ ] **Step 1: Inventory** — list every `@TenantId` entity and every repository method on it. `graphify query "which entities use @TenantId and what repositories query them"` first.

- [ ] **Step 2: Classify each method** as *box-scoped* (correct as derived/JPQL) or *tenant-agnostic* (MUST be `@Query(nativeQuery = true)`). Tenant-agnostic means: called by a scheduler, a webhook, a cross-box job, or a lookup by unguessable token.

- [ ] **Step 3: Fix any misclassified method** and add a test that would fail against the derived version — seed rows in **two** boxes and assert the tenant-agnostic query sees both. A single-box test passes happily while the query silently returns nothing.

- [ ] **Step 4: Write `docs/TENANCY.md`** — the rule, the two failure modes (silent-empty read, FK-violating write), the `runAsBox` pattern with its before-the-transaction ordering, and the list of methods deliberately native with why. Link it from `CLAUDE.md`'s tenancy section.

- [ ] **Step 5:** Full suite green. Commit `fix(m11): audit tenant-agnostic queries on @TenantId entities`.

---

### Task 4: Signed media URLs + EXIF stripping

**Files:**
- Create: `backend/src/main/java/com/boxhub/shared/MediaSigner.java`, `backend/src/test/java/com/boxhub/shared/MediaSignerTest.java`
- Modify: `shared/MediaStorage.java`, `docker/nginx.conf`, `docker/docker-compose.yml`, `application.yml`, every DTO that emits a media path
- Test: `backend/src/test/java/com/boxhub/shared/MediaApiTest.java`

**Interfaces:**
- Produces: `MediaSigner.sign(String path)` → path with `?md5=…&expires=…`; `MediaSigner.EXPIRY` = 10 minutes.

- [ ] **Step 1: Write `MediaSignerTest`** — a signed URL contains `md5` and `expires`; two signs of the same path differ once the expiry window moves; the digest matches nginx's `secure_link_md5` construction exactly (`md5(expires + uri + secret)`, base64url, `+/` → `-_`, `=` stripped).

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement `MediaSigner`**

```java
package com.boxhub.shared;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

/**
 * Mints nginx secure_link tokens. MD5 here is a KEYED digest (secret appended, so no
 * length-extension); forgery needs the secret, not a collision. This is nginx's own mechanism —
 * see the M11 spec for the auth_request fallback if MD5 is ever ruled out.
 */
@Service
public class MediaSigner {

    public static final long EXPIRY_SECONDS = 600;

    private final String secret;

    public MediaSigner(@Value("${boxhub.media.link-secret}") String secret) {
        this.secret = secret;
    }

    public String sign(String path) {
        if (path == null || path.isBlank()) return path;
        long expires = Instant.now().getEpochSecond() + EXPIRY_SECONDS;
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] d = md.digest((expires + path + " " + secret).getBytes(StandardCharsets.UTF_8));
            String token = Base64.getEncoder().encodeToString(d)
                    .replace('+', '-').replace('/', '_').replace("=", "");
            return path + "?md5=" + token + "&expires=" + expires;
        } catch (Exception e) {
            throw new IllegalStateException("media sign failed", e); // never log the secret
        }
    }
}
```

- [ ] **Step 4: nginx validates it**

In `docker/nginx.conf`, replace the `location /media/` block:

```nginx
    location /media/ {
        secure_link $arg_md5,$arg_expires;
        secure_link_md5 "$secure_link_expires$uri $media_link_secret";

        if ($secure_link = "") { return 403; }   # bad signature
        if ($secure_link = "0") { return 410; }  # expired

        alias /srv/media/;
        expires 10m;
        add_header Cache-Control "private";
    }
```

Set `$media_link_secret` from the environment (nginx needs it templated in — use the `envsubst` entrypoint the image already supports, or a `map`). `docker-compose.yml` passes the same value to both services as `BOXHUB_MEDIA_LINK_SECRET`; `application.yml` reads `boxhub.media.link-secret: ${BOXHUB_MEDIA_LINK_SECRET}` **with no default** (Global Constraints).

- [ ] **Step 5: Mint at every emission point**

Every DTO that returns a media path routes it through `MediaSigner.sign(...)`. The per-image-class rules from the spec:
- **athlete avatar** → box members only (signing is enough; the DTO is already box-scoped)
- **box logo** → public; it renders on the pre-login invite preview, so it is **not** signed
- **class-type photo** → box members only, signed

**The TV is the hard case:** `TvStateService.compose(...)` must sign fresh on every SSE push, so a board open all day keeps working with a 10-minute expiry.

- [ ] **Step 6: EXIF strip on upload**

In `MediaStorage.store(...)`, re-encode the image through `ImageIO` (read → write) before saving, which drops all metadata including GPS. Assert in `MediaApiTest` that an upload carrying EXIF GPS comes back with none.

- [ ] **Step 7:** Full suite green. Commit `feat(m11): signed short-lived media URLs and EXIF stripping`.

---

### Task 5: TV stream token off the query string

**Files:** Modify: `display/TvPairController.java`, `display/TvStreamController.java`, `docker/nginx.conf`, `frontend/src/app/features/tv/*`. Test: `display/TvStreamApiTest.java`.

**Interfaces:** Produces: `bh_tv` httpOnly cookie, `Path=/api/tv`, `SameSite=Lax`, set when pairing is claimed; `GET /api/tv/stream` reads it and no longer requires `?token=`.

- [ ] **Step 1: Write the tests** — pairing-poll success sets an httpOnly `bh_tv` cookie; `/api/tv/stream` connects with only that cookie; a request with **no** cookie is rejected; a REVOKED device is rejected on connect; and the stream URL the frontend builds contains no token.

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement** — set the cookie at pair-claim (reuse `CookieService`'s builder conventions from M8), read it in the stream endpoint, keep the existing `?token=` path working **only** if a test proves the TV frontend still needs it; otherwise delete it. `EventSource` sends cookies same-origin with no extra client work.

- [ ] **Step 4: nginx stops logging the query string** on `/api/tv/stream`:

```nginx
    location /api/tv/stream {
        access_log /var/log/nginx/access.log combined_noquery;
        ...
    }
```
Define `log_format combined_noquery` identical to `combined` but with `$uri` in place of `$request`.

- [ ] **Step 5:** Backend + frontend + `tv.spec.ts` green. Commit `feat(m11): TV stream token moves to an httpOnly cookie`.

---

### Task 6: Secrets — no defaults, key versioning, log hygiene, payment surface

**Files:**
- Create: `backend/src/test/java/com/boxhub/security/SecretDefaultsTest.java`, `LogHygieneTest.java`
- Modify: `shared/CryptoService.java`, `box/StripeWebhookController.java`, `application.yml`

**Interfaces:** Produces: `CryptoService.encrypt` output prefixed `v{n}:`; `decrypt` accepts any known key version.

- [ ] **Step 1: `SecretDefaultsTest`** — parse `application.yml`, collect every property whose name matches `(secret|password|key|token|credential)`, and fail any whose placeholder carries a fallback (`${VAR:something}`). Allow an explicit, commented exception list for non-secrets that merely match the regex (e.g. `boxhub.media-dir` does not, but `spring.datasource.password` in the dev profile might need one).

- [ ] **Step 2: Key versioning in `CryptoService`**

Config becomes `boxhub.stripe.enc-keys` = a comma-separated list of `version:base64key`, newest first; `encrypt` always uses the highest version and prefixes the output `v{n}:`; `decrypt` reads the prefix and selects the matching key, falling back to the single unprefixed legacy format so **existing rows keep decrypting**. Test: encrypt with v2, decrypt; a v1-encrypted value still decrypts after v2 is added; an unknown version throws.

- [ ] **Step 3: `LogHygieneTest`** — attach a Logback `ListAppender` to the root logger, drive login, refresh, Stripe connect (PUT `/api/box/stripe`) and a webhook call, then assert no captured message contains the test JWT, the restricted key, the webhook secret, or the encryption key.

- [ ] **Step 4: Payment surface** — make the webhook's unknown-session and no-credentials paths both return **200**, closing the existence oracle (`StripeWebhookController` currently returns 400 when a known session's box has no creds). Add a test asserting both are 200 and neither writes.

- [ ] **Step 5:** Full suite green. Commit `feat(m11): secret-default enforcement, encryption key versioning, log hygiene`.

---

### Task 7: Superadmin audit log (Flyway V15)

**Files:**
- Create: `V15__superadmin_audit.sql`, `box/SuperadminAudit.java`, `box/SuperadminAuditRepository.java`
- Modify: `box/SuperadminBoxController.java`, `box/BoxLifecycleTx.java`, `frontend/src/app/features/admin/console.page.ts`
- Test: `box/SuperadminAuditTest.java`

**Interfaces:** Produces: `GET /api/admin/audit` → newest-first list. Rows are append-only (no update/delete path).

- [ ] **Step 1: Migration**

```sql
-- M11: minimal append-only record of superadmin lifecycle actions.
create table superadmin_audit (
    id           uuid primary key default gen_random_uuid(),
    actor_email  text        not null,
    action       text        not null check (action in
                   ('APPROVE','REJECT','SUSPEND','REACTIVATE','SETTINGS_CHANGE')),
    box_id       uuid references boxes (id) on delete set null,
    detail       text,
    created_at   timestamptz not null default now()
);
create index idx_superadmin_audit_created on superadmin_audit (created_at desc);
```

`superadmin_audit` is **NOT** `@TenantId` — it is platform-wide by nature.

- [ ] **Step 2: Write the test** — each of the five actions writes exactly one row with the right actor/action/box; the row is written **only on success** (a 409 `CAP_REACHED` approve writes nothing); `GET /api/admin/audit` is superadmin-only (a BOX_ADMIN token → 403).

- [ ] **Step 3: Run, fail.**

- [ ] **Step 4: Implement** — write the audit row **inside** the same transaction as the lifecycle change (`BoxLifecycleTx`), so a rolled-back transition leaves no audit row. This is the opposite of the mail rule: mail goes after commit, the audit row goes inside it.

- [ ] **Step 5: Console list** — a plain table in the existing superadmin console (loading/error/empty states per design law).

- [ ] **Step 6:** Backend + frontend green. Commit `feat(m11): minimal superadmin audit log`.

---

### Task 8: Per-session kill

**Files:** Modify: `identity/AuthController.java`, `identity/AccountService.java`, `frontend/src/app/features/account/security.page.ts`. Test: `identity/SessionApiTest.java`.

**Interfaces:** Produces: `DELETE /api/auth/sessions/{familyId}` → 204.

- [ ] **Step 1: Write the tests** — deleting a session revokes that family only (the caller's other sessions still refresh successfully); deleting **another user's** session id → 404 (never 403, no existence leak); deleting the current session logs the caller out.

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement** — the endpoint lives under `/api/auth` because `bh_rt` is `Path=/api/auth` (M8 gotcha #8: a cookie-path mismatch passes in MockMvc and fails only in a real browser). Revoke by family id, scoped to the calling user.

- [ ] **Step 4: Frontend** — a "Sign out" control per row on the security page, with pending state and inline error.

- [ ] **Step 5:** Backend + frontend green. Commit `feat(m11): per-session revocation`.

---

### Task 9: Extended rate limits

**Files:** Modify: `shared/AuthRateLimitFilter.java`, `docker/docker-compose.yml`, `application.yml`. Test: `shared/RateLimitTest.java`.

**Interfaces:** Produces: per-path limits + a global per-IP ceiling, all overridable by env.

- [ ] **Step 1: Write the tests** — each newly-limited path 429s past its limit; a legitimate burst under the limit passes; the global ceiling trips independently; limits are per-IP (a second IP is unaffected).

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement** — the current filter matches `LIMITED.contains(request.getRequestURI())`, which cannot match paths with variable segments. Add prefix/pattern matching so `/api/box/invites`, `/api/box/media`, `/api/box/subscriptions/checkout`, `/api/box/sessions/*/book` and the public `/api/invites/*` and `/api/box/receipts/*` can be limited, plus a global counter keyed by IP alone.

- [ ] **Step 4: THE OPERATIONAL TRAP** — the e2e suite is serial and fires far more requests per minute from one IP than any human, which is exactly why `BOXHUB_AUTH_RATE_LIMIT=200` already exists in the dev/e2e compose env. **Every new limit needs the same dev-env override in `docker/docker-compose.yml`**, or the e2e suite starts failing in a way that looks like flake and is not.

- [ ] **Step 5:** Full suite + **e2e on a fresh stack** green. Commit `feat(m11): rate limits on abuse-prone endpoints`.

---

### Task 10: Purge jobs

**Files:** Modify: `shared/RefreshTokenPurgeJob.java` (rename to `PurgeJob`), repositories as needed. Test: `shared/PurgeJobTest.java`.

**Interfaces:** Produces: one nightly `@Scheduled` sweep covering refresh tokens, email tokens, invites and TV pairing codes.

- [ ] **Step 1: Write the tests** — each row type past its retention is deleted, each still-valid row survives, and **every case is seeded across TWO boxes**. M10 taught this precisely: a single-box test passes happily while a cross-box sweep silently does nothing.

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement** — extend the existing job (already `@Scheduled(cron = "0 30 3 * * *")`). **`Invite` is `@TenantId`**, so the invite purge MUST be `@Query(nativeQuery = true)` or it will delete nothing and pass a naive test. Purge: consumed/expired `email_tokens`, accepted-or-expired invites, PENDING `tv_devices` pairing codes older than their window. Keep the existing refresh-token retention semantics unchanged (consumed rows are load-bearing for reuse detection).

- [ ] **Step 4:** Full suite green. Commit `feat(m11): nightly purge of expired tokens, invites and pairing codes`.

---

### Task 11: Security headers + CSP

**Files:** Modify: `docker/nginx.conf`, `frontend/src/index.html`, `frontend/src/main.ts`. Create: `e2e/tests/security.spec.ts`.

**Interfaces:** Produces: strict CSP with an Angular nonce; headers asserted in e2e.

- [ ] **Step 1: Headers at nginx** (the single ingress):

```nginx
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'nonce-$request_id'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

HSTS is inert until TLS lands in Production; it ships now so it is not forgotten.

- [ ] **Step 2: Angular nonce** — Angular injects component styles as runtime `<style>` tags, so `style-src` needs the nonce rather than `'unsafe-inline'`. Set `ngCspNonce` on the root element from the nginx-provided `$request_id` (sub_filter into `index.html`), and confirm `scripts` need no `unsafe-inline`/`unsafe-eval`.

- [ ] **Step 3: e2e proves it in a real browser** — CSP is the classic case that passes every unit test and breaks the live app:

```ts
test('security headers present and no CSP violations across the app', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', m => { if (m.text().includes('Content Security Policy')) violations.push(m.text()); });

  const res = await page.goto('http://localhost/');
  expect(res!.headers()['x-content-type-options']).toBe('nosniff');
  expect(res!.headers()['content-security-policy']).toContain("frame-ancestors 'none'");

  // walk the main journeys — login, athlete home, book, admin
  // ... (drive the same flows tracking.spec.ts uses)
  expect(violations).toEqual([]);
});
```

- [ ] **Step 4:** Fresh-stack e2e green. Commit `feat(m11): security headers and a strict CSP`.

---

### Task 12: Dependency scanning, docs, final review, merge

**Files:** Modify: `.github/workflows/ci.yml`, `backend/pom.xml`, `docs/HANDOFF.md`, `docs/BACKLOG.md`, `CLAUDE.md`, `.superpowers/sdd/progress.md`. Create: `backend/owasp-suppressions.xml`.

- [ ] **Step 1: Dependency scanning** — add the OWASP dependency-check Maven plugin failing on CVSS ≥ 7, plus `npm audit --audit-level=high` in the frontend job. Create a **reviewed** suppression file: an unsuppressed scan goes noisy and then gets ignored, which is worse than no scan. Every suppression carries a comment saying why.

- [ ] **Step 2: Docs** — HANDOFF M11 bullet (the sweep and what it guarantees, signed media, TV cookie, key versioning, audit log, per-session kill, limits, purge, CSP, dep scan); test counts; next Flyway **V16**; "Immediate next step" → M12 frontend rework. Add the sweep and `docs/TENANCY.md` to `CLAUDE.md`'s binding rules so future milestones inherit them. Update `.superpowers/sdd/progress.md`.

- [ ] **Step 3: Final whole-branch review** (most-capable model) — cross-cutting focus: does the sweep's allowlist contain anything that should not be public? Can any media URL be minted for an image the caller may not see? Does the CSP actually block inline script in the built app, or did a nonce leak make it permissive? Is any secret reachable via a log, DTO, or error? Fix Critical/Important, then `superpowers:finishing-a-development-branch` — merge to main, re-verify on merged main, push.

---

## Self-review (folded in)

**Spec coverage:** §1 sweep → T1, T2. §2.1 signed media + EXIF → T4. §2.2 TV token → T5. §3 secrets/key versioning/log hygiene/payment surface → T6; superadmin audit → T7; per-session kill → T8. §4 headers+CSP → T11; rate limits → T9; purge → T10; `@TenantId` audit → T3; dep scan → T12. §5 testing → folded into each task; done criteria → T12.

**Hazards pre-adjudicated (executors: do not re-litigate):**
- The sweep's role assertion **cannot** be inferred — `RoleGuard` is imperative, so `MIN_ROLE` is a declared table and an unlisted route fails by design.
- A no-`Authorization` write hits CSRF before authz and returns 403 — the sweep uses `.with(csrf())` for the anonymous case, matching `SuperadminBoxApiTest`.
- A 400 on the foreign-tenant probe is a **failure**, not a pass.
- `Invite` is `@TenantId`: the purge sweep must be native SQL (this bug shipped twice).
- Media signing uses MD5 as a *keyed* digest — this is nginx's own `secure_link` mechanism, not a security defect; `auth_request` is the documented fallback.
- Audit rows go **inside** the lifecycle transaction (a rolled-back transition must leave no row) — the inverse of the mail-after-commit rule.
- Every new rate limit needs a dev/e2e env override or the e2e suite fails looking like flake.

**Consistency:** `MediaSigner.sign` / `KNOWN_GAPS` / `MIN_ROLE` / `PUBLIC_ALLOWLIST` / `bh_tv` / `superadmin_audit` used identically across tasks. Flyway V15 is claimed by T7 only.
