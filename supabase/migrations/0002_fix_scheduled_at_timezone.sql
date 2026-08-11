-- Sửa dữ liệu: các trận tạo trước khi có `vietnamLocalToIso` bị lưu sai 7 tiếng.
--
-- Nguyên nhân: form dùng `<input type="datetime-local">` gửi chuỗi không có
-- offset (ví dụ `2026-08-15T17:00`). Cột `scheduled_at` là `timestamptz`, nên
-- Postgres hiểu chuỗi đó theo timezone của session — Supabase mặc định UTC.
-- Kết quả: giờ Việt Nam admin nhập bị lưu thành giờ UTC (muộn hơn 7 tiếng).
--
-- Chỉ có đúng 1 trận bị ảnh hưởng tại thời điểm sửa. Câu UPDATE dưới đây gán
-- giá trị tuyệt đối (không phải `- interval '7 hours'`) để chạy nhiều lần vẫn
-- cho cùng kết quả.
--
-- Trận "Giao hữu vs Đội của sân": admin nhập 17:00 ngày 15/8/2026 (giờ VN),
-- tương ứng 10:00 UTC. DB đang lưu 17:00 UTC.
update matches
set scheduled_at = '2026-08-15T10:00:00+00:00'
where id = '3ead81b0-a323-44bc-827d-abc47936f1c0';

-- Kiểm tra lại: cột giờ VN phải ra 2026-08-15 17:00.
-- select id, scheduled_at, scheduled_at at time zone 'Asia/Ho_Chi_Minh' as gio_vn from matches;
