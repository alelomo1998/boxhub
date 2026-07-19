# M10 — Memberships & Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A box sells memberships — publishes priced plans, subscribes athletes (self-serve via the box's own Stripe or admin-recorded at any agreed price/method), and booking rights follow the active subscription.

**Architecture:** `subscription` becomes the first-class entity between a membership and a plan; `Membership.planId` is dropped and the booking engine reads the active subscription for its entitlement check. Stripe is one optional automated rail (box's own restricted key, AES-GCM encrypted, signature-verified webhook); every other payment is admin-recorded at the amount collected. Existing members are grandfathered into no-expiry active subscriptions so nobody loses booking on deploy day.

**Tech Stack:** Spring Boot 3.4 / Java 21, Flyway V14, Postgres 16, `com.stripe:stripe-java`, JDK `javax.crypto` AES-GCM, M8 Mailer + Thymeleaf, Angular 19 standalone + signals, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-19-m10-memberships-payments-design.md` — read before Task 1.

## Global Constraints

- `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` before every backend `mvn`. **Flyway V14 only**; never edit V1–V13.
- **Tenancy (binding):** `Plan`, `Subscription`, `Payment` are `@TenantId`. `Box`, `Membership`, `BoxStripe` are NOT. Any tenant-agnostic access to a `@TenantId` entity (e.g. the Stripe webhook, which runs tenant-less) MUST be native SQL — JPQL/derived queries silently filter to the all-zeros root tenant and find nothing (gotcha #1, it bit invites twice). Every new box-scoped endpoint gets happy + auth-denied + cross-tenant-denied tests.
- **Secrets:** the Stripe restricted key + webhook secret are AES-GCM encrypted at rest via `BOXHUB_STRIPE_ENC_KEY` (32-byte env). Never returned to a client, never logged. Settings GET returns `{connected: boolean}` only.
- **Money is integer cents.** Never a float/double for money anywhere.
- Design law: tokens only, `bh-*` components, loading/error/empty per fetch, pending+inline-error with preserved input per save, WCAG AA. FE plain — M12 restyles.
- Backend gate: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. Frontend: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`. E2E: fresh stack (`down -v`) then `cd e2e && npx playwright test`.
- Conventional commits ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. macOS `* 2.*` dup files break builds: `find . -name "* 2.*" -not -path "*/node_modules/*" -not -path "*/dist/*" -delete`.
- **Repo orientation rule (binding):** run `graphify query "<question>"` before exploring/grepping; direct reads of files you are about to modify are allowed. Include this rule in every subagent prompt.

## File Structure

**Backend — new** (under `backend/src/main/java/com/boxhub/`):

| File | Responsibility |
|---|---|
| `box/Subscription.java` + `SubscriptionRepository.java` | The subscription entity + queries (active-by-membership, expired sweep). |
| `box/Payment.java` + `PaymentRepository.java` | Payment record (receipt source); `findByStripeSessionId`. |
| `box/BoxStripe.java` + `BoxStripeRepository.java` | Per-box encrypted Stripe credentials (NOT @TenantId). |
| `shared/CryptoService.java` | The only AES-GCM encrypt/decrypt; reads `BOXHUB_STRIPE_ENC_KEY`. |
| `box/SubscriptionService.java` | create-or-extend semantics, agreed-price rules, single-active invariant. |
| `box/PaymentReceipts.java` | Sends the `payment-receipt` mail after commit; the receipt DTO. |
| `box/StripeCheckoutService.java` | Builds a Checkout Session on the box's key; resolves the box for a webhook event. |
| `box/SubscriptionController.java` | `/api/box/subscriptions` (admin record) + `/checkout` (athlete) + `/api/box/me/subscription` (athlete's own). |
| `box/StripeWebhookController.java` | `POST /api/stripe/webhook` (permitAll, signature-verified, idempotent). |
| `box/BoxStripeController.java` | `GET/PUT /api/box/stripe` (connect/status, admin). |
| `box/SubscriptionLapseJob.java` | Nightly ACTIVE→EXPIRED + lapse mail. |
| `box/ReceiptController.java` | `GET /api/box/receipts/{paymentId}` → receipt DTO (member-visible, tenant-scoped). |

**Backend — modified:** `box/Plan.java` (+price/currency/entitlement), `box/PlanController.java` (expose them), `box/BookingService.java` (entitlement check replaces weeklyLimitReached), `identity/Membership.java` (drop planId), `box/InvitePublicController.java` (accept → subscription), `shared/SecurityConfig.java` (+/api/stripe/webhook permitAll), `shared/DevDataSeeder.java`, `pom.xml`, `docker/docker-compose.yml` (`BOXHUB_STRIPE_ENC_KEY` dev default).

**Backend — resources:** `db/migration/V14__memberships_payments.sql`, `templates/mail/payment-receipt.html`, `templates/mail/subscription-lapsed.html`.

**Frontend — new:** `features/admin/plans.page.ts` gains price/entitlement (or is created if absent — check), `features/admin/subscriptions.page.ts` (record a payment / list a member's subscription), `features/admin/box-stripe.page.ts` (connect Stripe), `features/athlete/membership.page.ts` (my subscription + Subscribe button), `features/receipt/receipt.page.ts`.
**Frontend — modified:** admin shell nav, athlete profile/home entry to membership, `core/auth` models if subscription status surfaces.

**E2E:** `e2e/tests/memberships.spec.ts`.

---

### Task 1: V14 schema + Plan pricing + entities + grandfather migration

**Files:**
- Create: `backend/src/main/resources/db/migration/V14__memberships_payments.sql`
- Create: `backend/src/main/java/com/boxhub/box/Subscription.java`, `SubscriptionRepository.java`, `Payment.java`, `PaymentRepository.java`, `BoxStripe.java`, `BoxStripeRepository.java`
- Modify: `backend/src/main/java/com/boxhub/box/Plan.java`, `identity/Membership.java`
- Test: `backend/src/test/java/com/boxhub/box/MembershipSchemaTest.java`, `MigrationGrandfatherTest.java`

**Interfaces:**
- Produces: `Plan.getPriceCents()/setPriceCents(int)`, `getCurrency()/setCurrency(String)`, `getEntitlement()/setEntitlement(String)` (`UNLIMITED`|`WEEKLY_LIMIT`).
- Produces: `Subscription` with `getId`, `getMembershipId`, `getPlanId`, `getStatus`/`setStatus` (`ACTIVE`|`PAST_DUE`|`EXPIRED`|`CANCELED`), `getPriceCents`/`setPriceCents`, `getPriceNote`/`setPriceNote`, `getCurrentPeriodStart`/`set`, `getCurrentPeriodEnd`/`set` (nullable Instant = grandfathered).
- Produces: `SubscriptionRepository.findActiveByMembershipId(UUID)` (native or derived — Subscription IS @TenantId so a box-scoped derived query is correct here; the webhook path in Task 5 needs a native tenant-agnostic lookup, added there), `findByStatusAndCurrentPeriodEndBefore(String, Instant)`.
- Produces: `Payment` with `getId`, `getSubscriptionId`, `getAmountCents`, `getCurrency`, `getMethod` (`STRIPE`|`CASH`|`TRANSFER`|`CARD`|`OTHER`), `getStatus` (`SUCCEEDED`|`PENDING`), `getStripeSessionId`, `getRecordedBy`, `getReference`, `getCreatedAt`. `PaymentRepository.findByStripeSessionId(String)`.
- Produces: `BoxStripe` with `getBoxId`, `getRestrictedKeyEnc`/`set`, `getWebhookSecretEnc`/`set`, `isEnabled`/`set`. `BoxStripeRepository.findByBoxId(UUID)`.
- Produces: `Membership.getPlanId()` is REMOVED (compile breakage in BookingService + InvitePublicController is fixed in Tasks 4 & 6 — see Step 6 note).

- [ ] **Step 1: Write the migration**

Create `backend/src/main/resources/db/migration/V14__memberships_payments.sql`:

```sql
-- M10: memberships become priced subscriptions with payments.

alter table plans add column price_cents  int  not null default 0;
alter table plans add column currency     text not null default 'eur';
alter table plans add column entitlement  text not null default 'UNLIMITED'
    check (entitlement in ('UNLIMITED', 'WEEKLY_LIMIT'));
-- A plan that already had a weekly limit is a WEEKLY_LIMIT plan; the rest are unlimited.
update plans set entitlement = 'WEEKLY_LIMIT' where weekly_class_limit is not null;

create table subscription (
    id                    uuid primary key default gen_random_uuid(),
    box_id                uuid not null,
    membership_id         uuid not null references memberships (id) on delete cascade,
    plan_id               uuid not null references plans (id),
    status                text not null check (status in ('ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELED')),
    price_cents           int  not null,
    price_note            text,
    current_period_start  timestamptz not null default now(),
    current_period_end    timestamptz,          -- null = grandfathered, no expiry
    created_at            timestamptz not null default now()
);
create index idx_subscription_membership on subscription (membership_id);
create index idx_subscription_box on subscription (box_id);
-- at most one ACTIVE subscription per membership
create unique index uq_subscription_active on subscription (membership_id) where status = 'ACTIVE';
create index idx_subscription_sweep on subscription (status, current_period_end);

create table payment (
    id                uuid primary key default gen_random_uuid(),
    box_id            uuid not null,
    subscription_id   uuid not null references subscription (id) on delete cascade,
    amount_cents      int  not null,
    currency          text not null,
    method            text not null check (method in ('STRIPE', 'CASH', 'TRANSFER', 'CARD', 'OTHER')),
    status            text not null check (status in ('SUCCEEDED', 'PENDING')),
    stripe_session_id text unique,
    recorded_by       uuid references memberships (id),
    reference         text,
    created_at        timestamptz not null default now()
);
create index idx_payment_subscription on payment (subscription_id);
create index idx_payment_box on payment (box_id);

create table box_stripe (
    box_id             uuid primary key references boxes (id) on delete cascade,
    restricted_key_enc text not null,
    webhook_secret_enc text not null,
    enabled            boolean not null default true
);

-- Grandfather every existing membership into a no-expiry ACTIVE subscription so nobody loses
-- booking on deploy. Members with a plan keep it; members without get a synthetic UNLIMITED
-- default plan (created once per box) so the entitlement check has something to read.
insert into plans (id, box_id, name, duration_days, weekly_class_limit, archived, price_cents, currency, entitlement)
select gen_random_uuid(), b.id, 'Grandfathered', 30, null, true, 0, 'eur', 'UNLIMITED'
from boxes b
where exists (select 1 from memberships m where m.box_id = b.id and m.plan_id is null);

insert into subscription (box_id, membership_id, plan_id, status, price_cents, current_period_end)
select m.box_id, m.id,
       coalesce(m.plan_id, (select p.id from plans p where p.box_id = m.box_id and p.name = 'Grandfathered' limit 1)),
       'ACTIVE', 0, null
from memberships m;

alter table memberships drop column plan_id;
```

- [ ] **Step 2: Write the failing tests**

`MembershipSchemaTest.java` — asserts the entities persist and the new columns exist. `MigrationGrandfatherTest.java` — the load-bearing one: asserts that after migration, EVERY seeded membership has exactly one ACTIVE subscription with a null period end. Since Flyway runs V14 at context start, this test just queries the post-migration state:

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.MembershipRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class MigrationGrandfatherTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void everyMembershipHasExactlyOneGrandfatheredActiveSubscription() {
        // Native SQL: subscription is @TenantId, and this assertion is deliberately platform-wide.
        Integer memberships = jdbc.queryForObject("select count(*) from memberships", Integer.class);
        Integer grandfathered = jdbc.queryForObject(
                "select count(*) from subscription where status = 'ACTIVE' and current_period_end is null", Integer.class);
        assertThat(grandfathered).isEqualTo(memberships);

        // no membership has two active subscriptions (the partial unique index guarantees it, but pin it)
        Integer dupes = jdbc.queryForObject(
                "select count(*) from (select membership_id from subscription where status='ACTIVE' " +
                "group by membership_id having count(*) > 1) x", Integer.class);
        assertThat(dupes).isZero();
    }
}
```

`MembershipSchemaTest` covers a Plan round-trip with price/entitlement, a Subscription save + `findActiveByMembershipId`, a Payment save + `findByStripeSessionId`, and a BoxStripe save + `findByBoxId`. Follow `OnboardingSchemaTest` (M9 T1) for fixture style.

- [ ] **Step 3: Run and watch fail** — `mvn test -Dtest=MembershipSchemaTest,MigrationGrandfatherTest` → FAIL (types missing).

- [ ] **Step 4: Add Plan columns** — add the three fields + accessors to `Plan.java` (plain JPA, keep existing).

- [ ] **Step 5: Create the four new entity pairs** — `Subscription`/`Payment`/`BoxStripe` entities + repositories per the Interfaces block. `Subscription` and `Payment` carry `@TenantId private UUID boxId;` exactly as `Plan` does (copy Plan's `@TenantId` field). `BoxStripe` does NOT — plain `@Id UUID boxId`.

`SubscriptionRepository`:
```java
package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {
    Optional<Subscription> findByMembershipIdAndStatus(UUID membershipId, String status);
    List<Subscription> findByStatusAndCurrentPeriodEndBefore(String status, Instant cutoff);
}
```
(`findByMembershipIdAndStatus(id, "ACTIVE")` is the active-subscription lookup for booking; Subscription is @TenantId so it's correctly box-scoped for the in-box callers. The webhook's tenant-less lookup is added natively in Task 5.)

- [ ] **Step 6: Drop Membership.planId**

Remove the `planId` field + `getPlanId`/`setPlanId` from `Membership.java`. This BREAKS `BookingService.weeklyLimitReached` (line ~143) and `InvitePublicController.accept` (line ~75) — they will not compile. **Do not fix them here** with real logic; add the minimal mechanical bridge so the module compiles and this task's tests run, clearly marked, to be replaced in Tasks 4 (booking) and 6 (invite):

- `BookingService.weeklyLimitReached`: replace the `membership.getPlanId()` branch with `return false; // M10 T1 bridge — Task 4 replaces with the entitlement check`.
- `InvitePublicController.accept`: delete the `m.setPlanId(plan.getId())` line and its surrounding plan lookup `// M10 T1 bridge — Task 6 creates a subscription on accept`.

Note both bridges in the report. Full suite must compile and be green (the bridges make booking temporarily limit-free and invites plan-free — the existing tests that asserted the weekly limit will be re-greened in Task 4; if any go red now, mark them `@Disabled("M10 T4 restores the entitlement check")` with a comment and re-enable them in Task 4).

- [ ] **Step 7: Run tests + full suite** — new tests pass; full suite green (with any weekly-limit tests disabled-pending-T4 as noted).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/resources/db/migration/V14__memberships_payments.sql backend/src/main/java/com/boxhub/ backend/src/test/java/com/boxhub/box/MembershipSchemaTest.java backend/src/test/java/com/boxhub/box/MigrationGrandfatherTest.java
git commit -m "$(cat <<'EOF'
feat(m10): V14 — subscriptions, payments, box Stripe creds, grandfather migration

Plans gain a list price + entitlement; subscription/payment/box_stripe
tables arrive. Every existing membership is grandfathered into a no-expiry
ACTIVE subscription and membership.plan_id is dropped, so booking rights
survive the deploy. BookingService and invite-accept carry marked bridges
that Tasks 4 and 6 replace.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: CryptoService + BoxStripe connect endpoint

**Files:**
- Create: `backend/src/main/java/com/boxhub/shared/CryptoService.java`, `box/BoxStripeController.java`
- Modify: `backend/src/main/resources/application.yml`, `docker/docker-compose.yml`
- Test: `backend/src/test/java/com/boxhub/shared/CryptoServiceTest.java`, `box/BoxStripeApiTest.java`

**Interfaces:**
- Produces: `CryptoService.encrypt(String plaintext)` → String (base64 `iv:ciphertext`), `decrypt(String)` → String. AES-GCM, 256-bit key from `BOXHUB_STRIPE_ENC_KEY`.
- Produces: `BoxStripeController` — `PUT /api/box/stripe {restrictedKey, webhookSecret}` (BOX_ADMIN) → 204, stores encrypted; `GET /api/box/stripe` → `{connected: boolean}` (never the key). `DELETE /api/box/stripe` → 204 (disconnect).

- [ ] **Step 1: Write CryptoServiceTest** — round-trip (encrypt then decrypt == original); two encryptions of the same plaintext differ (random IV); a tampered ciphertext throws (GCM auth tag). Provide `BOXHUB_STRIPE_ENC_KEY` via `@TestPropertySource` (a fixed 32-byte base64 test key).

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement `CryptoService`**

```java
package com.boxhub.shared;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Base64;

/** AES-GCM at rest for the box's Stripe credentials. The only place that touches the master key. */
@Service
public class CryptoService {

    private static final int IV_LEN = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public CryptoService(@Value("${boxhub.stripe.enc-key}") String base64Key) {
        byte[] k = Base64.getDecoder().decode(base64Key);
        if (k.length != 32) throw new IllegalStateException("BOXHUB_STRIPE_ENC_KEY must be 32 bytes (base64)");
        this.key = new SecretKeySpec(k, "AES");
    }

    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[IV_LEN];
            random.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ct = c.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + ct.length).put(iv).put(ct).array());
        } catch (Exception e) {
            throw new IllegalStateException("encrypt failed", e); // never log plaintext
        }
    }

    public String decrypt(String stored) {
        try {
            byte[] all = Base64.getDecoder().decode(stored);
            byte[] iv = java.util.Arrays.copyOfRange(all, 0, IV_LEN);
            byte[] ct = java.util.Arrays.copyOfRange(all, IV_LEN, all.length);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(c.doFinal(ct), java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("decrypt failed", e);
        }
    }
}
```

`application.yml`: `boxhub.stripe.enc-key: ${BOXHUB_STRIPE_ENC_KEY:}` and a dev/test default. `AbstractIntegrationTest` `@TestPropertySource` gets a real 32-byte base64 key so the bean constructs. `docker-compose.yml` backend env: `BOXHUB_STRIPE_ENC_KEY: ${BOXHUB_STRIPE_ENC_KEY:-<a-32-byte-base64-dev-key>}`.

- [ ] **Step 4: BoxStripeApiTest** — PUT stores (assert the DB row holds ciphertext ≠ the plaintext key, and `CryptoService.decrypt` of it == the key); GET returns `{connected:true}` and the response body NEVER contains the key material (assert the raw JSON doesn't contain the test key string); role-denied (ATHLETE box token → 403); cross-tenant (box B's admin can't read box A's — but BoxStripe is not @TenantId, so the controller must scope by `TenantContext.requireBoxId()` explicitly — test it).

- [ ] **Step 5: Implement `BoxStripeController`** — uses `CryptoService` + `BoxStripeRepository`, scopes by `TenantContext.requireBoxId()`, `RoleGuard.requireBoxAdmin()`.

- [ ] **Step 6: Run tests + suite green. Commit** `feat(m10): encrypted per-box Stripe credentials + connect endpoint`.

---

### Task 3: SubscriptionService — create-or-extend, agreed price, single-active invariant

**Files:**
- Create: `backend/src/main/java/com/boxhub/box/SubscriptionService.java`
- Test: `backend/src/test/java/com/boxhub/box/SubscriptionServiceTest.java`

**Interfaces:**
- Consumes: Task 1 repos.
- Produces: `SubscriptionService.recordPeriod(UUID membershipId, UUID planId, int priceCents, String priceNote)` → `Subscription` — create-or-extend: if an ACTIVE subscription for the SAME plan exists, extend `current_period_end` by the plan's `duration_days` from `max(now, currentEnd)`; else if an ACTIVE subscription for a DIFFERENT plan exists, throw 409 `SWITCH_REQUIRES_CANCEL`; else create a new ACTIVE subscription starting now with end = now + duration. Sets `price_cents` = priceCents.
- Produces: `SubscriptionService.cancel(UUID subscriptionId)` → sets CANCELED (frees the active slot).
- Produces: `SubscriptionService.activeFor(UUID membershipId)` → `Optional<Subscription>` (ACTIVE and, if end non-null, end in the future).

- [ ] **Step 1: Write SubscriptionServiceTest** — new subscription sets end = now+duration; a second recordPeriod for the same plan extends by another duration (end moves forward one period from the prior end, not from now); recordPeriod for a different plan while one is active → 409 SWITCH_REQUIRES_CANCEL; after cancel, a new plan can be recorded; extend-from-lapsed (end in the past) starts fresh from now, not the stale end. Grandfathered (end null) + recordPeriod → sets a concrete end = now+duration (first real payment ends the grandfather).

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement `SubscriptionService`** — `@Transactional`. Read the plan (its `duration_days`). Compute the new end. Enforce the single-active invariant in code (the partial unique index is the backstop; catch its DIVE and translate to 409 for the concurrent case, GoogleLinkTx-style if a race test warrants — but the same-membership case is serialized by the athlete, so a plain check + index backstop is enough; note the choice).

- [ ] **Step 4: Run tests, suite green. Commit** `feat(m10): subscription create-or-extend with the single-active invariant`.

---

### Task 4: Booking entitlement check

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/BookingService.java`
- Test: `backend/src/test/java/com/boxhub/box/BookingEntitlementTest.java` (+ re-enable any T1-disabled weekly-limit tests)

**Interfaces:**
- Consumes: `SubscriptionService.activeFor` (T3), `PlanRepository`.
- Produces: booking a class with no active subscription → 409/403 `NO_ACTIVE_SUBSCRIPTION`; UNLIMITED active → allowed; WEEKLY_LIMIT active → the existing Mon–Sun count vs `plan.weekly_class_limit`; grandfathered (null end) → allowed.

- [ ] **Step 1: Write BookingEntitlementTest** — four cases above, using the booking API. A member with no active subscription cannot book. A WEEKLY_LIMIT member at the cap gets `LIMIT_REACHED` (existing code) but UNDER the cap with an active sub books fine. A grandfathered member books. Build fixtures via `SubscriptionService.recordPeriod` / a directly-saved grandfathered subscription.

- [ ] **Step 2: Run, fail** (the T1 bridge returns false / no entitlement gate).

- [ ] **Step 3: Replace the bridge** — `weeklyLimitReached` becomes `entitlementBlocked(session, box, membershipId)`:
```
active = subscriptions.findByMembershipIdAndStatus(membershipId, "ACTIVE") filtered to (end null OR end > now)
if empty → throw conflict("NO_ACTIVE_SUBSCRIPTION")
plan = plans.findById(active.planId)
if plan.entitlement == "UNLIMITED" → return false
// WEEKLY_LIMIT: existing Mon–Sun count vs plan.weekly_class_limit (keep the tz logic verbatim)
```
Keep the existing `conflict(...)` helper and the `LIMIT_REACHED` code. Add `NO_ACTIVE_SUBSCRIPTION`. Re-enable the T1-disabled tests.

- [ ] **Step 4: Run tests + full suite green. Commit** `feat(m10): booking follows the active subscription's entitlement`.

---

### Task 5: Stripe checkout + webhook

**Files:**
- Create: `backend/src/main/java/com/boxhub/box/StripeCheckoutService.java`, `box/StripeWebhookController.java`, and add a native tenant-agnostic finder
- Modify: `backend/pom.xml` (stripe-java), `shared/SecurityConfig.java`, `shared/CookieBearerTokenResolver.java`
- Test: `backend/src/test/java/com/boxhub/box/StripeWebhookTest.java`

**Interfaces:**
- Consumes: `StripeKeys`/`CryptoService` (T2), `SubscriptionService` (T3), `PaymentReceipts` (T7 — for now the webhook creates the payment/subscription; the receipt mail wire lands in T7, leave a `// T7 wires the receipt mail` seam).
- Produces: `StripeCheckoutService.createSession(UUID membershipId, UUID planId)` → hosted URL, using the box's decrypted restricted key; creates a PENDING `payment` with the session id and metadata `{boxId, membershipId, planId, paymentId}`.
- Produces: `POST /api/stripe/webhook` — permitAll, reads the raw body + `Stripe-Signature`, resolves the box from the event's session metadata, verifies the signature against THAT box's decrypted webhook secret, on `checkout.session.completed` marks the payment SUCCEEDED + `SubscriptionService.recordPeriod` at the plan's list price. Idempotent on `stripe_session_id` (already SUCCEEDED → 200 no-op). Bad signature → 400.

**Native tenant-agnostic lookup (gotcha #1):** the webhook runs with no tenant. To load the PENDING payment by `stripe_session_id` across boxes, `PaymentRepository.findByStripeSessionId` must be `@Query(nativeQuery = true)` (Payment is @TenantId; a derived query filters to the root tenant and finds nothing). Same for reading the subscription/plan/box_stripe inside the webhook — use native SQL or resolve the box first and run under a tenant scope (`runAsBox`, the SessionGenerator pattern). **Simplest correct approach: parse metadata.boxId from the event, then do all the @TenantId work inside `runAsBox(boxId, () -> ...)`** so the discriminator is set — mirror `TvStreamService.runAsBox`. Use that; document it.

- [ ] **Step 1: Add stripe-java to pom** (`com.stripe:stripe-java`, a recent version). `mvn -q compile` to fetch.

- [ ] **Step 2: Write StripeWebhookTest** — the security-critical one. Construct a signed event with Stripe's test helper (`com.stripe.net.Webhook.Util` / build the payload + `t=...,v1=...` header with a known secret) OR mock `Webhook.constructEvent`. Cases: valid signature + `checkout.session.completed` for a PENDING payment → payment SUCCEEDED + subscription ACTIVE with a period end; replayed same event → still 200, no double-extend (idempotent); forged/mismatched signature → 400, nothing changes; unknown session id → 200 no-op (don't leak). Seed the box's webhook secret via `CryptoService.encrypt`. This test must NOT hit the real Stripe network.

- [ ] **Step 3: Run, fail.**

- [ ] **Step 4: Implement** `StripeCheckoutService` + `StripeWebhookController`. Webhook: `/api/stripe/webhook` in SecurityConfig permitAll; NOT in PUBLIC_AUTH_PATHS (it's not /api/auth); it reads the raw body (`@RequestBody byte[]` or an `HttpServletRequest` input stream — Stripe signature verification needs the exact bytes). CSRF: the webhook is a bearer-less external POST — it must be CSRF-exempt. It has no Authorization header and no cookie, so the M8 CSRF matcher (`no Authorization header → require CSRF`) WOULD demand a token. Add `/api/stripe/webhook` to the CSRF-exempt set (like `/api/tv/pair` was) — verify the M8 `csrfRequired` matcher and add it there. Document this.

- [ ] **Step 5: Run tests + suite green. Commit** `feat(m10): Stripe checkout session + signature-verified idempotent webhook`.

---

### Task 6: Subscription endpoints + invite accept + receipts + lapse job + emails

**Files:**
- Create: `backend/src/main/java/com/boxhub/box/SubscriptionController.java`, `box/ReceiptController.java`, `box/PaymentReceipts.java`, `box/SubscriptionLapseJob.java`
- Create: `backend/src/main/resources/templates/mail/payment-receipt.html`, `subscription-lapsed.html`
- Modify: `backend/src/main/java/com/boxhub/box/InvitePublicController.java`, `box/StripeWebhookController.java` (wire the receipt mail)
- Test: `backend/src/test/java/com/boxhub/box/SubscriptionApiTest.java`, `SubscriptionLapseTest.java`, `InviteSubscriptionTest.java`

**Interfaces:**
- Produces: `POST /api/box/subscriptions {membershipId, planId, method, priceCents, priceNote?, reference?}` (BOX_ADMIN, method ∈ CASH/TRANSFER/CARD/OTHER — STRIPE rejected here, it goes through checkout) → records the period + a Payment + receipt mail, returns the subscription. `POST /api/box/subscriptions/checkout {planId}` (athlete, own membership) → the Stripe URL (403 if the box has no Stripe). `GET /api/box/me/subscription` → the caller's active subscription + plan (or null).
- Produces: `GET /api/box/receipts/{paymentId}` → receipt DTO (amount, method, plan name, period, list price, discount, box name) — member-visible, tenant-scoped, the payer or an admin only.
- Produces: `PaymentReceipts.sendReceipt(Payment, Subscription, Plan)` — the `payment-receipt` mail, called AFTER commit (both rails).
- Produces: invite accept creates an ACTIVE subscription for the invite's plan (grandfathered-style: if the plan is free/price 0, end = now+duration; a paid plan still creates the subscription so the member can book — the box collects payment separately). Document the choice: accept = a subscription at the plan's list price, method-less (no Payment row until they actually pay) OR a zero Payment — decide and note; simplest: create the subscription, NO payment row (they haven't paid yet), status ACTIVE with a period end so booking works and the lapse job will chase them. Confirm with the entitlement check (active + end future → books).

- [ ] **Step 1: Write the three tests** — SubscriptionApiTest (admin records CASH below list price → subscription at agreed price + Payment CASH + receipt mail sent; STRIPE method rejected 400; athlete checkout with no box Stripe → 403; role-denied + cross-tenant on the admin endpoint; GET /api/box/me/subscription returns the caller's). SubscriptionLapseTest (a subscription with end in the past + ACTIVE → job flips to EXPIRED + lapse mail; grandfathered null-end skipped; already-EXPIRED skipped). InviteSubscriptionTest (accept an invite with a plan → the new membership has an ACTIVE subscription and can book).

- [ ] **Step 2: Run, fail.**

- [ ] **Step 3: Implement** the controllers, `PaymentReceipts`, `SubscriptionLapseJob` (`@Scheduled(cron=...)`, native or box-scoped sweep — `findByStatusAndCurrentPeriodEndBefore("ACTIVE", now)` is @TenantId-filtered, so the job must run tenant-agnostically: use a native query OR iterate boxes under `runAsBox`; the sweep is cross-box by nature — use native SQL to find due subscriptions, then mail per row). Mail templates copy `verify.html` structure. Replace the T1 invite bridge. Wire the T5 webhook's receipt seam to `PaymentReceipts.sendReceipt`.

- [ ] **Step 4: Run tests + full suite green. Commit** `feat(m10): subscription APIs, invite-accept subscription, receipts, lapse job`.

---

### Task 7: Frontend — plans pricing, record payment, connect Stripe, my membership, receipt

**Files:**
- Modify/Create: `frontend/src/app/features/admin/plans.page.ts` (price/currency/entitlement fields), `features/admin/subscriptions.page.ts`, `features/admin/box-stripe.page.ts`, `features/athlete/membership.page.ts`, `features/receipt/receipt.page.ts`; routes + shell entries
- Test: specs beside each

**Interfaces:** consumes every Task 2/5/6 endpoint. Athlete membership page: shows the active subscription (plan, price, period end, status) + a Subscribe button that hits `/checkout` and redirects to the returned Stripe URL (only shown if the box has Stripe connected — a `GET /api/box/me/subscription` or a stripe-status probe drives it). Admin subscriptions page: pick member + plan + method + agreed price (pre-filled from plan list price, editable) + note → record; shows the member's current subscription. box-stripe page: paste restricted key + webhook secret, shows `{connected}`. Receipt page: renders the receipt DTO printably (a print button = `window.print()`).

- [ ] Standard TDD-ish FE loop per page (design law: states, tokens, a11y, error mapping — `NO_ACTIVE_SUBSCRIPTION`, `SWITCH_REQUIRES_CANCEL`, `403 no Stripe` → friendly copy; money rendered from cents as `€xx.xx`). Specs assert the branch behaviours (record-payment body incl. priceCents; discount shown when agreed < list; Subscribe hidden when no box Stripe). Gate green, build green. Commit `feat(m10): membership + payment frontend — plans, record-payment, Stripe connect, receipt`.

---

### Task 8: E2E, docs, final review, merge

**Files:** Create `e2e/tests/memberships.spec.ts`; modify `docs/HANDOFF.md`, `docs/BACKLOG.md`, `.superpowers/sdd/progress.md`.

- [ ] **Step 1: E2E** (fresh stack, `down -v`): admin publishes a priced plan → admin records a CASH subscription for an athlete at a discounted price → athlete books a class (entitlement passes) → the receipt page renders with the amount + discount. (Stripe Checkout's hosted redirect isn't drivable against real Stripe in Playwright — the webhook is covered at the API level in T5; the e2e proves the admin/offline rail end to end.) Report real numbers; BLOCKED with the exact error if a genuine bug surfaces.

- [ ] **Step 2: Docs** — HANDOFF M10 bullet (subscriptions, negotiated price, Stripe optional rail + admin-recorded methods, entitlement→booking, grandfather migration; Flyway V14); test counts; dev note (`BOXHUB_STRIPE_ENC_KEY`, and a box needs a real Stripe restricted key to exercise the online rail — the demo runs on admin-recorded payments); next Flyway V15; "Immediate next step" → M11 security hardening. Update `.superpowers/sdd/progress.md`.

- [ ] **Step 3: Final whole-branch review** (most-capable model) — cross-cutting focus: the entitlement gate now sits in the booking hot path (does any booking test bypass it? does the grandfather migration truly cover every member?); the webhook's tenant-agnostic + signature-verification correctness; money-as-cents everywhere (no float leaked into a DTO); no Stripe key in any response/log. Fix Critical/Important. Then `superpowers:finishing-a-development-branch` — merge to main, re-verify backend on merged main, push.

---

## Self-review (folded in)

**Spec coverage:** §1 model → T1. §2 Stripe crypto → T2. §3 plan publishing → T1 (columns) + T7 (UI). §4 Stripe self-serve → T5 + T7. §5 admin record payment → T6 + T7. §6 entitlements→booking → T4. §7 lapse job + emails → T6. §8 migration → T1, testing spread across all + T8.

**Hazards pre-adjudicated (executors: do not re-litigate):**
- `Membership.planId` drop breaks two files; T1 installs marked bridges, T4/T6 replace them; weekly-limit tests that go red at T1 are `@Disabled("M10 T4")` and re-enabled in T4.
- The Stripe webhook is tenant-less on a `@TenantId` domain — resolve the box from `metadata.boxId` and do all @TenantId work inside `runAsBox(boxId, …)` (TvStreamService pattern); `findByStripeSessionId` native. This is gotcha #1 and the #1 review focus for T5.
- The webhook needs CSRF exemption (bearer-less external POST) — add `/api/stripe/webhook` to the M8 `csrfRequired` exemption set, same as `/api/tv/pair`.
- Invite accept creates a subscription with NO payment row (the member hasn't paid yet) — active with a period end so they can book and the lapse job chases them. A price-0/free plan is just a subscription at price 0.
- Money is integer cents everywhere; render `€xx.xx` only at the FE edge.
- Stripe is optional and severable: if T5 gets hairy, T1–T4 + T6 (admin rail) + T7 minus the Subscribe button are a complete shippable membership system — the orchestrator may land that and fast-follow Stripe without rework.

**Consistency:** `recordPeriod(membershipId, planId, priceCents, priceNote)` / `activeFor` / `findByMembershipIdAndStatus` / `findByStripeSessionId` / `NO_ACTIVE_SUBSCRIPTION` / `SWITCH_REQUIRES_CANCEL` used identically across T3/T4/T5/T6. `entitlement` values `UNLIMITED`/`WEEKLY_LIMIT`; `method` `STRIPE|CASH|TRANSFER|CARD|OTHER`; `status` `ACTIVE|PAST_DUE|EXPIRED|CANCELED` consistent.
