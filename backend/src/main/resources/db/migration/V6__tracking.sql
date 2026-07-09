create table wod_score (
    id            uuid primary key default gen_random_uuid(),
    box_id        uuid not null references boxes(id),
    slot_id       uuid not null references program_slot(id),
    membership_id uuid not null references memberships(id) on delete cascade,
    rx            boolean not null default true,
    time_seconds  int,
    rounds        int,
    reps          int,
    load          numeric(7,2),
    finished      boolean not null default true,
    notes         text,
    private       boolean not null default false,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (box_id, slot_id, membership_id)
);
create index idx_score_slot on wod_score (box_id, slot_id);

create table lift_entry (
    id            uuid primary key default gen_random_uuid(),
    box_id        uuid not null references boxes(id),
    membership_id uuid not null references memberships(id) on delete cascade,
    movement_id   uuid not null references movement(id),
    load          numeric(7,2) not null,
    reps          int not null default 1,
    performed_on  date not null,
    notes         text,
    is_pr         boolean not null default false,
    created_at    timestamptz not null default now()
);
create index idx_lift_prog on lift_entry (box_id, membership_id, movement_id, performed_on);
