-- Chicken Brûlée — Database Schema
-- Run this in Supabase SQL Editor to set up tables and Row Level Security

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users primary key,
  server_name text default '',
  created_at timestamptz default now()
);

-- Bot configurations (one per user)
create table if not exists public.bot_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  bot_token text not null,
  channels jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- Scans (one per scan run)
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  channel_ids text[] default '{}',
  messages_fetched int default 0,
  observations_found int default 0,
  started_at timestamptz default now(),
  completed_at timestamptz
);

-- Observations (classified messages)
create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  scan_id uuid references public.scans on delete cascade,
  message_id text not null,
  timestamp timestamptz not null,
  channel_id text not null,
  channel_name text not null,
  kind text not null default 'observation', -- observation | staff | engagement
  speaker text not null,
  role text not null default 'Player',
  theme text not null,
  signal text not null,
  severity text not null default 'Medium',
  excerpt text not null,
  paraphrase text default '',
  unique(user_id, message_id)
);

-- Row Level Security: each user only sees their own data
alter table public.profiles enable row level security;
alter table public.bot_configs enable row level security;
alter table public.scans enable row level security;
alter table public.observations enable row level security;

create policy "profiles_self" on public.profiles
  for all using (auth.uid() = id);

create policy "bot_configs_self" on public.bot_configs
  for all using (auth.uid() = user_id);

create policy "scans_self" on public.scans
  for all using (auth.uid() = user_id);

create policy "observations_self" on public.observations
  for all using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
