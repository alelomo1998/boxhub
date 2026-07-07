create table users (
    id            uuid primary key default gen_random_uuid(),
    email         text not null unique,
    password_hash text not null,
    name          text not null,
    created_at    timestamptz not null default now()
);

create table boxes (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    slug       text not null unique,
    timezone   text not null default 'Europe/Rome',
    created_at timestamptz not null default now()
);

create table memberships (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id),
    box_id     uuid not null references boxes (id),
    role       text not null check (role in ('ATHLETE', 'COACH', 'BOX_ADMIN')),
    status     text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
    expires_at date,
    created_at timestamptz not null default now(),
    unique (user_id, box_id)
);
create index idx_memberships_user on memberships (user_id);
create index idx_memberships_box on memberships (box_id);

create table refresh_tokens (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);
