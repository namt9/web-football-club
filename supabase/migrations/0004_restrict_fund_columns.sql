-- Chặn role `anon` đọc 2 cột nhạy cảm của fund_transactions, để không ai
-- dựng lại được "ai đã đóng, ai chưa" qua REST API bằng anon key.
--
-- Phải revoke ở MỨC BẢNG rồi grant lại theo từng cột. Trong Postgres, quyền
-- mức bảng và mức cột là hai thứ độc lập — chỉ cần một trong hai cho phép là
-- đọc được. Vì anon đang có SELECT mức bảng từ grant mặc định của Supabase,
-- viết `revoke select (member_id) on fund_transactions from anon` sẽ KHÔNG
-- chặn được gì.
--
-- CHỈ chạy sau khi code dùng PUBLIC_COLUMNS đã deploy lên production. Danh
-- sách dưới đây phải khớp chính xác PUBLIC_COLUMNS trong
-- lib/data/fund-transactions.ts.
revoke select on fund_transactions from anon;
grant select (
  id, transaction_type, category, amount, occurred_on, description, match_id, created_at
) on fund_transactions to anon;
