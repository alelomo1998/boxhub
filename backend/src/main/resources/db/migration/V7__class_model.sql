-- M5: class-centric model. No production deployment exists — the M3 slot/track model is
-- dropped and demo data (scores) is wiped; the dev seeder rebuilds on the new model.

-- programming attaches to the class instance (a generated class_session)
create table session_item (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes(id),
    session_id uuid not null references class_sessions(id) on delete cascade,
    wod_id     uuid not null references wod(id),
    sort_order int  not null,
    scoreable  boolean not null default false,
    score_type text,                                -- null = derive from wod.wod_type
    created_at timestamptz not null default now(),
    unique (box_id, session_id, sort_order)
);
create index idx_item_session on session_item (box_id, session_id);

-- skeleton placeholders on the class type (label + piece type only; pre-seeds the builder)
create table template_piece (
    id          uuid primary key default gen_random_uuid(),
    box_id      uuid not null references boxes(id),
    template_id uuid not null references class_templates(id) on delete cascade,
    sort_order  int  not null,
    label       text not null,
    wod_type    text not null,
    unique (box_id, template_id, sort_order)
);

alter table class_sessions add column programming_status text not null default 'DRAFT'
    check (programming_status in ('DRAFT','PUBLISHED'));
alter table class_templates add column image_path text;
alter table memberships add column avatar_path text;
alter table memberships add column private boolean not null default false;

create table announcement (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes(id) unique,
    body       text not null,
    updated_by uuid references users(id),
    updated_at timestamptz not null default now()
);

-- piece types: warmup / circuit / skill join the existing set
alter table wod drop constraint wod_wod_type_check;
alter table wod add constraint wod_wod_type_check check (wod_type in
    ('FOR_TIME','AMRAP','EMOM','INTERVAL','STRENGTH','CUSTOM','WARMUP','CIRCUIT','SKILL'));

-- scores move to items; existing demo rows are dropped with the table
drop table wod_score;
create table wod_score (
    id              uuid primary key default gen_random_uuid(),
    box_id          uuid not null references boxes(id),
    session_item_id uuid not null references session_item(id) on delete cascade,
    membership_id   uuid not null references memberships(id) on delete cascade,
    rx              boolean not null default true,
    time_seconds    int,
    rounds          int,
    reps            int,
    load            numeric(7,2),
    finished        boolean not null default true,
    notes           text,
    private         boolean not null default false,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (box_id, session_item_id, membership_id)
);
create index idx_score_item on wod_score (box_id, session_item_id);

-- retire the M3 date+track programming lane
drop table program_slot;
drop table track;
