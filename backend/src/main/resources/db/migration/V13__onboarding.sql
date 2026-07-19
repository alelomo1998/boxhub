-- M9: boxes gain a lifecycle; the platform gains runtime settings and a waitlist.

alter table boxes add column status text not null default 'ACTIVE'
    check (status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'));
-- created_at already exists on boxes since V1__init.sql; no column to add here.

-- Runtime platform knobs. NOT box-scoped. Values are text; typed accessors live in code.
create table platform_settings (
    key   text primary key,
    value text not null
);
insert into platform_settings (key, value) values ('signup_mode', 'APPROVAL'), ('max_boxes', '100');

-- Capture-only waitlist for signups past the cap (or while CLOSED).
create table box_waitlist (
    id         uuid primary key default gen_random_uuid(),
    email      text not null unique,
    box_name   text not null,
    created_at timestamptz not null default now()
);
