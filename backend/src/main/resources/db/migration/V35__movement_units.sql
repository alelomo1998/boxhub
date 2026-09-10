-- A movement declares how it is measured (units, preference order, first is default) and whether
-- it takes a load at all. Fixes: assault bike offered a reps box, burpees offered a load box.
--
-- ponytail: comma-separated text, not text[] -- at most 3 entries, so no JPA array converter and
-- no Hibernate type contribution buys anything. Upgrade path if a movement ever needs many: a real
-- array column, or a join table.
alter table movement add column units text not null default 'REPS';
alter table movement add column loadable boolean not null default false;

-- Category defaults
update movement set units = 'REPS', loadable = true  where box_id is null and category in ('BARBELL','DUMBBELL','KETTLEBELL','ODD_OBJECT');
update movement set units = 'REPS', loadable = false where box_id is null and category in ('GYMNASTICS','MONOSTRUCTURAL');

-- Machines: calories by default, distance and time both available, no load.
-- No miles on a rower or ski erg -- no such machine displays them. Bikes do.
update movement set units = 'CAL,M,KM,MI,SEC', loadable = false
 where box_id is null and name in ('Assault Bike','Echo Bike','BikeErg');
update movement set units = 'CAL,M,KM,SEC', loadable = false
 where box_id is null and name in ('Row','SkiErg');

-- Running and swimming: metric first, imperial present because a US box needs it, no load.
update movement set units = 'M,KM,MI,FT,SEC', loadable = false
 where box_id is null and name = 'Run';
update movement set units = 'M,KM,MI,SEC', loadable = false
 where box_id is null and name = 'Swim';
-- Shuttle runs are often counted as lengths, hence REPS.
update movement set units = 'M,FT,REPS,SEC', loadable = false
 where box_id is null and name = 'Shuttle Run';

-- Skipping: reps by default, time available for a timed effort, no load.
update movement set units = 'REPS,SEC', loadable = false
 where box_id is null and name in ('Double-Under','Single-Under');

-- Sleds: a distance and a weight, both.
update movement set units = 'M,FT,SEC', loadable = true
 where box_id is null and name in ('Sled Push','Sled Pull');

-- Carries: distance or time, always loaded.
update movement set units = 'M,FT,SEC', loadable = true
 where box_id is null and name in ('Farmers Carry','Sandbag Carry','Yoke Carry','Kettlebell Front Rack Carry');

-- Gymnastics measured by distance. REPS present on the walk/crawl because they're often
-- programmed as lengths; REPS leads on the jump/inchworm because those are counted first.
update movement set units = 'M,FT,REPS', loadable = false
 where box_id is null and name in ('Handstand Walk','Bear Crawl');
update movement set units = 'REPS,M,FT', loadable = false
 where box_id is null and name in ('Broad Jump','Inchworm');

-- Gymnastics measured by time.
update movement set units = 'SEC', loadable = false
 where box_id is null and name in ('Plank','L-Sit');
update movement set units = 'REPS,SEC', loadable = false
 where box_id is null and name = 'Hollow Rock';

-- Lunges: reps or a distance, whichever the coach writes. Loaded variants named as such.
update movement set units = 'REPS,M,FT', loadable = false
 where box_id is null and name in ('Lunge','Walking Lunge');
update movement set units = 'REPS,M,FT', loadable = true
 where box_id is null and name in ('Front Rack Lunge','Overhead Lunge','Dumbbell Lunge');

-- Odd objects worked for time.
update movement set units = 'SEC,REPS', loadable = true
 where box_id is null and name = 'Rope Undulation';
