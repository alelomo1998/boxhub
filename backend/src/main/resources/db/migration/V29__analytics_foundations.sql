-- M39: the six changes the analytics brief forced.
-- docs/superpowers/specs/2026-08-27-analytics-brief.md §5.
--
-- They land as ONE pass, before M29a, for one reason that applies to only two of them: an event
-- nobody recorded is unrecoverable. membership_event and payment.settled_at capture data going
-- FORWARD only, so every day they do not exist is a day of LEG, churn and settlement history
-- permanently lost. The other four gain nothing from being early; they ride along because one
-- Flyway pass and one test sweep is cheaper than four.
--
-- Backfill policy throughout, stated once: a fact with a real recorded timestamp is backfilled;
-- a fact whose timing is unknowable is left NULL rather than invented. The brief's own rule.


-- ─────────────────────────────────────────────────────────────────────────────
-- M-1. Membership lifecycle. THE headline miss.
--
-- Today "when did this member leave" has nothing to read: memberships.status is overwritten in
-- place (MemberController) with no audit row, and no code path ever deletes a membership. So LEG
-- (length of engagement) is computable for a CURRENT member and not for a churned one -- which is
-- the only cohort the metric is about -- and monthly churn has no source at all.
--
-- This corrects docs/POSITIONING.md §5, which claimed subscription + payment + entitlement_usage
-- already hold everything LEG needs. True for ARM; false for LEG.
--
-- @TenantId (docs/TENANCY.md §8): box-operational. The dominant read is one box's own retention
-- report, on a request thread carrying a box tenant -- the same classification entitlement_usage
-- got in M16a. A PLATFORM-WIDE churn read (M18) is therefore a cross-box read of a @TenantId table
-- and needs a registered native query per TENANCY.md §6. It is named here and NOT built.
--
-- Append-only by discipline, not by constraint: nothing in this schema stops an UPDATE, and adding
-- a trigger to forbid one is machinery out of proportion to the risk. The rule is that no code
-- updates or deletes a row here -- CLAUDE.md's "an audit row is written strictly INSIDE the
-- transaction" already covers the write side.
create table membership_event (
    id            uuid primary key default gen_random_uuid(),
    box_id        uuid not null references boxes (id),
    -- Cascade matches wod_score and lift_entry, which also hang off membership. A membership row
    -- is never deleted by any code path today; if one ever is, its history goes with it, because
    -- a lifecycle event for a membership that no longer exists cannot be reported on anyway.
    membership_id uuid not null references memberships (id) on delete cascade,
    kind          text not null check (kind in ('JOINED', 'SUSPENDED', 'REACTIVATED', 'LEFT')),
    -- Who caused it. NULL = the system (the lapse job, the seeder, a migration).
    -- A membership, not a user: "who acted, in this box's context" -- the same question
    -- payment.payee_membership_id asks, and the same answer. See TENANCY.md §8.2 on that asymmetry.
    actor_membership_id uuid references memberships (id),
    note          text,
    created_at    timestamptz not null default now()
);
-- One member's timeline, oldest first: the LEG read.
create index idx_membership_event_timeline on membership_event (membership_id, created_at);
-- "How many left in July": the churn read.
create index idx_membership_event_churn on membership_event (box_id, kind, created_at);

-- Backfill: JOINED only, from memberships.created_at, which is a real recorded fact.
--
-- Deliberately NOT backfilled: a SUSPENDED event for members currently suspended. We know they ARE
-- suspended; we do not know WHEN, and a synthetic timestamp would silently become a data point in
-- a churn chart. Readers take current state from memberships.status and history from this table --
-- the two answer different questions and the reader needs both.
insert into membership_event (box_id, membership_id, kind, created_at)
select box_id, id, 'JOINED', created_at from memberships;


-- ─────────────────────────────────────────────────────────────────────────────
-- M-2. When the money actually arrived.
--
-- payment.created_at is `insertable=false, updatable=false` over a `default now()` column, so the
-- webhook CANNOT touch it when a PENDING row settles. For a card that is a distinction without a
-- difference; for the delayed-notification rails the webhook exists to handle (SEPA debit, bank
-- transfer) settlement can land days later and in a DIFFERENT MONTH. Revenue keyed on created_at
-- then books the money to the month the member clicked. A FAILED row also carries a created_at for
-- money that never existed.
--
-- Nullable on purpose: NULL means "not settled", which is exactly what a PENDING or FAILED row is.
-- Revenue reads settled_at; created_at stays what it always was, the attempt time.
alter table payment add column settled_at timestamptz;

-- The linkage a refund needs, and the reason M-3 is not a one-line webhook branch.
--
-- StripeWebhookController routes EVERY event by `data.object.id` -> payment.stripe_session_id.
-- That works only because a checkout.session.* event's object IS the session. A charge.refunded
-- event's object is a CHARGE: its id is `ch_...`, which will never match a `cs_...` session id,
-- and this schema stores no charge id and no payment intent id at all. So today a refund cannot be
-- routed to a payment row even if the webhook did handle the event.
--
-- The fix is the cheapest of the three available: the checkout session JSON already carries
-- `payment_intent`, so the success branch stores it, and charge.refunded looks the payment up by
-- `data.object.payment_intent`. No change to how the session is created, and no reliance on Stripe
-- metadata propagating from a Session to a Charge -- which it does NOT do unless
-- payment_intent_data.metadata is set at creation time, and it is not.
--
-- UNIQUE for the same reason stripe_session_id is: one session, one intent, one payment row, and a
-- replayed webhook is a no-op. Postgres permits many NULLs, so hand-recorded payments are unaffected.
alter table payment add column stripe_payment_intent_id text unique;

-- Backfill, and the honest caveat with it. For admin-recorded rows this is EXACT: SubscriptionTx
-- writes them already SUCCEEDED, so created_at IS the settlement moment. For Stripe rows it is a
-- proxy -- the true settlement time was never recorded and cannot be recovered. No production
-- deployment exists (see V7 and V19), so this touches development data only.
update payment set settled_at = created_at where status = 'SUCCEEDED';


-- ─────────────────────────────────────────────────────────────────────────────
-- M-3. Refunds, which today cannot be represented at all.
--
-- payment.status admits SUCCEEDED | PENDING | FAILED (V17) and there is no refund concept anywhere.
-- StripeWebhookController handles exactly three event types; every other type, charge.refunded
-- included, falls through as a silent 200. So a refund issued from the Stripe dashboard changes
-- NOTHING in this database and the payment row stays SUCCEEDED for ever. Every revenue number is
-- gross, permanently, with no way even to estimate the gap.
--
-- A row, not a status flag, because PARTIAL refunds exist and a payment can be refunded more than
-- once. A flag cannot carry an amount and cannot carry two of them.
--
-- @TenantId, exactly like payment.
create table refund (
    id               uuid primary key default gen_random_uuid(),
    box_id           uuid not null references boxes (id),
    payment_id       uuid not null references payment (id),
    amount_cents     int  not null check (amount_cents > 0),
    currency         text not null,
    reason           text,
    -- Stripe's own refund id. UNIQUE, which is what makes a replayed webhook a no-op -- the same
    -- idempotency shape payment.stripe_session_id already uses. NULL for a refund recorded by hand.
    stripe_refund_id text unique,
    -- NULL = the system (a Stripe-initiated refund arriving by webhook).
    recorded_by      uuid references memberships (id),
    -- When the money went back, which is what a revenue window filters on. Distinct from created_at
    -- for the same reason settled_at is distinct from payment.created_at.
    refunded_at      timestamptz not null default now(),
    created_at       timestamptz not null default now()
);
create index idx_refund_payment on refund (payment_id);
-- "Refunds settled in this window": the netting read.
create index idx_refund_box_settled on refund (box_id, refunded_at);

-- NOT enforced here: that the sum of a payment's refunds never exceeds the payment. It needs an
-- aggregate over sibling rows, which a CHECK cannot express and a trigger should not. The service
-- enforces it; the test suite is what pins it.


-- ─────────────────────────────────────────────────────────────────────────────
-- M-4. "Comped" stops being a string comparison against a plan name.
--
-- SubscriptionService.isComp is COMPED_PLAN_NAME.equals(plan.getName()) with the literal "Comped".
-- Two consequences: renaming or recreating that plan silently un-comps every member on it, and a
-- comp is indistinguishable in the data from a member who simply has not been charged yet -- which
-- matters enormously to the revenue definition, because one is intentional and the other is debt.
--
-- TRIAL is included now rather than later: M32a builds the trial -> member conversion board and
-- would otherwise invent its own marker for the same idea.
alter table subscription add column kind text not null default 'PAID'
    check (kind in ('PAID', 'COMPED', 'TRIAL'));

-- Backfill by applying the retiring rule one last time, to the value it would have produced.
update subscription s set kind = 'COMPED'
from plans p where p.id = s.plan_id and p.name = 'Comped';

-- 'Grandfathered' -- V14's OTHER synthetic per-box plan -- deliberately stays PAID. Those are real
-- legacy subscriptions carrying a real price, not comps; the only thing synthetic about them is the
-- plan row V14 minted to hang them off. The default above already gives them PAID, and this comment
-- exists so nobody "fixes" that later by adding a fourth kind for them.


-- ─────────────────────────────────────────────────────────────────────────────
-- M-5. A box has one currency.
--
-- plans.currency is free text accepted verbatim from the request body (PlanController) with no
-- pattern, enum or ISO-4217 check, and `boxes` has no currency column at all -- so there is nothing
-- for a plan's currency to be validated against. A box can hold a eur plan and a usd plan, and
-- SUM(amount_cents) then adds cents of euros to cents of dollars. The number is wrong and nothing
-- complains.
--
-- Reporting per currency is the correct general answer and the wrong one for a product whose pilot
-- is a single European gym. One currency per box, recorded as a decision rather than assumed.
alter table boxes add column currency text not null default 'eur';

-- Adopt what the box's plans already agree on. Where they do NOT agree there is no right answer,
-- so the box keeps the default and the migration SAYS SO rather than picking a winner silently --
-- the pattern V19 established for its template_piece de-duplication.
update boxes b set currency = agreed.c
from (select box_id, min(currency) c from plans
      group by box_id having count(distinct currency) = 1) agreed
where agreed.box_id = b.id;

do $$
declare mixed int;
begin
    select count(*) into mixed from (
        select box_id from plans group by box_id having count(distinct currency) > 1
    ) x;
    if mixed > 0 then
        raise notice 'V29: % box(es) hold plans in more than one currency and kept the default ''eur''; their plans need reconciling by hand', mixed;
    end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- M-6. Who actually ran the class, as opposed to who was assigned it.
--
-- class_sessions.coach_id is the coach assigned when the session was generated from its slot. The
-- coach who covered a sick colleague at 6am leaves no trace anywhere. M16d scopes a staff payroll
-- calculator over "coach hours from class assignments" -- and paying people from the assignment
-- column is a payroll error, not a reporting inaccuracy.
--
-- A MEMBERSHIP, where coach_id is a USER. The asymmetry is deliberate and matches
-- payment.payee_membership_id: "who is owed, in this box's context" is a different question from
-- "which person is this", and M21 made one person able to hold several boxes.
--
-- Nullable, and NOT backfilled from coach_id: that would assert a fact nobody recorded. NULL means
-- "nobody recorded it", and a reader coalesces to coach_id knowing that is what it is doing. The
-- writer is M34 (The Room), which is where a class is actually run.
alter table class_sessions add column ran_by_membership_id uuid references memberships (id);
create index idx_class_sessions_ran_by on class_sessions (ran_by_membership_id)
    where ran_by_membership_id is not null;
