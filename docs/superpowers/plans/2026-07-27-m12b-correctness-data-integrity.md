# M12b — Correctness & Data Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close ten small, invisible correctness defects — plus one Flyway migration — before the UX rework touches these screens.

**Architecture:** Mostly backend. One migration (V16) carrying two changes, a comp-subscription path that reuses V14's synthetic-plan precedent, a snapshotted list price on Payment, one new webhook branch, three validation guards, and one repository interface narrowed so append-only is enforced by the type instead of a comment.

**Tech Stack:** Spring Boot 3.5.16 / Java 21, Flyway V16, Postgres 16, JUnit 5 + MockMvc + Testcontainers, Angular 19 (minimal edge changes only).

**Spec:** `docs/superpowers/specs/2026-07-27-m12b-correctness-data-integrity-design.md` — read before Task 1.

## Global Constraints

- `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` before every backend `mvn`. **`rm -rf backend/target` before EVERY backend mvn run** — the repo is on an iCloud-synced Desktop and conflict-copy `.class` files make classpath scanning take 10+ minutes and look like a hang.
- **Flyway V16 only, and only Task 1 creates it.** Never edit an applied migration (V1–V15).
- **Every fix ships with a test that FAILS against the current code.** Write the test first, watch it fail, then fix. M12a exists so that a green test means something — do not weaken that here.
- **Mail fires strictly AFTER commit; an audit row is written strictly INSIDE the transaction.** Both rules are load-bearing (`docs/HANDOFF.md`, `CLAUDE.md`).
- **Tenancy (binding):** resolve tenant only from `TenantContext`. `@TenantId` entities (`Plan`, `Subscription`, `Payment`, `Invite`) are silently filtered to the caller's box; any query that must be tenant-agnostic MUST be native SQL. See `docs/TENANCY.md`.
- **`AuthzConformanceTest` is the milestone-spanning authz guarantee.** This milestone adds **no new routes**, so it should need no edit. If you believe it does, STOP and report — the orchestrator audits every change to it.
- Never pipe a gate through `grep`/`tail` (the pipe buffers and a working run looks dead). Never kill a stalled-looking run. macOS has no `timeout` binary.
- Baseline: backend **394** tests / 0 failures / 0 skips; e2e **26** at `retries: 0`.
- Conventional commits ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Repo orientation rule (binding):** run `graphify query "<question>"` before exploring/grepping; direct reads of files you are about to modify are allowed. Include this rule in every subagent prompt.
- **Verify before you trust this plan.** Where a step says "read and confirm", the plan is stating a contract, not quoting verified code — four briefs in M12a asserted specifics that turned out wrong, and every executor that stopped to check was right to.

## File Structure

**Create:** `backend/src/main/resources/db/migration/V16__drop_membership_expiry_add_payment_list_price.sql` · `backend/src/test/java/com/boxhub/box/CompSubscriptionTest.java`

**Modify:** `box/Payment.java` · `identity/Membership.java` · `box/BoxSignupTx.java` (or wherever the owner membership is created) · the invite-accept transaction · `box/ReceiptController.java` · `box/PaymentReceipts.java` + its Thymeleaf template · `box/StripeWebhookController.java` · `box/MemberController.java` · `box/BoxController.java` · `box/SessionController.java` · `box/SuperadminAuditRepository.java` · `frontend/.../receipt.page.ts` (minimal) · `docs/BACKLOG.md`, `docs/HANDOFF.md`

---

### Task 1: Flyway V16 — drop the dead column, add the snapshot column

**Files:** Create the migration; modify `identity/Membership.java`, `box/Payment.java`

**Interfaces:** Produces `Payment.getListPriceCents(): Integer` (nullable — null means "not recorded", pre-M12b).

- [ ] **Step 1: Write the migration**

```sql
-- M12b. Two changes, both overdue.
--
-- 1. memberships.expires_at has had no writer since M10 moved expiry to
--    subscription.current_period_end. All three reading surfaces were repointed then; the column
--    survived only because dropping it needed a migration and M10 was V14-only.
-- 2. payment.list_price_cents snapshots what the plan cost AT THE TIME OF PAYMENT. Receipts
--    currently compute the discount against the plan's CURRENT price, so re-opening an old receipt
--    after a price change shows a discount that was never given. Nullable on purpose: rows that
--    predate this genuinely have no recorded list price, and the receipt omits the discount line
--    rather than inventing one.
alter table memberships drop column expires_at;
alter table payment add column list_price_cents int;
```

- [ ] **Step 2: Update the entities**

Remove the `expiresAt` field and its accessors from `identity/Membership.java`. **Read the file first and confirm nothing still references them** — the M10 review claimed all readers were repointed, but verify rather than trust it; the compiler will also tell you.

In `box/Payment.java`, after `reference` (line ~23), add:

```java
    /** What the plan's list price was WHEN THIS PAYMENT WAS TAKEN. Null for rows created before
     *  M12b — the receipt omits the discount line rather than computing one against today's price. */
    @Column(name = "list_price_cents") private Integer listPriceCents;
```

with a getter and setter matching the file's existing accessor style. **`Integer`, not `int`** — null is a meaningful state here.

- [ ] **Step 3: Verify the migration applies and nothing broke**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: green, 394 tests. `MigrationTest` should confirm V16 applied — if that test enumerates expected columns, update it for both changes.

- [ ] **Step 4: Commit** — `feat(m12b): V16 drops the dead membership expiry, adds the payment list-price snapshot`

---

### Task 2: Comp subscriptions — the owner, and the plan-less invite

**Files:** Modify `box/BoxSignupTx.java` and the invite-accept transaction. Create `backend/src/test/java/com/boxhub/box/CompSubscriptionTest.java`

**Interfaces:** Produces a per-box synthetic plan named `Comped` (`archived = true`, `priceCents = 0`, `entitlement = UNLIMITED`), created lazily, and an ACTIVE no-expiry subscription on it.

**The constraint that shapes this task:** `subscription.plan_id` is **NOT NULL with an FK to `plans`** (V14 line 14), so a plan-less subscription is impossible. V14 solved the identical problem for grandfathering by creating a per-box synthetic plan — read `V14__*.sql` lines 51–63 before writing anything; that is the precedent you are following.

- [ ] **Step 1: Write the failing tests**

```java
    @Test
    void aSelfServeOwnerCanBookTheirOwnClasses() throws Exception {
        // The requirement is BOOKING, not the existence of a row. A test that only asserts a
        // subscription exists would pass against an implementation that creates one the
        // entitlement gate rejects.
        // 1. sign up a box through POST /api/auth/signup-box
        // 2. verify + log in as the owner, mint a box token
        // 3. create a class session the owner can book (reuse the fixture helpers in
        //    BookingEntitlementTest — read it and follow its setup exactly)
        // 4. POST /api/box/sessions/{id}/book as the owner
        // assert: 200/201, NOT 409 NO_ACTIVE_SUBSCRIPTION
    }

    @Test
    void aMemberInvitedWithNoPlanCanBook() throws Exception {
        // Same assertion for the other uncovered route: an invite created with no plan, accepted,
        // then a booking attempt. Fails today with 409 NO_ACTIVE_SUBSCRIPTION.
    }

    @Test
    void theCompedPlanIsArchivedSoItNeverShowsInThePlansList() throws Exception {
        // archived=true is what keeps the synthetic plan out of the admin's plans UI — the same
        // reason V14 archived 'Grandfathered'. Assert GET /api/box/plans does not contain it.
    }
```

Fill in the bodies following `BookingEntitlementTest`'s existing fixture helpers — **read that file first**; it already builds boxes, memberships, sessions and subscriptions, and duplicating its setup differently will diverge.

- [ ] **Step 2: Run, expect FAIL** with `409 NO_ACTIVE_SUBSCRIPTION` on the first two.

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=CompSubscriptionTest
```

- [ ] **Step 3: Implement the shared helper**

Add one method — put it in `SubscriptionService` alongside `recordPeriod`, since that is where subscription creation already lives:

```java
    /**
     * An ACTIVE, no-expiry, zero-price subscription on a per-box synthetic "Comped" plan.
     *
     * subscription.plan_id is NOT NULL with an FK to plans, so a comp cannot simply be plan-less.
     * V14's grandfather migration hit the identical wall and solved it with a per-box synthetic
     * archived plan; this is that pattern, kept separate from 'Grandfathered' so the two reasons
     * stay distinguishable in any later reporting.
     *
     * Callers: the self-serve owner at box signup, and an invite accepted with no plan (that box
     * bills offline, so the member must still be bookable).
     */
    @Transactional
    public Subscription comp(UUID membershipId) {
        Plan comped = plans.findByBoxIdAndName(TenantContext.requireBoxId(), "Comped")
                .orElseGet(() -> { /* create: archived=true, priceCents=0, entitlement=UNLIMITED,
                                      durationDays matching the 'Grandfathered' shape in V14 */ });
        // then an ACTIVE subscription with currentPeriodEnd = null (no expiry)
    }
```

**Read `SubscriptionService.recordPeriod` and `Plan` before writing this** — match the existing field names and the repository method that actually exists (`findByBoxIdAndName` may not; add it or use what is there). `Plan` is `@TenantId`, so a plain derived query is correct here: this runs inside a box's own request or transaction, never cross-box.

- [ ] **Step 4: Wire both call sites**

`BoxSignupTx` — after the owner's BOX_ADMIN membership is saved, comp it. **The tenant must be established before the subscription insert**, or `@TenantId` resolves to the sentinel and the FK fails (`docs/TENANCY.md`, and `SessionGenerator.runAsBox` is the pattern). Read how `BoxSignupTx` currently establishes its tenant and follow it.

Invite accept — where a plan was chosen it already creates a subscription; add the else branch that comps instead of doing nothing. **Read the invite-accept transaction to find it.**

- [ ] **Step 5: Run, expect PASS**, then the full suite green.

- [ ] **Step 6: Commit** — `fix(m12b): comp the self-serve owner and plan-less invitees so they can book`

---

### Task 3: Receipts snapshot the list price

**Files:** Modify `box/ReceiptController.java:61`, `box/PaymentReceipts.java:34-44` + its Thymeleaf template, the Payment write sites, `frontend/.../receipt.page.ts`

**Interfaces:** Consumes `Payment.getListPriceCents()` from Task 1.

The discount is computed in **two** places, both from the plan's current price:
- `ReceiptController.java:61` — `int discountCents = Math.max(0, plan.getPriceCents() - payment.getAmountCents());`
- `PaymentReceipts.java:34-35` — the same, feeding a `hasDiscount` template flag at line 44.

- [ ] **Step 1: Write the failing test**

```java
    @Test
    void aReceiptWithNoRecordedListPriceOmitsTheDiscountEntirely() throws Exception {
        // A Payment row with listPriceCents == null (i.e. created before M12b) must render with NO
        // discount figure — not a discount computed against today's plan price. This is the fix:
        // the omission, not the column.
        // Seed: a plan at 5000, a payment of 4000 with listPriceCents left NULL.
        // Then RAISE the plan's price to 9000 and fetch the receipt.
        // assert: no discount is reported (and certainly not 5000).
    }

    @Test
    void aReceiptReportsTheDiscountAgainstThePriceStoredAtPaymentTime() throws Exception {
        // Seed a payment with listPriceCents = 5000, amount 4000 -> discount 1000.
        // Then raise the plan to 9000 and re-fetch: the discount must STILL be 1000, not 5000.
        // This is the test that fails against the current code.
    }
```

Follow the fixture style in the existing receipt tests — **read them first**.

- [ ] **Step 2: Run, expect FAIL** — the second test reports 5000.

- [ ] **Step 3: Snapshot on write**

Every place a `Payment` is created sets `listPriceCents` from the plan's price at that moment. **Find them all** — `graphify query "where are Payment rows created"` — there is at least the admin-recorded rail and the Stripe webhook. Missing one leaves a permanently-null row.

- [ ] **Step 4: Read the snapshot, omit when null**

Both call sites use `payment.getListPriceCents()`. When it is null, the discount must be **absent**, not zero — `ReceiptDto`'s `listPriceCents`/`discountCents` become `Integer`, and `PaymentReceipts` sets `hasDiscount` false. The Thymeleaf template already branches on `hasDiscount`; confirm the HTML receipt page does the equivalent and make the minimum frontend change so a missing discount renders as nothing rather than "€0.00" or "NaN".

- [ ] **Step 5:** Full backend suite green + `cd frontend && npx tsc --noEmit -p tsconfig.spec.json` rc=0. Do NOT run Karma (about an hour on this machine).

- [ ] **Step 6: Commit** — `fix(m12b): receipts report the discount against the price stored at payment time`

---

### Task 4: Handle `async_payment_failed`

**Files:** Modify `box/StripeWebhookController.java`; add a mail template beside the existing payment-receipt one

- [ ] **Step 1: Write the failing tests**

```java
    @Test
    void asyncPaymentFailedMarksThePaymentFailedAndTellsTheMember() throws Exception {
        // Sign a checkout.session.async_payment_failed event by hand, as StripeWebhookTest already
        // does for the other event types — read it and reuse its signing helper.
        // assert: 200; the Payment row is FAILED; no subscription was granted; one mail sent.
    }

    @Test
    void aReplayedAsyncPaymentFailedChangesNothingAndDoesNotMailTwice() throws Exception {
        // Idempotency, the same property every other webhook path here has: a row already FAILED
        // is a no-op. Without this a Stripe retry emails the member repeatedly.
    }
```

- [ ] **Step 2: Run, expect FAIL** (the event is currently ignored, so the row stays PENDING).

- [ ] **Step 3: Implement**

Add the branch beside `CHECKOUT_COMPLETED` / `ASYNC_PAYMENT_SUCCEEDED`. Flip PENDING → FAILED inside the transaction; send the mail **strictly after commit**, following how the receipt mail is already sequenced out of `tx.execute` in this controller and in `SubscriptionTx`. A row that is already FAILED returns without writing or mailing.

The mail template mirrors `payment-receipt.html`. Keep the copy factual: the payment did not go through, no membership was granted, they can try again. **Do not add a raw hex** — the existing templates duplicate `#D7263D` and that is already a logged backlog item; match whatever they do rather than making it worse.

- [ ] **Step 4:** Full suite green. **Commit** — `fix(m12b): a failed delayed payment is marked FAILED and the member is told`

---

### Task 5: The validation trio

**Files:** Modify `box/MemberController.java`, `box/BoxController.java`, `box/SessionController.java:124-145`

- [ ] **Step 1: Write the three failing tests**

1. **Foreign `planId` on member patch** — PATCH a member with another box's plan id; expect a 4xx, not a 200 that persists it and renders `planName` null. (Today it succeeds.)
2. **Invalid timezone** — PATCH box settings with `"timezone":"Not/AZone"`; expect 400. (Today it persists.)
3. **Missing `bookingId`** — POST `/api/box/sessions/{id}/checkin` with `{}`; expect **400, not 500**. Repeat for `uncheck` and `no-show`.

- [ ] **Step 2: Run, expect all three to FAIL.**

- [ ] **Step 3: Implement**

- Member patch: validate the plan is in the caller's box, exactly as invite-create already does — **read that code and reuse its approach** rather than inventing a second idiom.
- Timezone: reject anything `ZoneId.getAvailableZoneIds()` does not contain, on both create and settings-patch.
- `BookingIdRequest` (SessionController:124) is `record BookingIdRequest(UUID bookingId) {}` used at lines 127, 135 and 143 with `@RequestBody` but no `@Valid` and no constraint. Add `@NotNull` to the component and `@Valid` to all three params:

```java
    record BookingIdRequest(@NotNull UUID bookingId) {}
```

- [ ] **Step 4:** Full suite green. **Commit** — `fix(m12b): validate foreign plan ids, box timezones and missing booking ids`

---

### Task 6: Seal the audit repository, then close out

**Files:** Modify `box/SuperadminAuditRepository.java`, `docs/BACKLOG.md`, `docs/HANDOFF.md`, `.superpowers/sdd/progress.md`

Current state — append-only is a comment asking people not to call inherited methods:

```java
/** Append-only: no update/delete method is declared here, and none should be added. */
public interface SuperadminAuditRepository extends JpaRepository<SuperadminAudit, UUID> {
    List<SuperadminAudit> findAllByOrderByCreatedAtDesc();
}
```

- [ ] **Step 1: Narrow the interface**

```java
/**
 * Append-only, enforced by the TYPE rather than by asking nicely. Extending JpaRepository would
 * inherit delete(), deleteAll() and save-as-update; extending Repository<> means only what is
 * declared below exists. An audit row that can be deleted is not an audit row.
 */
public interface SuperadminAuditRepository extends Repository<SuperadminAudit, UUID> {
    SuperadminAudit save(SuperadminAudit row);
    List<SuperadminAudit> findAllByOrderByCreatedAtDesc();
}
```

- [ ] **Step 2: Compile and run.** If any caller used an inherited method, the compiler says so — that is the point. Fix the caller or, if it genuinely needs a method, STOP and report rather than widening the interface back.

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```

- [ ] **Step 3: Full gates**

Backend suite green, then e2e on a fresh stack at `retries: 0`:

```bash
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && npx playwright test
```
Expected: 26/26. **`down -v` is mandatory** — V16 must apply to a fresh volume, and this milestone changes schema.

- [ ] **Step 4: Docs**

- `docs/BACKLOG.md`: empty the M12b section. Move the instance-builder item to **M12**, the types-page fan-out to **M15**, and the role/status enum item to **Accepted** with the reason (churn, DB already check-constrains, no behaviour change).
- `docs/HANDOFF.md`: M12b entry, test counts, next Flyway **V17**, next step **M12c**.
- `.superpowers/sdd/progress.md`: task→SHA ledger.

- [ ] **Step 5: Commit**, then use `superpowers:finishing-a-development-branch` — merge to main, re-verify on merged main, push, confirm CI green on both workflows.

---

## Self-review (folded in)

**Spec coverage:** §1 V16 → Task 1. §2 comp subscriptions (owner + plan-less invite) → Task 2. §3 receipt snapshot → Task 3. §4 failed delayed payments → Task 4. §5 validation trio → Task 5. §6 append-only by type → Task 6. §7 testing bar → a failing-first test in every task, with the three harder assertions written explicitly into Tasks 2, 3 and 4.

**Hazards pre-adjudicated (executors: do not re-litigate):**
- `subscription.plan_id` is NOT NULL — comps go through a per-box synthetic archived plan, following V14. Do not make it nullable, and do not add a role-based exemption to the booking engine.
- Old Payment rows keep a NULL list price and the receipt **omits** the discount. Do not backfill.
- The three descoped backlog items (instance-builder wod growth, types-page fan-out, role/status enums) are NOT in this milestone.
- This milestone adds no routes, so `AuthzConformanceTest` needs no edit.
- Mail after commit; audit row inside the transaction. Both rules already have precedent in the files you are touching.

**Consistency:** `listPriceCents` is `Integer` (nullable) in Task 1 and consumed as nullable in Task 3. The `Comped` plan name and its `archived = true` are used identically in Task 2's implementation and its third test. Flyway V16 appears only in Task 1; the next free version is V17.
