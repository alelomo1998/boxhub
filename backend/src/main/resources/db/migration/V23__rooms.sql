-- M22 spec §5 / D11. The "where" axis, which did not exist: class_type (what) ->
-- schedule_slot (when) -> class_sessions (the instance) had no room at all.
--
-- room_id is added to class_sessions NOW rather than in Phase 4 because bookings has an FK to
-- class_sessions: adding it later is a migration against live booking data.
--
-- Deliberately NO room.capacity — class capacity stays authoritative and two capacities with
-- nothing deciding which wins is a question every later surface would answer differently.

create table room (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes (id) on delete cascade,
    name       text not null,
    active     boolean not null default true,
    created_at timestamptz not null default now()
);
create index idx_room_box on room (box_id);

-- Nullable: rooms are OPTIONAL. A single-space box never sets one and nothing changes for it.
alter table schedule_slot  add column room_id uuid references room (id);
alter table class_sessions add column room_id uuid references room (id);
