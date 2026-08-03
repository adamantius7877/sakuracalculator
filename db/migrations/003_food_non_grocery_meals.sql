alter table foods
  drop constraint if exists foods_type_check;

alter table foods
  add constraint foods_type_check
  check (type in ('meal', 'meal-non-grocery', 'restaurant', 'drink'));
