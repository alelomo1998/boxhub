-- Global movement catalog (box_id null) + per-box custom movements. NOT tenant-discriminated:
-- reads must return globals to every box, so this table is intentionally not @TenantId.
create table movement (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid references boxes(id),                       -- null = global seed
    name       text not null,
    category   text not null check (category in
                 ('BARBELL','GYMNASTICS','MONOSTRUCTURAL','DUMBBELL','KETTLEBELL','ODD_OBJECT','OTHER')),
    modality   text,
    active     boolean not null default true,
    created_at timestamptz not null default now()
);
-- unique name within global (box_id null) and within each box, case-insensitive
create unique index uq_movement_global on movement (lower(name)) where box_id is null;
create unique index uq_movement_box on movement (box_id, lower(name)) where box_id is not null;
create index idx_movement_box on movement (box_id);

-- Global read-only benchmark templates (girls + heroes). Not tenant-scoped.
create table benchmark_template (
    id               uuid primary key default gen_random_uuid(),
    name             text not null unique,
    kind             text not null check (kind in ('GIRL','HERO','OTHER')),
    score_type       text not null check (score_type in ('TIME','ROUNDS_REPS','LOAD','NONE')),
    time_cap_seconds int,
    body_text        text not null,
    blocks_json      jsonb not null default '{"blocks":[]}'
);

create table track (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes(id),
    name       text not null,
    sort_order int  not null default 0,
    archived   boolean not null default false,
    created_at timestamptz not null default now(),
    unique (box_id, name)
);
create index idx_track_box on track (box_id);

create table wod (
    id                    uuid primary key default gen_random_uuid(),
    box_id                uuid not null references boxes(id),
    title                 text not null,
    wod_type              text not null check (wod_type in
                            ('FOR_TIME','AMRAP','EMOM','INTERVAL','STRENGTH','CUSTOM')),
    score_type            text not null check (score_type in ('TIME','ROUNDS_REPS','LOAD','NONE')),
    time_cap_seconds      int,
    body_text             text not null default '',
    blocks_json           jsonb not null default '{"blocks":[]}',
    scaling_notes         text,
    benchmark_template_id uuid references benchmark_template(id),  -- provenance for M4
    created_by            uuid references users(id),
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);
create index idx_wod_box on wod (box_id);

create table program_slot (
    id           uuid primary key default gen_random_uuid(),
    box_id       uuid not null references boxes(id),
    slot_date    date not null,
    track_id     uuid not null references track(id),
    wod_id       uuid not null references wod(id),
    status       text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED')),
    published_at timestamptz,
    created_by   uuid references users(id),
    created_at   timestamptz not null default now(),
    unique (box_id, slot_date, track_id)
);
create index idx_slot_box_date on program_slot (box_id, slot_date);
