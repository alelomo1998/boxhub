-- M16a: one weekly limit behind a two-value string becomes eight optional limits, counted from an
-- append-only ledger. NULL means unlimited; every limit that is set must pass (AND, no precedence).

alter table plans
    add column entries_per_day            int check (entries_per_day > 0),
    add column entries_per_week           int check (entries_per_week > 0),
    add column entries_per_month          int check (entries_per_month > 0),
    add column entries_total              int check (entries_total > 0),
    add column cancellations_per_day      int check (cancellations_per_day > 0),
    add column cancellations_per_week     int check (cancellations_per_week > 0),
    add column cancellations_per_month    int check (cancellations_per_month > 0),
    add column cancellations_total        int check (cancellations_total > 0);

-- V14 set entitlement = 'WEEKLY_LIMIT' exactly where weekly_class_limit is not null, so this single
-- copy covers both old values: a WEEKLY_LIMIT plan keeps its number, an UNLIMITED plan stays all-null.
update plans set entries_per_week = weekly_class_limit where weekly_class_limit is not null;

alter table plans drop column weekly_class_limit;
alter table plans drop column entitlement;

-- Per-box cancellation policy. All three default to exactly today's behaviour: a BOOKED booking
-- cannot be cancelled past cancel_cutoff_min (allow_late_cancel = false), so the other two are inert
-- until a box opts in. cancel_cutoff_min itself already exists (V21) and is the "how late is late"
-- knob -- no new column for it.
alter table boxes
    add column allow_late_cancel            boolean not null default false,
    add column late_cancel_refunds_entry    boolean not null default false,
    add column count_waitlist_cancellations boolean not null default false;

-- Consumption cannot be counted from `bookings`: SlotRegenerationService deletes the CANCELLED rows
-- in a regenerated range, which would silently erase cancellation history and the unrefunded entry of
-- a late cancel. Hence an append-only ledger that scheduling never touches.
create table entitlement_usage (
    id               uuid primary key default gen_random_uuid(),
    box_id           uuid not null references boxes (id),
    subscription_id  uuid not null references subscription (id),
    membership_id    uuid not null references memberships (id),
    -- NO foreign key, deliberately: an FK would either block the regeneration delete or cascade this
    -- row away with it, which is the exact failure this table exists to prevent. Soft reference for
    -- tracing and for the refund lookup; no count reads it.
    booking_id       uuid,
    -- Copied, not joined: the window anchor must survive the session row being deleted.
    session_start_at timestamptz not null,
    kind             text not null check (kind in ('ENTRY', 'CANCELLATION')),
    refunded         boolean not null default false,
    created_at       timestamptz not null default now()
);
create index idx_entitlement_usage_count on entitlement_usage (membership_id, kind, session_start_at);
create index idx_entitlement_usage_box on entitlement_usage (box_id);
create index idx_entitlement_usage_booking on entitlement_usage (booking_id);

-- Backfill: an athlete mid-term must not be handed a fresh allowance. This is the one moment
-- `bookings` is authoritative -- before regeneration can have deleted anything from the current term.
--
-- Bound: least(term start, 35 days ago). 35 days covers the widest rolling window (a calendar month)
-- and the full term of a monthly plan; for an annual plan current_period_start reaches further back,
-- which is exactly what `entries_total` needs.
--
-- Live statuses only. A CANCELLED row seeds nothing: no plan could have carried a cancellation limit
-- before this migration, and a cancelled booking does not record whether it was BOOKED or WAITLIST
-- before the cancel -- so its consumption history is unknowable rather than zero.
insert into entitlement_usage (box_id, subscription_id, membership_id, booking_id, session_start_at, kind, refunded)
select b.box_id, sub.id, b.membership_id, b.id, s.start_at, 'ENTRY', false
from bookings b
         join class_sessions s on s.id = b.session_id
         join subscription sub on sub.membership_id = b.membership_id and sub.status = 'ACTIVE'
where b.membership_id is not null
  and b.status in ('BOOKED', 'WAITLIST', 'CHECKED_IN', 'NO_SHOW')
  and s.start_at >= least(sub.current_period_start, now() - interval '35 days');
