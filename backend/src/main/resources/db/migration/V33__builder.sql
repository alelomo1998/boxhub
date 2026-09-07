-- M14c-a, the builder.
--
-- source_wod_id is what makes tour decision 4 real: "a block is local to its class unless
-- explicitly saved to the library; re-saving an edited local block updates in place". Without a
-- link back to the row it came from, "in place" has nothing to point at and every save mints
-- another library row -- which is the unbounded-growth bug this milestone closes.
alter table wod add column source_wod_id uuid references wod(id) on delete set null;

-- Team authoring. team_share is null exactly when team_size = 1.
alter table wod add column team_size  int  not null default 1;
alter table wod add column team_share text;

-- A team result is N rows sharing a team_id -- one per member, each keeping its own membership_id.
-- Every leaderboard, history and analytics read keys on membership_id and is untouched by this,
-- and unique (box_id, session_item_id, membership_id) still holds: one athlete, one result.
alter table wod_score add column team_id   uuid;
alter table wod_score add column team_name text;

create index idx_score_team on wod_score (box_id, team_id);
