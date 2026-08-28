# M39 — analytics foundations

**Backend only. No new screens, and no new HTTP routes** (verified: every surface M39 touches already
exists and is already registered in `AuthzConformanceTest.MIN_ROLE`, so **that file must not need an
edit** — if a task appears to need one, stop and escalate).

Spec: `docs/superpowers/specs/2026-08-27-analytics-brief.md` §5 and "Decisions taken".

## Why this exists, in one paragraph

The analytics brief found ten misses and three live defects. Two of the misses only ever capture data
**going forward** — an event nobody recorded is unrecoverable — so every day they do not exist is a
day of LEG, churn and settlement history permanently lost. That, and only that, is why this is a
milestone rather than a line in M15a.

## The tenancy rule that governs half of this milestone

**Both membership-creation paths are tenant-less, and both already end in a `runAsBox` block.**
Verified by reading them:

| Site | The tenant-less part | The `runAsBox` part |
|---|---|---|
| Invite accept | `InviteAcceptTx.accept` — its javadoc says it is "safe under the accepting user's tenant-less token" | `InvitePublicController.accept` wraps the `Subscription` creation in `runAsBox` |
| Box signup | `BoxSignupTx.createOwnerAndBox` — the box does not exist when the transaction opens | `BoxSignupService:109` `runAsBox(r.boxId(), () -> subscriptionService.comp(...))` |

A `@TenantId` row written in the tenant-less half is stamped with the all-zeros `NO_TENANT` sentinel
and **dies on the foreign key to `boxes`** — `docs/TENANCY.md` failure mode 2. So:

> **`membership_event` is `@TenantId`, and it is written wherever `Subscription` is written.**

That symmetry is the whole rule and it is deliberate: both are box-scoped facts about a membership,
both need the box tenant, both belong in the same `runAsBox` block. `MemberController.patch` is the
exception that proves it — it serves `/api/box/**`, already holds a real box tenant, and therefore
writes its event **strictly inside its existing `@Transactional`**, which is what `CLAUDE.md`'s audit
rule demands.

## Task 1 — the migration ✅ DONE

`V29__analytics_foundations.sql`, written by the orchestrator (a one-way migration touching money and
tenancy is not executor work) and verified by applying V1→V29 to a throwaway Postgres with
representative data, asserting every backfill, and running a negative control on the currency
adoption. All six changes plus `payment.stripe_payment_intent_id`. See commit `9ec0486`.

**Still owed:** a `v29AnalyticsFoundations` case in `backend/src/test/java/com/boxhub/MigrationTest.java`,
which asserts per-migration schema facts for every other migration. Folded into Task 2.

## Task 2 — M-1, membership lifecycle

New `MembershipEvent` entity + `MembershipEventRepository`. **Follow `SuperadminAudit` exactly** — it
is the existing append-only, constructor-only, no-setters precedent, written in the same transaction
as the status flip in `BoxLifecycleTx`.

Write sites, all four:
- `MemberController.patch` — SUSPENDED / REACTIVATED, **inside the existing `@Transactional`**. Emit
  only on an actual transition (old status ≠ new status), never on a no-op PATCH.
- `InvitePublicController.accept` — JOINED, **inside the existing `runAsBox` block**, both branches.
- `BoxSignupService` — JOINED for the owner, **inside the existing `runAsBox`** at line ~109.
- `DevDataSeeder` — JOINED for seeded memberships, under whatever box tenant it already establishes.

**`LEFT` is in the check constraint and nothing emits it. That is deliberate and must be said out
loud in the code:** the product has no departure flow — no LEFT status, no leave endpoint, no admin
"remove member" action. M39 records the transitions that **exist** so they stop being lost. A true
departure event is **M15a's**, which owns at-risk and LEG. Consequence to state in the brief and not
paper over: LEG is computable today from JOINED→SUSPENDED and from subscription lapse, **not** from a
member quietly ceasing to attend.

Also add the `MigrationTest` case from Task 1.

**`DevDataSeeder` is deliberately NOT a write site.** It creates its memberships (lines ~125-195)
*outside* any `runAsBox` — the first one does not start until line ~222 — so a `@TenantId` event row
written there is stamped `NO_TENANT` and dies on the foreign key. The executor escalated this rather
than restructuring the seeder, which was right.

**Consequence, recorded so M15a does not trip over it:** seeded demo boxes have **no lifecycle
events at all**, so a LEG or churn screen built against demo data will render empty. Deliberately
not fixed here — a blanket JOINED-for-every-seeded-membership would not give M15a what it actually
needs (a churned member, a long-tenured one, a suspended-then-reactivated one), and the seeder is
what the e2e suite depends on. **M15a designs its own lifecycle seed data**, and should use
`memberships.findByBoxId(...)` inside a per-box `runAsBox` when it does — not `findAll()`, which is
now a standing grep gate.

## Task 3 — M-2 and M-3, settlement and refunds (MONEY — tightest brief, orchestrator reviews hardest)

- `Payment` gains `settledAt` and `stripePaymentIntentId`.
- `SubscriptionTx.recordAdminPayment` sets `settledAt` at insert — those rows are `SUCCEEDED` on
  creation, so creation *is* settlement.
- `StripeCheckoutService.createSession` leaves both null — `PENDING` is not settled.
- `StripeWebhookController` success branch sets `settledAt` **and** captures the session's
  `payment_intent` into `stripePaymentIntentId`. The failed branch sets neither.
- New `charge.refunded` branch. **It cannot reuse the existing routing**: every event today is routed
  by `data.object.id` → `stripe_session_id`, and a Charge's id is `ch_…`, which never matches a
  `cs_…`. Route it by `data.object.payment_intent` → `stripePaymentIntentId`, via a **native** query
  (the webhook is tenant-less until the payment row tells it which box it is — the same reason
  `findByStripeSessionId` is native).
- New `Refund` entity + repository, `@TenantId` like `payment`. Written inside the webhook's existing
  `runAsBox(boxId, () -> tx.execute(...))` nesting — **that ordering is load-bearing**, tenant before
  the Hibernate session opens.
- Service-level rule, not a DB constraint: the sum of a payment's refunds may not exceed the payment.
  A `CHECK` cannot express an aggregate over siblings and a trigger should not.

**Out of scope, deliberately:** any admin-initiated refund route or UI. That is **M16c**. M39 lands
the schema and the Stripe path only, which is why no new route appears and `AuthzConformanceTest`
stays untouched.

## Task 4 — M-4, `subscription.kind`

`Subscription` gains `kind`, defaulted `"PAID"` **via a Java field initializer** (the
`Membership.status = "ACTIVE"` pattern) so the ~60 tests that construct entities directly keep
compiling. `comp()` sets `COMPED`; `recordPeriod` sets `PAID`.

Retire `SubscriptionService.isComp`'s plan-name test — it has exactly **one** call site
(`SubscriptionService:57`). Keep `COMPED_PLAN_NAME` only if the synthetic plan is still minted by
name; the *decision* about whether a subscription is comped now reads `kind`.

`"Grandfathered"` stays `PAID` and V29 comments why. `TRIAL` is added now, unused, so **M32a** does
not invent its own marker.

## Task 5 — M-5, `boxes.currency`

`Box` gains `currency`, Java field initializer `"eur"`. Exposed on the existing `GET /api/box/current`
and settable on the existing `PATCH /api/box/settings` — **both already in `MIN_ROLE`, no new route**.
`PlanController` validates plan currency against the box's on create and patch; today it accepts the
request body verbatim with no check of any kind.

Frontend: `admin/plans.page.ts` currently offers an unconditional EUR/USD/GBP `<select>`. It must show
the box's currency instead of letting a plan diverge from it.

## Task 6 — M-6, `ran_by_membership_id`

`ClassSession` gains the field. **Note the deliberate type asymmetry**: `coach_id` is a **User** id,
`ran_by_membership_id` is a **Membership** id — "who is owed, in this box's context" is a different
question from "which person is this", the same asymmetry `payment.payee_membership_id` already
carries. Do not "fix" it to match.

Nothing writes it in M39; the writer is **M34** (The Room), where a class is actually run. Expose it
on the existing session DTOs so M16d has something to read. Readers coalesce to `coach_id` and must
know that is what they are doing.

## Task 7 — D-3, the admin-stats cross-tenant leak ✅ DISPATCHED

`AdminStatsController.stats()` calls `memberships.findAll()` with no box filter, and `Membership` is
not `@TenantId`, so a box admin's headline `activeMembers` counts every membership on the platform.

## Task 8 — D-1, the score-destroying programming edit ✅ DISPATCHED

Separate from the migrations; see the brief's §2 D-1 and "Decisions taken" #1.

## Gates for the milestone

```sh
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test   # NOT ./mvnw — there is no wrapper in this repo
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless
cd /Users/alessandrolomonaco/dev/boxhub/frontend && env -u NODE_OPTIONS npx ng build --configuration production
grep -rn "runAsRoot" /Users/alessandrolomonaco/dev/boxhub/backend/src/main/java --include='*Controller.java'   # must be empty
```
Plus e2e and the visual suite on a `down -v` stack before the milestone closes, and the eight §8.1
greps if any frontend file is touched (Task 5 touches one).

**`AuthzConformanceTest` must remain untouched.** No task here adds or removes a route. An executor
that believes otherwise escalates instead of editing it.
