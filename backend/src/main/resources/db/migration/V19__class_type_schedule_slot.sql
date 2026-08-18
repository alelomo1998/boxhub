-- M14a: class identity splits from its weekly slot. class_templates held both, which is why no page
-- can describe a class and no class can be scheduled twice. No production deployment exists (see V7),
-- so this transforms dev data in place rather than carrying a backfill strategy.

create table class_type (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references boxes(id),
    name       text not null,
    image_path text,
    created_at timestamptz not null default now(),
    unique (box_id, name)
);
create index idx_class_type_box on class_type (box_id);

create table schedule_slot (
    id            uuid primary key default gen_random_uuid(),
    box_id        uuid not null references boxes(id),
    class_type_id uuid not null references class_type(id) on delete cascade,
    weekday       int  not null check (weekday between 0 and 6),
    start_time    time not null,
    duration_min  int  not null check (duration_min > 0),
    capacity      int  not null check (capacity > 0),
    coach_id      uuid references users(id),
    active        boolean not null default true
);
create index idx_slot_box_active on schedule_slot (box_id, active);

-- one class_type per distinct (box, name); image_path takes an arbitrary member's value
insert into class_type (box_id, name, image_path)
select box_id, name, min(image_path)
from class_templates
group by box_id, name;

-- one slot per existing template row
insert into schedule_slot (id, box_id, class_type_id, weekday, start_time, duration_min, capacity, coach_id, active)
select t.id, t.box_id, ct.id, t.weekday, t.start_time, t.duration_min, t.capacity, t.coach_id, t.active
from class_templates t
join class_type ct on ct.box_id = t.box_id and ct.name = t.name;

-- template_piece belongs to the class type, not to a slot
alter table template_piece add column class_type_id uuid references class_type(id) on delete cascade;
update template_piece tp
set class_type_id = ss.class_type_id
from schedule_slot ss
where ss.id = tp.template_id;
alter table template_piece alter column class_type_id set not null;
alter table template_piece drop constraint template_piece_box_id_template_id_sort_order_key;
alter table template_piece drop column template_id;
alter table template_piece add unique (box_id, class_type_id, sort_order);

-- class_sessions points at the slot it was generated from; it remains a SNAPSHOT of the rest
alter table class_sessions drop constraint class_sessions_template_id_fkey;
alter table class_sessions rename column template_id to schedule_slot_id;
alter table class_sessions
    add constraint class_sessions_schedule_slot_id_fkey
    foreign key (schedule_slot_id) references schedule_slot(id) on delete set null;

drop table class_templates;
