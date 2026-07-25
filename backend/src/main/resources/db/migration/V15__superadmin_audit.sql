-- M11: minimal append-only record of superadmin lifecycle actions.
create table superadmin_audit (
    id           uuid primary key default gen_random_uuid(),
    actor_email  text        not null,
    action       text        not null check (action in
                   ('APPROVE','REJECT','SUSPEND','REACTIVATE','SETTINGS_CHANGE')),
    box_id       uuid references boxes (id) on delete set null,
    detail       text,
    created_at   timestamptz not null default now()
);
create index idx_superadmin_audit_created on superadmin_audit (created_at desc);
