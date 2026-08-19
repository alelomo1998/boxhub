-- M22 spec §4. These tables are deliberately NOT @TenantId: the public directory reads them
-- across many boxes at once, and under M21 a @TenantId read cannot do that (runAsBox is one
-- box, runAsRoot is jobs-only). Safe here because the tables are WHOLLY public — there is no
-- private box-profile data to leak through a missed predicate. See docs/TENANCY.md §4.

alter table boxes
    add column published   boolean not null default false,
    add column description text,
    add column street      text,
    add column city        text,
    add column region      text,
    add column postcode    text,
    add column country     text,
    add column lat         double precision,
    add column lng         double precision;

create table box_photo (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes (id) on delete cascade,
    path       text not null,
    sort_order int  not null default 0,
    created_at timestamptz not null default now()
);
create index idx_box_photo_box on box_photo (box_id, sort_order);

-- Rows rather than open/close columns on boxes: a box can have split hours (morning AND
-- evening) on the same weekday, which is normal in Italy.
create table box_hours (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes (id) on delete cascade,
    weekday    int  not null check (weekday between 0 and 6),
    open_time  time not null,
    close_time time not null,
    constraint ck_box_hours_order check (close_time > open_time)
);
create index idx_box_hours_box on box_hours (box_id, weekday);

-- Directory filtering, and the bounding-box prefilter that replaces PostGIS (spec D8).
create index idx_boxes_directory on boxes (published, country, city) where published;
create index idx_boxes_geo on boxes (lat, lng) where published;
