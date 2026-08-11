-- Giai đoạn 2: theo dõi công nợ đóng góp theo tháng.
-- Bảng chỉ lưu NGHĨA VỤ. Số đã đóng và trạng thái luôn tính từ
-- fund_transactions qua FK member_due_id, không lưu cột tổng nào.

create table member_dues (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  -- Kiểu date (không phải timestamptz) nên không mang timezone.
  -- Luôn là ngày 1 của tháng, ràng buộc ngay ở DB.
  period date not null check (period = date_trunc('month', period)::date),
  amount_due numeric(12,2) not null check (amount_due >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique (member_id, period)
);

alter table fund_transactions
  add column member_due_id uuid references member_dues(id) on delete set null;

-- Khác mọi bảng khác của dự án: KHÔNG có policy public read.
alter table member_dues enable row level security;

create policy "admin read member_dues" on member_dues
  for select using (auth.role() = 'authenticated');
create policy "admin write member_dues" on member_dues
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

revoke all on member_dues from anon;

-- Phần thu hồi quyền cột của fund_transactions nằm ở 0004, chạy sau khi code
-- mới đã deploy. Xem Task 9.
