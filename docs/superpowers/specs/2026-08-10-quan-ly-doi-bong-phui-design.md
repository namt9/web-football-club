# Thiết kế: Website Quản lý Đội bóng Phủi

**Ngày:** 2026-08-10
**Trạng thái:** Đã thống nhất, chờ chuyển sang implementation plan

## 1. Bối cảnh & phạm vi

Website nội bộ cho **một đội bóng phủi duy nhất** (không phải sản phẩm multi-tenant), đá sân 5 người hoặc 7 người. Chỉ 1-3 admin (ban quản lý đội: thủ quỹ/trưởng đội) đăng nhập để nhập liệu; các thành viên khác và người ngoài xem thông tin qua các trang public không cần đăng nhập.

Tính năng chính:
- Quản lý thành viên
- Quản lý quỹ, thu chi, công nợ đóng góp theo từng thành viên
- Tạo danh sách thi đấu + sơ đồ vị trí/chiến thuật
- Quản lý trận đấu (sắp tới, đã diễn ra), hỗ trợ cả trận nội bộ (chia 2 đội) và giao hữu với đội ngoài
- Thống kê bàn thắng/kiến tạo, cầu thủ nổi bật

## 2. Kiến trúc tổng quan

- **Next.js 14+ (App Router, TypeScript)**: một app duy nhất — vừa render trang public (SSR), vừa cung cấp API routes cho phần admin.
- **Supabase**: Postgres (dữ liệu), Auth (đăng nhập email/password cho admin), Storage (ảnh thành viên/logo đội).
- **Deploy**: Vercel (free tier) cho app, Supabase Cloud (free tier) cho DB/Auth/Storage.
- **Phân quyền**: chỉ một role "admin". Middleware Next.js chặn truy cập `/admin/*` khi chưa đăng nhập, redirect về trang login. Tất cả route còn lại là public, read-only.

## 3. Mô hình dữ liệu

| Bảng | Mục đích | Trường chính |
|---|---|---|
| `members` | Thành viên đội | id, họ tên, số áo, vị trí sở trường (GK/DF/MF/FW), số điện thoại, ảnh, ngày tham gia, trạng thái active/inactive |
| `fund_transactions` | Sổ thu chi quỹ | id, loại (thu/chi), hạng mục, số tiền, ngày, mô tả, `match_id` (nullable), `member_id` (nullable) |
| `member_dues` | Công nợ đóng góp theo kỳ, riêng cho admin theo dõi | id, member_id, kỳ (tháng/năm), số tiền phải đóng, đã đóng, trạng thái |
| `matches` | Trận đấu | id, loại (nội bộ/giao hữu), ngày giờ, địa điểm, loại sân (5/7 người), đối thủ (nullable), tỷ số, trạng thái (sắp tới/đã diễn ra/hủy) |
| `match_participants` | Người tham gia 1 trận | id, match_id, member_id, đội (A/B, dùng cho trận nội bộ), xác nhận tham gia |
| `lineup_positions` | Sơ đồ vị trí trên sân (Giai đoạn 2) | id, match_id, member_id, x, y, team (A/B) |
| `match_events` | Bàn thắng/kiến tạo | id, match_id, member_id, loại (bàn thắng/kiến tạo), phút (nullable) |

Nguyên tắc: số dư quỹ và thống kê ghi bàn luôn **tính toán (aggregate) tại thời điểm truy vấn** từ dữ liệu gốc (`fund_transactions`, `match_events`), không lưu số liệu tổng riêng — tránh lệch số liệu khi sửa/xóa giao dịch cũ.

## 4. Trang & tính năng

### Trang public (không cần đăng nhập)
- `/` — Trang chủ: trận sắp tới gần nhất, số dư quỹ, top ghi bàn.
- `/lich-thi-dau` — Danh sách trận sắp tới + đã diễn ra, lọc theo loại/trạng thái.
- `/tran-dau/[id]` — Chi tiết 1 trận: đội hình, sơ đồ vị trí (Giai đoạn 2), tỷ số, ghi bàn/kiến tạo.
- `/thanh-vien` — Danh sách thành viên (thông tin cơ bản).
- `/thong-ke` — Bảng xếp hạng ghi bàn/kiến tạo, số trận đã đá theo từng người.
- `/quy` — Số dư quỹ + lịch sử thu chi. **Không hiển thị công nợ cá nhân** (ai đang nợ ai) — thông tin này chỉ admin xem, để tránh nhạy cảm.

### Trang admin (`/admin/*`, cần đăng nhập)
- Quản lý thành viên (CRUD).
- Quản lý thu chi quỹ + theo dõi công nợ từng thành viên theo tháng (Giai đoạn 2 cho phần công nợ chi tiết).
- Tạo/sửa trận đấu, chọn người tham gia, chia đội A/B (trận nội bộ).
- Sơ đồ đội hình kéo-thả cầu thủ vào vị trí trên sân 5 hoặc 7 người (2 layout khác nhau tùy loại sân) — Giai đoạn 2.
- Nhập kết quả trận (tỷ số, ghi bàn/kiến tạo từng cầu thủ) sau khi đá xong.

## 5. Xử lý lỗi & validation

- Validate dữ liệu nhập (thu chi, trận đấu, thành viên) bằng schema Zod dùng chung cho cả client và server (API routes), tránh trùng lặp logic.
- Middleware Next.js bảo vệ toàn bộ `/admin/*`.

## 6. Kiểm thử

Quy mô nhỏ (1-3 người dùng nội bộ), không cần bộ test tự động lớn:
- Unit test (Vitest) cho các hàm tính toán quan trọng: số dư quỹ, xếp hạng ghi bàn/kiến tạo.
- Kiểm thử thủ công các luồng chính (tạo trận, nhập kết quả, thêm thu chi, xem trang public) trước khi đưa vào dùng thật.

## 7. Phân giai đoạn triển khai

**Giai đoạn 1 (MVP):**
- Auth admin
- Quản lý thành viên
- Quản lý trận đấu: tạo/sửa/xem lịch, chọn người tham gia, chia đội A/B, nhập tỷ số + ghi bàn/kiến tạo
- Quản lý quỹ: thu chi + số dư
- Toàn bộ trang public (lịch thi đấu, kết quả, quỹ, thống kê ghi bàn, thành viên)

**Giai đoạn 2 (mở rộng):**
- Sơ đồ vị trí/chiến thuật kéo-thả trên sân (5 người / 7 người)
- Theo dõi công nợ chi tiết theo tháng/từng thành viên (bảng `member_dues` đầy đủ + UI đánh dấu đã đóng/chưa đóng)

Lý do tách: sơ đồ kéo-thả là phần UI phức tạp nhất trong toàn bộ dự án; tách riêng để MVP hoàn thành nhanh và đưa vào dùng thử sớm.
