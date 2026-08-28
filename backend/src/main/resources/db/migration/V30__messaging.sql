-- M29a: staff<->member messaging, a staff shared inbox, and announcements grown up.
-- docs/superpowers/specs/2026-08-28-m29a-messaging-design.md
--
-- Tenancy note (spec §4): every table here is @TenantId on the entity side, which is BOX-scoping,
-- not MEMBER-scoping. Both sides of a member-to-member leak sit in the same box, so the tenant
-- filter passes it. Member scoping is enforced in the repository finders and proved by the
-- cross-member-denied tests. The schema cannot enforce it; do not assume it does.

-- ── announcement: one overwritten row per box becomes append-only history ─────
-- V7 gave box_id a UNIQUE constraint, which is exactly what "one row, overwritten" meant.
-- History requires many rows per box, so it goes. Postgres named it announcement_box_id_key.
alter table announcement drop constraint announcement_box_id_key;

-- Renamed rather than re-added: the columns already hold the right values, and "updated" is a lie
-- once rows are never updated again.
alter table announcement rename column updated_at to sent_at;
alter table announcement rename column updated_by to sent_by;

alter table announcement add column segment text not null default 'EVERYONE';
alter table announcement alter column segment drop default;
alter table announcement add column segment_ref uuid references class_sessions(id);
alter table announcement add constraint announcement_segment_check
    check (segment in ('EVERYONE','CLASS_ROSTER','EXPIRING'));
-- CLASS_ROSTER is the only segment that names a target; the other two must not carry a stale one.
alter table announcement add constraint announcement_segment_ref_check
    check ((segment = 'CLASS_ROSTER') = (segment_ref is not null));

create index idx_announcement_box_sent on announcement(box_id, sent_at desc);

-- ── announcement_recipient: the audience, frozen at send (D-2) ───────────────
create table announcement_recipient (
    id              uuid primary key default gen_random_uuid(),
    box_id          uuid not null references boxes(id),
    announcement_id uuid not null references announcement(id) on delete cascade,
    membership_id   uuid not null references memberships(id),
    read_at         timestamptz,
    constraint uq_announcement_recipient unique (announcement_id, membership_id)
);
create index idx_ann_recipient_membership on announcement_recipient(membership_id);

-- ── message_thread: exactly one per member per box (D-1) ─────────────────────
create table message_thread (
    id                      uuid primary key default gen_random_uuid(),
    box_id                  uuid not null references boxes(id),
    membership_id           uuid not null references memberships(id),
    created_at              timestamptz not null default now(),
    last_message_at         timestamptz,
    last_message_from_staff boolean not null default false,
    member_last_read_at     timestamptz,
    -- ONE marker, shared by every staff member (D-3). Coach A reading clears it for the team.
    staff_last_read_at      timestamptz,
    constraint uq_message_thread_member unique (box_id, membership_id)
);
create index idx_message_thread_inbox on message_thread(box_id, last_message_at desc);

-- ── message ─────────────────────────────────────────────────────────────────
create table message (
    id                   uuid primary key default gen_random_uuid(),
    box_id               uuid not null references boxes(id),
    thread_id            uuid not null references message_thread(id) on delete cascade,
    sender_membership_id uuid not null references memberships(id),
    -- Stored, never derived from the sender's CURRENT role: a message sent as a member stays a
    -- member message after that person is promoted to coach. Same reasoning as the frozen audience.
    sender_side          text not null check (sender_side in ('MEMBER','STAFF')),
    body                 text not null,
    created_at           timestamptz not null default now()
);
create index idx_message_thread_created on message(thread_id, created_at);

-- ── backfill: no existing announcement is lost to this migration ─────────────
-- Every pre-M29a row was, by construction, box-wide and addressed to everyone. It becomes one
-- EVERYONE send (the column default above already set segment), fanned out to the box's ACTIVE
-- memberships so it keeps appearing on athlete home, which now reads through recipient rows.
insert into announcement_recipient (box_id, announcement_id, membership_id)
select a.box_id, a.id, m.id
  from announcement a
  join memberships m on m.box_id = a.box_id and m.status = 'ACTIVE';
