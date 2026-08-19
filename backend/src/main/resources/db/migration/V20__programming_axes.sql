-- M14a: a piece has three independent axes — macro (what part of class), timing (how it runs),
-- score (how it is measured). wod_type was one flat list mixing the first two, with no TABATA at all.

alter table wod add column macro          text;
alter table wod add column timing_preset  text;
alter table wod add column timing_json    jsonb not null default '{"rounds":1,"segments":[]}'::jsonb;
alter table wod add column library        boolean not null default false;

alter table template_piece add column macro         text;
alter table template_piece add column timing_preset text;

-- vocabulary migration, identical for both tables
update wod set
    macro = case wod_type
        when 'WARMUP'   then 'WARMUP'
        when 'STRENGTH' then 'STRENGTH'
        when 'SKILL'    then 'GYMNASTIC'
        else 'WORKOUT'                       -- CIRCUIT, CUSTOM, FOR_TIME, AMRAP, EMOM, INTERVAL
    end,
    timing_preset = case wod_type
        when 'FOR_TIME' then 'FOR_TIME'
        when 'AMRAP'    then 'AMRAP'
        when 'EMOM'     then 'EMOM'
        when 'INTERVAL' then 'INTERVAL'
        else null
    end;

update template_piece set
    macro = case wod_type
        when 'WARMUP'   then 'WARMUP'
        when 'STRENGTH' then 'STRENGTH'
        when 'SKILL'    then 'GYMNASTIC'
        else 'WORKOUT'
    end,
    timing_preset = case wod_type
        when 'FOR_TIME' then 'FOR_TIME'
        when 'AMRAP'    then 'AMRAP'
        when 'EMOM'     then 'EMOM'
        when 'INTERVAL' then 'INTERVAL'
        else null
    end;

-- everything already in the table IS the library; nothing has been attached by copy yet
update wod set library = true;

alter table wod alter column macro set not null;
alter table template_piece alter column macro set not null;

alter table wod drop constraint wod_wod_type_check;   -- created in V7
alter table wod drop column wod_type;
alter table template_piece drop column wod_type;

alter table wod add constraint wod_macro_check
    check (macro in ('WARMUP','STRENGTH','GYMNASTIC','WORKOUT'));
alter table wod add constraint wod_timing_preset_check
    check (timing_preset is null or timing_preset in ('FOR_TIME','AMRAP','EMOM','TABATA','INTERVAL'));
alter table template_piece add constraint template_piece_macro_check
    check (macro in ('WARMUP','STRENGTH','GYMNASTIC','WORKOUT'));
alter table template_piece add constraint template_piece_timing_preset_check
    check (timing_preset is null or timing_preset in ('FOR_TIME','AMRAP','EMOM','TABATA','INTERVAL'));

create index idx_wod_library on wod (box_id, library);

-- score is now EXPLICIT, never derived (spec decision 4). Backfill by applying the OLD derivation
-- rule once, to the value it would have produced, then make the column mandatory.
update session_item si
set score_type = coalesce(si.score_type, case w.timing_preset
        when 'FOR_TIME' then 'TIME'
        when 'AMRAP'    then 'ROUNDS_REPS'
        when 'INTERVAL' then 'ROUNDS_REPS'
        else case w.macro when 'STRENGTH' then 'LOAD' else 'NONE' end
    end)
from wod w
where w.id = si.wod_id;

alter table session_item alter column score_type set not null;
