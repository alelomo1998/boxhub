-- Box-level weight unit. WodLine.load is free text with no unit recorded anywhere; the box picks
-- once (KG or LB) and every load field in the UI shows that unit.
alter table boxes add column weight_unit text not null default 'KG';
