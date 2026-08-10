create extension if not exists pgcrypto;

create table members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  jersey_number integer,
  position text check (position in ('GK','DF','MF','FW')),
  phone text,
  photo_url text,
  joined_at date not null default current_date,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  match_type text not null check (match_type in ('internal','friendly')),
  field_size integer not null check (field_size in (5,7)),
  scheduled_at timestamptz not null,
  location text not null,
  opponent_name text,
  team_a_score integer,
  team_b_score integer,
  status text not null default 'upcoming' check (status in ('upcoming','completed','cancelled')),
  created_at timestamptz not null default now()
);

create table match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  team text not null default 'A' check (team in ('A','B')),
  confirmation text not null default 'pending' check (confirmation in ('pending','confirmed','declined')),
  unique (match_id, member_id)
);

create table match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  event_type text not null check (event_type in ('goal','assist')),
  minute integer check (minute is null or (minute >= 0 and minute <= 120))
);

create table fund_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null check (transaction_type in ('income','expense')),
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null,
  description text,
  match_id uuid references matches(id) on delete set null,
  member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table members enable row level security;
alter table matches enable row level security;
alter table match_participants enable row level security;
alter table match_events enable row level security;
alter table fund_transactions enable row level security;

create policy "public read members" on members for select using (true);
create policy "admin write members" on members for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "public read matches" on matches for select using (true);
create policy "admin write matches" on matches for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "public read match_participants" on match_participants for select using (true);
create policy "admin write match_participants" on match_participants for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "public read match_events" on match_events for select using (true);
create policy "admin write match_events" on match_events for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "public read fund_transactions" on fund_transactions for select using (true);
create policy "admin write fund_transactions" on fund_transactions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
