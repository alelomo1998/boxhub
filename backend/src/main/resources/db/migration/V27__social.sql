-- M22 spec §8. post is @TenantId because it holds BOTH public and box-only rows: drop the
-- discriminator only when the WHOLE table is public (box_photo is; post is not). The public
-- feed is one registered native query whose WHERE says visibility = 'PUBLIC' — M25 writes it.
--
-- Comment threading is deliberately NOT modelled: it is an open product question, and a thread
-- model built against no screen is what the Phase 1 rule forbids.

create table post (
    id                   uuid primary key default gen_random_uuid(),
    box_id               uuid not null references boxes (id) on delete cascade,
    author_membership_id uuid not null references memberships (id),
    wod_id               uuid references wod (id),
    caption              text,
    visibility           text not null check (visibility in ('PUBLIC', 'BOX')),
    created_at           timestamptz not null default now()
);
create index idx_post_box_created  on post (box_id, created_at desc);
create index idx_post_public       on post (created_at desc) where visibility = 'PUBLIC';

create table post_like (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes (id) on delete cascade,
    post_id    uuid not null references post (id) on delete cascade,
    user_id    uuid not null references users (id) on delete cascade,
    created_at timestamptz not null default now(),
    constraint uq_post_like unique (post_id, user_id)
);
create index idx_post_like_post on post_like (post_id);

-- The 1-5 dumbbell rating (M25).
create table wod_rating (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes (id) on delete cascade,
    wod_id     uuid not null references wod (id) on delete cascade,
    user_id    uuid not null references users (id) on delete cascade,
    rating     int  not null check (rating between 1 and 5),
    created_at timestamptz not null default now(),
    constraint uq_wod_rating unique (wod_id, user_id)
);
create index idx_wod_rating_wod on wod_rating (wod_id);
