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
