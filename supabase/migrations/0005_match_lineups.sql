-- Giai đoạn 2: sơ đồ đội hình theo vị trí cho từng trận.
-- Sơ đồ (formation) là chuỗi tham chiếu tới danh sách cứng trong
-- lib/formations.ts — không lưu toạ độ tự do trong DB.

create table match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team text not null check (team in ('A','B')),
  formation text not null,
  created_at timestamptz not null default now(),
  unique (match_id, team)
);

alter table match_participants add column position_slot text;

-- Không nhạy cảm — theo đúng pattern public-read của mọi bảng khác, khác
-- với member_dues.
alter table match_lineups enable row level security;

create policy "public read match_lineups" on match_lineups for select using (true);
create policy "admin write match_lineups" on match_lineups
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
