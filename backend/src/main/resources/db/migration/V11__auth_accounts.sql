-- M8: accounts become real — verified, recoverable, revocable.

-- users: verification, durable brute-force backoff, passwordless (Google-only) users.
alter table users add column email_verified  boolean     not null default false;
alter table users add column failed_attempts int         not null default 0;
alter table users add column throttled_until timestamptz;
alter table users add column updated_at      timestamptz not null default now();
alter table users alter column password_hash drop not null;

-- Every account that exists today got in via a trusted path (DB seed or the invite chain).
update users set email_verified = true;

-- Federated identities. Google today; Apple later needs no migration.
create table auth_identity (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references users (id) on delete cascade,
    provider         text not null,
    provider_subject text not null,
    email            text not null,
    created_at       timestamptz not null default now(),
    unique (provider, provider_subject)
);
create index idx_auth_identity_user on auth_identity (user_id);

-- Refresh tokens gain families. Rows are now MARKED consumed, never deleted —
-- that is what makes reuse detection possible: replaying a consumed token is
-- evidence of theft, so the whole family dies.
alter table refresh_tokens add column family_id    uuid;
alter table refresh_tokens add column consumed_at  timestamptz;
alter table refresh_tokens add column revoked_at   timestamptz;
alter table refresh_tokens add column user_agent   text;
alter table refresh_tokens add column ip           text;
alter table refresh_tokens add column last_used_at timestamptz;
update refresh_tokens set family_id = gen_random_uuid() where family_id is null;
alter table refresh_tokens alter column family_id set not null;
create index idx_refresh_family on refresh_tokens (family_id);
create index idx_refresh_user   on refresh_tokens (user_id);

-- Single-use, hashed-at-rest tokens for verify / reset / email-change.
create table email_token (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references users (id) on delete cascade,
    type        text not null check (type in ('VERIFY', 'RESET', 'EMAIL_CHANGE')),
    token_hash  text not null unique,
    new_email   text,
    expires_at  timestamptz not null,
    consumed_at timestamptz,
    created_at  timestamptz not null default now()
);
create index idx_email_token_user on email_token (user_id);
