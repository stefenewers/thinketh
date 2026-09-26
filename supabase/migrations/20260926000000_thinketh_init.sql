-- Thinketh app/orchestration data. Supabase owns auth, profile, feature flags
-- and integration-id mapping only; corpus lives in MongoDB Atlas and temporal
-- knowledge history lives in Tiger Data.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  interests jsonb not null default '[]'::jsonb,
  goals text[] not null default '{}',
  explanation_preferences text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Feature flags: readable by signed-in users, writable only with the service role.
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text
);

alter table public.feature_flags enable row level security;

create policy "feature_flags: read" on public.feature_flags
  for select to authenticated using (true);

insert into public.feature_flags (key, enabled, description) values
  ('voice', false, 'Catch Me Up voice (ElevenLabs). Enable only once stable on a dev build.'),
  ('ask', true, 'Ask Thinketh'),
  ('visualize', true, 'Visualize This'),
  ('make_it_stick', true, 'Make It Stick'),
  ('storylines', true, 'Storyline view')
on conflict (key) do nothing;

-- Sponsor integration ids (e.g. Backboard assistant per user). user_id is text
-- so the seeded demo persona ("demo-user") can be mapped too. No policies:
-- only the service role (server) can read or write it.
create table if not exists public.integration_ids (
  user_id text not null,
  provider text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.integration_ids enable row level security;
