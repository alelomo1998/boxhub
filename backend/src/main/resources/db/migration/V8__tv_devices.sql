-- V8__tv_devices.sql
create table tv_devices (
    id uuid primary key default gen_random_uuid(),
    box_id uuid references boxes(id),
    name text,
    pairing_code text,
    secret_hash text not null,
    status text not null default 'PENDING' check (status in ('PENDING','ACTIVE','REVOKED')),
    last_seen_at timestamptz,
    created_at timestamptz not null default now()
);
create unique index tv_devices_pairing_code_key on tv_devices (pairing_code) where pairing_code is not null;
