-- M29a AMENDMENT A1: messaging becomes person-to-person.
-- docs/superpowers/specs/2026-08-28-m29a-messaging-design.md, "AMENDMENT A1"
--
-- DROP AND RECREATE, not migrate. V30's thread had ONE member and a staff side that was not a
-- person, so there is no counterpart to map an existing row onto. This is acceptable only because
-- rxed has NO PRODUCTION DEPLOYMENT: docs/VPS-DEPLOYMENT.md records the OVH target as
-- pre-production with open blockers, and V30 was applied in dev, against seeded data, on
-- 2026-08-29. Announcement tables are deliberately untouched.
drop table if exists message;
drop table if exists message_thread;

-- A conversation is an unordered PAIR of memberships. The pair is stored in canonical order and a
-- check constraint enforces it, so the plain unique constraint below genuinely means "one thread
-- per pair" — the database guarantees it rather than application care.
create table message_thread (
    id              uuid primary key default gen_random_uuid(),
    box_id          uuid not null references boxes(id),
    member_lo_id    uuid not null references memberships(id),
    member_hi_id    uuid not null references memberships(id),
    created_at      timestamptz not null default now(),
    last_message_at timestamptz,
    -- Replaces V30's last_message_from_staff: "needs reply" is now viewer-relative
    -- ("the last message is not mine") and stays DERIVED, never stored.
    last_sender_membership_id uuid references memberships(id),
    -- Per participant, replacing D-3's single shared staff marker, which no longer means anything.
    lo_last_read_at timestamptz,
    hi_last_read_at timestamptz,
    constraint message_thread_pair_order check (member_lo_id < member_hi_id),
    constraint uq_message_thread_pair unique (box_id, member_lo_id, member_hi_id)
);
create index idx_message_thread_lo on message_thread(box_id, member_lo_id, last_message_at desc);
create index idx_message_thread_hi on message_thread(box_id, member_hi_id, last_message_at desc);

create table message (
    id                   uuid primary key default gen_random_uuid(),
    box_id               uuid not null references boxes(id),
    thread_id            uuid not null references message_thread(id) on delete cascade,
    sender_membership_id uuid not null references memberships(id),
    -- V30's sender_side is GONE: ownership is sender_membership_id == viewer, so the column would
    -- be a dead field (the defect MemberController documents for planId).
    body                 text not null,
    created_at           timestamptz not null default now()
);
create index idx_message_thread_created on message(thread_id, created_at);
