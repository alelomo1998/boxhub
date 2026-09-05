-- M29b. One row per recipient per event; the audience is frozen at emit (registry §5.2).
create table notification (
    id            uuid primary key default gen_random_uuid(),
    box_id        uuid not null references boxes(id),
    membership_id uuid not null references memberships(id),
    type          text not null,
    -- Frozen at emit and rendered client-side per type, so strings stay i18n-marked and a class
    -- deleted next week still renders its notification. Never a rendered sentence.
    params        jsonb not null default '{}'::jsonb,
    -- An app ROUTE path, never a URL: M27c resolves a push tap through the same router.
    link          text,
    -- The announcement id for NEW_ANNOUNCEMENT, whose read state lives in announcement_recipient.
    source_id     uuid,
    dedupe_key    text,
    created_at    timestamptz not null default now(),
    -- Always null for NEW_ANNOUNCEMENT: that type delegates (M29b D-3). There is exactly one
    -- read marker per announcement and it is announcement_recipient.read_at.
    read_at       timestamptz
);

create index notification_feed_idx on notification (box_id, membership_id, created_at desc);

-- The guarantee behind SUBSCRIPTION_EXPIRING not firing fourteen nights running, and behind a
-- restarted ClassReminderScheduler not double-firing. The jobs also check before inserting; this
-- index is the safety net, not the control flow.
create unique index notification_dedupe_idx
    on notification (box_id, membership_id, type, dedupe_key)
    where dedupe_key is not null;

-- Sparse: a row exists ONLY where a member overrode the type's default. Absent means "the enum's
-- default", which is what stops a new event from needing a backfill of every member x every type.
create table notification_pref (
    id            uuid primary key default gen_random_uuid(),
    box_id        uuid not null references boxes(id),
    membership_id uuid not null references memberships(id),
    type          text not null,
    -- 'IN_APP' only in M29b. The column exists now so M27c can add 'PUSH' without a migration
    -- and without rebuilding the preferences UI (M29b D-6).
    channel       text not null,
    enabled       boolean not null,
    unique (box_id, membership_id, type, channel)
);

-- Per-box lead time for CLASS_STARTING_SOON.
alter table boxes add column class_reminder_minutes int not null default 60;
