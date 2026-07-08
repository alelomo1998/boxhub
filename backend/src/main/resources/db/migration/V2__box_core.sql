alter table boxes add column logo_url text;

create table plans (
    id                 uuid primary key default gen_random_uuid(),
    box_id             uuid not null references boxes (id),
    name               text not null,
    duration_days      int  not null default 30 check (duration_days > 0),
    weekly_class_limit int check (weekly_class_limit > 0),
    archived           boolean not null default false,
    created_at         timestamptz not null default now(),
    unique (box_id, name)
);
create index idx_plans_box on plans (box_id);

alter table memberships add column plan_id uuid references plans (id);

create table invites (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes (id),
    email      text not null,
    role       text not null check (role in ('ATHLETE', 'COACH', 'BOX_ADMIN')),
    plan_id    uuid references plans (id),
    token_hash text not null unique,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    created_by uuid not null references users (id),
    created_at timestamptz not null default now()
);
create index idx_invites_box on invites (box_id);

-- BACKLOG decision: deleting a user removes their memberships (GDPR hard delete);
-- box deletion stays RESTRICT (archive flow later).
alter table memberships
    drop constraint memberships_user_id_fkey,
    add constraint memberships_user_id_fkey
        foreign key (user_id) references users (id) on delete cascade;
