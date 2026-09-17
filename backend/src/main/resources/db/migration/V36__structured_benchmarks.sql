-- M14c-b R2 (spec D20/D21): structure the 18 global benchmark templates' blocks_json so the same
-- movement picker / load-unit conversion that works for a coach-written piece works for a
-- benchmark. One block per benchmark; each line's movementId is a scalar subquery into V5's global
-- movement catalogue, resolved by exact name. Loads are stored in lb (the source unit); WodService
-- converts to kg per-box on clone (D22).

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', '21-15-9 for time', 'note', 'Rx 95/65 lb · 43/29 kg', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Thruster', 'movementId', (select id::text from movement where box_id is null and name = 'Thruster'), 'reps', '21-15-9', 'unit', 'REPS', 'load', '95'),
        jsonb_build_object('text', 'Pull-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Pull-Up'), 'reps', '21-15-9', 'unit', 'REPS')
    ))
)) where name = 'Fran';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', 'For time', 'note', 'Rx 135/95 lb · 61/43 kg', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Clean and Jerk', 'movementId', (select id::text from movement where box_id is null and name = 'Clean and Jerk'), 'reps', '30', 'unit', 'REPS', 'load', '135')
    ))
)) where name = 'Grace';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', 'For time', 'note', 'Rx 135/95 lb · 61/43 kg', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Snatch', 'movementId', (select id::text from movement where box_id is null and name = 'Snatch'), 'reps', '30', 'unit', 'REPS', 'load', '135')
    ))
)) where name = 'Isabel';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', '3 rounds for time', 'note', 'Rx 1.5/1 pood · 24/16 kg', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Run', 'movementId', (select id::text from movement where box_id is null and name = 'Run'), 'reps', '400', 'unit', 'M'),
        jsonb_build_object('text', 'Kettlebell Swing', 'movementId', (select id::text from movement where box_id is null and name = 'Kettlebell Swing'), 'reps', '21', 'unit', 'REPS', 'load', '53'),
        jsonb_build_object('text', 'Pull-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Pull-Up'), 'reps', '12', 'unit', 'REPS')
    ))
)) where name = 'Helen';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', 'AMRAP 20', 'note', null, 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Pull-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Pull-Up'), 'reps', '5', 'unit', 'REPS'),
        jsonb_build_object('text', 'Push-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Push-Up'), 'reps', '10', 'unit', 'REPS'),
        jsonb_build_object('text', 'Air Squat', 'movementId', (select id::text from movement where box_id is null and name = 'Air Squat'), 'reps', '15', 'unit', 'REPS')
    ))
)) where name = 'Cindy';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', '21-15-9 for time', 'note', 'Rx 225/155 lb · 102/70 kg', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Deadlift', 'movementId', (select id::text from movement where box_id is null and name = 'Deadlift'), 'reps', '21-15-9', 'unit', 'REPS', 'load', '225'),
        jsonb_build_object('text', 'Handstand Push-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Handstand Push-Up'), 'reps', '21-15-9', 'unit', 'REPS')
    ))
)) where name = 'Diane';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', '21-15-9 for time', 'note', 'Rx 135/95 lb · 61/43 kg', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Clean', 'movementId', (select id::text from movement where box_id is null and name = 'Clean'), 'reps', '21-15-9', 'unit', 'REPS', 'load', '135'),
        jsonb_build_object('text', 'Ring Dip', 'movementId', (select id::text from movement where box_id is null and name = 'Ring Dip'), 'reps', '21-15-9', 'unit', 'REPS')
    ))
)) where name = 'Elizabeth';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', 'For time', 'note', 'Rx 20/14 lb · 9/6 kg', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Wall Ball', 'movementId', (select id::text from movement where box_id is null and name = 'Wall Ball'), 'reps', '150', 'unit', 'REPS', 'load', '20')
    ))
)) where name = 'Karen';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', '50-40-30-20-10 for time', 'note', null, 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Double-Under', 'movementId', (select id::text from movement where box_id is null and name = 'Double-Under'), 'reps', '50-40-30-20-10', 'unit', 'REPS'),
        jsonb_build_object('text', 'Sit-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Sit-Up'), 'reps', '50-40-30-20-10', 'unit', 'REPS')
    ))
)) where name = 'Annie';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', 'For time', 'note', null, 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Pull-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Pull-Up'), 'reps', '100', 'unit', 'REPS'),
        jsonb_build_object('text', 'Push-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Push-Up'), 'reps', '100', 'unit', 'REPS'),
        jsonb_build_object('text', 'Sit-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Sit-Up'), 'reps', '100', 'unit', 'REPS'),
        jsonb_build_object('text', 'Air Squat', 'movementId', (select id::text from movement where box_id is null and name = 'Air Squat'), 'reps', '100', 'unit', 'REPS')
    ))
)) where name = 'Angie';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', '5 rounds', 'note', 'Rest 3 min between rounds', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Pull-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Pull-Up'), 'reps', '20', 'unit', 'REPS'),
        jsonb_build_object('text', 'Push-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Push-Up'), 'reps', '30', 'unit', 'REPS'),
        jsonb_build_object('text', 'Sit-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Sit-Up'), 'reps', '40', 'unit', 'REPS'),
        jsonb_build_object('text', 'Air Squat', 'movementId', (select id::text from movement where box_id is null and name = 'Air Squat'), 'reps', '50', 'unit', 'REPS')
    ))
)) where name = 'Barbara';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', '5 rounds for time', 'note', 'Rx 95/65 lb · 43/29 kg', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Run', 'movementId', (select id::text from movement where box_id is null and name = 'Run'), 'reps', '400', 'unit', 'M'),
        jsonb_build_object('text', 'Overhead Squat', 'movementId', (select id::text from movement where box_id is null and name = 'Overhead Squat'), 'reps', '15', 'unit', 'REPS', 'load', '95')
    ))
)) where name = 'Nancy';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', 'For time', 'note', 'Wear a 20/14 lb (9/6 kg) vest', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Run', 'movementId', (select id::text from movement where box_id is null and name = 'Run'), 'reps', '1', 'unit', 'MI'),
        jsonb_build_object('text', 'Pull-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Pull-Up'), 'reps', '100', 'unit', 'REPS'),
        jsonb_build_object('text', 'Push-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Push-Up'), 'reps', '200', 'unit', 'REPS'),
        jsonb_build_object('text', 'Air Squat', 'movementId', (select id::text from movement where box_id is null and name = 'Air Squat'), 'reps', '300', 'unit', 'REPS'),
        jsonb_build_object('text', 'Run', 'movementId', (select id::text from movement where box_id is null and name = 'Run'), 'reps', '1', 'unit', 'MI')
    ))
)) where name = 'Murph';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', '5 rounds for time', 'note', 'Rx 155/105 lb · 70/48 kg', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Deadlift', 'movementId', (select id::text from movement where box_id is null and name = 'Deadlift'), 'reps', '12', 'unit', 'REPS', 'load', '155'),
        jsonb_build_object('text', 'Hang Power Clean', 'movementId', (select id::text from movement where box_id is null and name = 'Hang Power Clean'), 'reps', '9', 'unit', 'REPS', 'load', '155'),
        jsonb_build_object('text', 'Push Jerk', 'movementId', (select id::text from movement where box_id is null and name = 'Push Jerk'), 'reps', '6', 'unit', 'REPS', 'load', '155')
    ))
)) where name = 'DT';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', '21-15-9 for time', 'note', null, 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Handstand Push-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Handstand Push-Up'), 'reps', '21-15-9', 'unit', 'REPS'),
        jsonb_build_object('text', 'Ring Dip', 'movementId', (select id::text from movement where box_id is null and name = 'Ring Dip'), 'reps', '21-15-9', 'unit', 'REPS'),
        jsonb_build_object('text', 'Push-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Push-Up'), 'reps', '21-15-9', 'unit', 'REPS')
    ))
)) where name = 'JT';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', '3 rounds for time', 'note', null, 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Run', 'movementId', (select id::text from movement where box_id is null and name = 'Run'), 'reps', '800', 'unit', 'M'),
        jsonb_build_object('text', 'Back Extension', 'movementId', (select id::text from movement where box_id is null and name = 'Back Extension'), 'reps', '50', 'unit', 'REPS'),
        jsonb_build_object('text', 'Sit-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Sit-Up'), 'reps', '50', 'unit', 'REPS')
    ))
)) where name = 'Michael';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', 'For time', 'note', '20 in box · wear a 45/35 lb (20/16 kg) ruck', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Step-Up', 'movementId', (select id::text from movement where box_id is null and name = 'Step-Up'), 'reps', '1000', 'unit', 'REPS')
    ))
)) where name = 'Chad';

update benchmark_template set blocks_json = jsonb_build_object('blocks', jsonb_build_array(
    jsonb_build_object('label', 'For time', 'note', 'Rx 75/55 lb · 34/25 kg', 'lines', jsonb_build_array(
        jsonb_build_object('text', 'Power Snatch', 'movementId', (select id::text from movement where box_id is null and name = 'Power Snatch'), 'reps', '75', 'unit', 'REPS', 'load', '75')
    ))
)) where name = 'Randy';

-- Guard: every line's movementId must have resolved. A name typo above would silently write a
-- null id instead of failing the migration, so fail loudly instead.
do $$ begin
    if exists (
        select 1 from benchmark_template, jsonb_path_query(blocks_json, '$.blocks[*].lines[*]') l
        where l ->> 'movementId' is null
    ) then
        raise exception 'benchmark movement missing';
    end if;
end $$;

-- D21: saved library pieces that only ever held plain text. Class copies are never touched, and
-- a row anything still points at is kept: session_item and post reference wod without a cascade.
-- (program_slot named in the plan was dropped by V7__class_model.sql — the M5 class-centric model
-- superseded it with session_item; there is nothing left to guard there.)
delete from wod w
 where w.library = true
   and jsonb_array_length(coalesce(w.blocks_json->'blocks', '[]'::jsonb)) = 0
   and btrim(w.body_text) <> ''
   and not exists (select 1 from session_item i where i.wod_id = w.id)
   and not exists (select 1 from post p where p.wod_id = w.id);
