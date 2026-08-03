alter table foods
  add column if not exists type text not null default 'meal',
  add column if not exists servings numeric,
  add column if not exists ingredients text;

alter table foods
  alter column source drop not null,
  alter column serving drop not null;

update foods
set type = 'meal'
where type is null or type = '';

alter table foods
  drop constraint if exists foods_type_check;

alter table foods
  add constraint foods_type_check
  check (type in ('meal', 'meal-non-grocery', 'restaurant', 'drink'));
