-- Task 1 (V9) declared spec_json as jsonb, bound to a Java String field.
-- First write (Task 3) hits "column is of type jsonb but expression is of type varchar" —
-- Hibernate doesn't cast a plain String bind param to jsonb. Switch to text; the column
-- only ever holds an opaque JSON string produced/consumed by the app, never queried in SQL.
alter table class_timers alter column spec_json type text;
