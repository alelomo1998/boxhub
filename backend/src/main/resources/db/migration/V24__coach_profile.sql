-- M22 spec §6. Keyed on the USER, never on the box: a coach holds ONE profile, ONE calendar and
-- ONE Stripe account across every box they work at (spec D14). Tenant-scoping any of these would
-- duplicate credentials per box, or make them vanish when the coach switches box — which is
-- docs/TENANCY.md failure mode 1.
--
-- No constraint enforces single-box coaching. Enforcing it would be a partial unique index on
-- memberships where role = 'COACH', which could fail against existing rows and would have to be
-- dropped the moment multi-box is wanted — a one-way migration spent on a temporary assumption.

create table coach_profile (
    user_id     uuid primary key references users (id) on delete cascade,
    bio         text,
    strengths   text,
    weaknesses  text,
    photo_path  text,
    published   boolean not null default false,
    price_cents int,
    currency    text,
    -- Spec D2: the PT payee is a per-coach choice and coach-direct is the default.
    payee       text not null default 'COACH' check (payee in ('COACH', 'BOX')),
    created_at  timestamptz not null default now()
);

create table coach_availability (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id) on delete cascade,
    weekday    int  not null check (weekday between 0 and 6),
    start_time time not null,
    end_time   time not null,
    constraint ck_coach_avail_order check (end_time > start_time)
);
create index idx_coach_avail_user on coach_availability (user_id, weekday);

-- Exceptions kept a separate table rather than nullable columns muddying the recurring pattern.
create table coach_time_off (
    id        uuid primary key default gen_random_uuid(),
    user_id   uuid not null references users (id) on delete cascade,
    starts_at timestamptz not null,
    ends_at   timestamptz not null,
    constraint ck_coach_timeoff_order check (ends_at > starts_at)
);
create index idx_coach_timeoff_user on coach_time_off (user_id, starts_at);

-- Mirrors box_stripe exactly: BYO restricted key, not Connect (spec §10).
create table coach_stripe (
    user_id            uuid primary key references users (id) on delete cascade,
    restricted_key_enc text not null,
    webhook_secret_enc text not null,
    enabled            boolean not null default true,
    created_at         timestamptz not null default now()
);
