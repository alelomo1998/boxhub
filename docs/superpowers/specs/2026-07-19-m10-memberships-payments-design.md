# M10 — Memberships & Payments

**Date:** 2026-07-19
**Status:** Approved. Next step: `writing-plans`.
**Project:** 1 (The Platform). See `docs/superpowers/specs/2026-07-14-v1-roadmap-design.md`.
**Migration:** Flyway **V14**.

## Why this milestone exists

Today `Plan` is a weekly-booking-limit row a membership points at forever — no price, no period, no payment, no
concept of "paid up". A real box sells memberships: an athlete subscribes to a plan, pays (often at a negotiated
price, by whatever method), and their booking rights depend on being current. This milestone is that subscription +
money domain. It is the biggest domain build in Project 1.

## Decisions (locked in brainstorm)

| Question | Decision |
|---|---|
| Core model | **Subscription is a first-class entity** (membership + plan + status + period). `Membership.planId` is dropped; booking reads the active subscription. |
| Stripe rail | **Stripe Checkout, one payment per period** (box's own restricted key). The athlete re-pays each period; renewal is manual, driven by a lapse email. |
| Entitlement | **UNLIMITED or WEEKLY_LIMIT** — today's model, moved onto the subscription and gated by "is the subscription active". Class-packs → backlog. |
| Stripe keys | **Restricted key + webhook secret, AES-GCM encrypted at rest.** Never returned to a client, never logged. |
| Pricing | **Agreed price lives on the subscription** (list price pre-filled, editable) + an optional note. Discount = list − agreed. A reusable named-discount catalog → backlog. |
| Payment methods | **STRIPE | CASH | TRANSFER | CARD | OTHER.** Stripe is the only *automated* rail and is *optional* per box; everything else the admin records at the amount actually collected. A box with no Stripe runs fully on admin-recorded payments. |
| Who subscribes | **Both** — athlete self-serve via Stripe (list price), admin records a payment (any method, any agreed price). |
| Lapse → booking | **Block new bookings immediately, keep already-booked future classes.** Grace window → backlog. |
| Migration | **Existing plans reframed as price-0 published plans; every current membership grandfathered into an ACTIVE subscription with no end date.** Nobody loses booking on deploy day. |
| Emails | **Payment receipt** (both rails) + **subscription-lapsed** notice (nightly expiry job). |

## 1. Data model (V14)

- **`plans`** (rework existing `@TenantId` entity): add `price_cents int NOT NULL DEFAULT 0` (the **list/default** price
  — the box's standard rate), `currency text NOT NULL DEFAULT 'eur'`, `entitlement text NOT NULL` (`UNLIMITED` |
  `WEEKLY_LIMIT`). Keep `duration_days`, `weekly_class_limit`, `archived`. Existing rows backfill price 0 and
  `WEEKLY_LIMIT` when `weekly_class_limit` is set, else `UNLIMITED`.
- **`subscription`** (new, `@TenantId`): `id`, `membership_id`, `plan_id`, `status`
  (`ACTIVE`|`PAST_DUE`|`EXPIRED`|`CANCELED`), `price_cents` (the actual agreed price for this subscription),
  `price_note` (nullable — "student 20%"), `current_period_start`, `current_period_end` (**null = grandfathered,
  no expiry**), `created_at`. **Partial unique index**: at most one `status='ACTIVE'` subscription per membership.
- **`payment`** (new, `@TenantId`): `id`, `subscription_id`, `amount_cents`, `currency`, `method`
  (`STRIPE`|`CASH`|`TRANSFER`|`CARD`|`OTHER`), `status` (`SUCCEEDED`|`PENDING`), `stripe_session_id` (nullable,
  unique), `recorded_by` (nullable membership — the admin, set for every non-Stripe method), `reference` (nullable
  note), `created_at`. This row is the receipt's source of truth.
- **`box_stripe`** (new, NOT `@TenantId`, one row per box, **optional**): `box_id PK`, `restricted_key_enc`,
  `webhook_secret_enc`, `enabled`. Encrypted blobs only. No row = no online rail.

`Membership.plan_id` is **dropped**. `Invite.plan_id` stays (it pre-selects a plan); accept now creates a
subscription instead of stamping a planId.

## 2. Stripe connection (security-critical)

A box admin pastes a **Stripe restricted key** (scoped to Checkout + read, not a full `sk_live`) and the webhook
signing secret into box settings. Both are **AES-GCM encrypted at rest** via a server-held master key
(`BOXHUB_STRIPE_ENC_KEY` env, 32 bytes). A `CryptoService` is the only component that encrypts/decrypts. The key is
**never returned to any client** (settings GET returns `{connected: boolean}`, never the key material) and **never
logged**. A `StripeKeys` service loads + decrypts a box's key on demand. Connecting Stripe is optional; a box may
never do it and still sell memberships through admin-recorded payments.

## 3. Plan publishing (box admin)

The existing `/api/box/plans` CRUD gains `price_cents` / `currency` / `entitlement`. Plans **archive, never delete**
(subscriptions reference them). Plumbing-plain admin screen (M12 restyles).

## 4. Subscribe — Stripe self-serve (athlete, list price)

Available only when the box has connected Stripe. Athlete picks a plan →
`POST /api/box/subscriptions/checkout {planId}` → backend creates a Stripe **Checkout Session** on the box's account
(line item = the plan's **list price**; metadata carries `boxId`, `membershipId`, `planId`, and our pending
`payment.id`) → returns the hosted URL → athlete pays on Stripe's page →
**`POST /api/stripe/webhook`** (permitAll; **signature-verified against that box's decrypted webhook secret**; the box
is resolved from the session metadata) fires on `checkout.session.completed`: mark the payment `SUCCEEDED`,
create-or-extend the subscription by one `duration_days` period, set `ACTIVE`. **Idempotent** on `stripe_session_id`
(a replayed webhook is a no-op). Receipt email fires after commit.

**Create-or-extend, defined precisely** (both rails): if the membership has an active subscription for the same plan,
extend its `current_period_end` by `duration_days` (from the later of now and the current end); otherwise create a new
`ACTIVE` subscription starting now. The Stripe path sets `subscription.price_cents` to the plan's list price; the
admin path sets it to the entered agreed price. A membership's single-active-subscription invariant (partial unique
index) means switching plans first requires canceling/expiring the current one — enforced in the service, tested. Per-user discounts do not apply online in v1 — a
discounted athlete is handled by the admin path.

## 5. Record a payment — admin, any method, agreed price

The general path for every negotiated or non-Stripe payment:
`POST /api/box/subscriptions {membershipId, planId, method, priceCents, priceNote?, reference?}` (BOX_ADMIN). Sets the
**agreed price** (`priceCents`, pre-filled from the plan's list price in the UI, editable), creates-or-extends the
subscription by one period, and writes a `Payment` at `amount_cents = priceCents` with the chosen method
(`CASH`/`TRANSFER`/`CARD`/`OTHER`, `recorded_by` = the admin). Receipt email fires after commit. A member-visible,
tenant-scoped **printable receipt page** at `/receipt/:paymentId` renders HTML (no PDF lib — PDF export → backlog);
it shows the agreed price and, if lower than list, the discount.

## 6. Entitlements → booking

`BookingService`'s `weeklyLimitReached` becomes an entitlement check: resolve the membership's **active** subscription
(status ACTIVE and — if `current_period_end` is non-null — not past it). No active subscription → 403
`NO_ACTIVE_SUBSCRIPTION`. `UNLIMITED` → allow. `WEEKLY_LIMIT` → the existing Mon–Sun box-timezone count vs
`plan.weekly_class_limit`. **Grandfathered subscriptions** (`current_period_end` null) are always active. A lapse
blocks only *new* bookings — already-booked future classes are never touched.

## 7. Lifecycle job + emails

A nightly `@Scheduled` sweep flips `ACTIVE` subscriptions past `current_period_end` to `EXPIRED` and mails the
lapse notice. Grandfathered (null end) are skipped. Templates (M8 Mailer + Thymeleaf): **`payment-receipt`** (both
rails — shows amount, method, period, discount) and **`subscription-lapsed`** ("your membership lapsed — renew to
keep booking"). Since renewal is manual, the lapse notice is what drives re-payment.

## 8. Migration + testing

**V14 migration**, in order: add plan columns (backfill price 0 + entitlement); create `subscription`, `payment`,
`box_stripe`; **grandfather** — for every membership, insert one `ACTIVE` subscription with `current_period_end` null
pointing at the membership's old `plan_id` (or, where `plan_id` is null, a synthetic UNLIMITED default so the member
still books); then **drop `membership.plan_id`**. `Invite.plan_id` stays. `DevDataSeeder` reseeds priced plans and a
mix of subscriptions.

**Testing.** Backend: plan CRUD + price/entitlement + archive-not-delete; **CryptoService encrypt/decrypt round-trip
+ key never leaks in the settings DTO**; Stripe checkout-session creation (Stripe client mocked); **webhook signature
verification** — forged rejected, valid accepted, replayed is idempotent; admin record-payment across every method +
agreed-price-below-list + receipt; entitlement gates — no-subscription 403 `NO_ACTIVE_SUBSCRIPTION`, WEEKLY_LIMIT
hit, UNLIMITED allowed, grandfathered allowed; lapse job flips + mails, grandfathered skipped; **cross-tenant +
role-denied on every new box endpoint**; migration grandfathering (a pre-V14 member still books after V14). E2E:
publish a priced plan → admin records a cash subscription for an athlete → athlete books → receipt page renders with
the amount. (Stripe Checkout's hosted redirect can't run in Playwright against real Stripe; the webhook path is
covered at the API/integration level, not e2e.)

## Out of scope (→ `docs/BACKLOG.md`)

Stripe recurring/auto-renew subscriptions; class-packs / credit punch-cards; reusable named per-user discount catalog
(v1 stores the agreed price per subscription); PDF receipts; proration / plan-change mid-period; refunds;
grace-period window on lapse; pending-confirmation offline handshake; Stripe Connect; online per-user discounts /
coupons.
