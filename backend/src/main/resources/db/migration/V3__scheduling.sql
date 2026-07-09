alter table boxes add column cancel_cutoff_min int not null default 120;
alter table boxes add column booking_horizon_weeks int not null default 2;

create table class_templates (
    id           uuid primary key default gen_random_uuid(),
    box_id       uuid not null references boxes(id),
    name         text not null,
    weekday      int  not null check (weekday between 0 and 6),   -- 0=Mon .. 6=Sun
    start_time   time not null,                                   -- local wall-clock in box tz
    duration_min int  not null check (duration_min > 0),
    capacity     int  not null check (capacity > 0),
    coach_id     uuid references users(id),
    active       boolean not null default true,
    created_at   timestamptz not null default now()
);
create index idx_templates_box on class_templates(box_id);

create table class_sessions (
    id           uuid primary key default gen_random_uuid(),
    box_id       uuid not null references boxes(id),
    template_id  uuid references class_templates(id),
    name         text not null,
    start_at     timestamptz not null,
    duration_min int not null check (duration_min > 0),
    capacity     int not null check (capacity > 0),
    coach_id     uuid references users(id),
    status       text not null default 'SCHEDULED' check (status in ('SCHEDULED','CANCELLED')),
    created_at   timestamptz not null default now(),
    unique (template_id, start_at)
);
create index idx_sessions_box_start on class_sessions(box_id, start_at);

create table bookings (
    id            uuid primary key default gen_random_uuid(),
    box_id        uuid not null references boxes(id),
    session_id    uuid not null references class_sessions(id),
    membership_id uuid not null references memberships(id),
    status        text not null check (status in ('BOOKED','WAITLIST','CHECKED_IN','NO_SHOW','CANCELLED')),
    position      int,
    booked_at     timestamptz not null default now(),
    checked_in_at timestamptz,
    constraint uq_active_booking unique (session_id, membership_id)
);
create index idx_bookings_session on bookings(session_id);
create index idx_bookings_membership on bookings(membership_id);
