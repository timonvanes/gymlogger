create table if not exists gym_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table gym_state enable row level security;

create policy "Users can view own gym state" on gym_state
  for select using (auth.uid() = user_id);

create policy "Users can insert own gym state" on gym_state
  for insert with check (auth.uid() = user_id);

create policy "Users can update own gym state" on gym_state
  for update using (auth.uid() = user_id);
