alter table wod_score add column logged_by uuid;

create table class_timers (
    id uuid primary key default gen_random_uuid(),
    box_id uuid not null,
    session_id uuid not null references class_sessions(id),
    session_item_id uuid,
    spec_json jsonb not null,
    status text not null default 'PENDING' check (status in ('PENDING','RUNNING','PAUSED','DONE')),
    started_at_epoch bigint,
    paused_elapsed_ms bigint not null default 0,
    updated_at timestamptz not null default now()
);
create unique index class_timers_session_key on class_timers (session_id);
