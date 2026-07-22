create table if not exists app_settings (
  id integer primary key check (id = 1),
  active_profile_id text,
  fdc_api_key text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists user_profiles (
  id text primary key,
  name text not null,
  profile jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists foods (
  id text primary key,
  name text not null,
  source text not null,
  serving text not null,
  calories numeric not null,
  protein numeric,
  carbs numeric,
  fat numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists log_entries (
  id text primary key,
  profile_id text not null references user_profiles(id) on delete cascade,
  food_id text references foods(id) on delete set null,
  name text not null,
  serving text not null,
  quantity numeric not null,
  calories numeric not null,
  entry_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists log_entries_profile_date_idx
  on log_entries (profile_id, entry_date desc);
