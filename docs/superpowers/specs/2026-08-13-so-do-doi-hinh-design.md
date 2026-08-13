# Thiết kế: Sơ đồ đội hình theo vị trí

**Ngày:** 2026-08-13
**Trạng thái:** Đã thống nhất, chờ chuyển sang implementation plan
**Thuộc:** Giai đoạn 2 của [thiết kế tổng](2026-08-10-quan-ly-doi-bong-phui-design.md)

## 1. Bối cảnh & phạm vi

Giai đoạn 2 còn lại một việc: "sơ đồ vị trí/chiến thuật kéo-thả trên sân" mà thiết kế tổng phác ra. Mục đích thực tế: **chốt đội hình để cả đội biết ai đá vị trí nào**, hiển thị trên trang public trước/trong trận — không phải công cụ chiến thuật vẽ tự do. Độ chính xác cần ở mức "hậu vệ phải", không cần toạ độ pixel.

Ràng buộc quyết định cách làm: người dùng xếp đội hình cả trên điện thoại và máy tính. Kéo-thả tự do bằng ngón tay trên màn hình cảm ứng khó làm mượt mà không cần thư viện chuyên dụng, nên tài liệu này **không dùng kéo-thả** — thay bằng dropdown chọn cầu thủ cho từng vị trí cố định trong một sơ đồ có sẵn (2-3-1, 1-3-2-1...). Đây là thay đổi so với cách thiết kế tổng gọi tên ("kéo-thả"), đã được xác nhận với người dùng.

## 2. Mô hình dữ liệu

```sql
create table match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team text not null check (team in ('A','B')),
  formation text not null,
  created_at timestamptz not null default now(),
  unique (match_id, team)
);

alter table match_participants add column position_slot text;
```

### Vì sao tách bảng thay vì thêm cột vào `matches`

Sơ đồ là thuộc tính của **một đội trong một trận**, không phải của cả trận. Trận nội bộ có 2 đội (A/B), mỗi đội chọn sơ đồ độc lập — team A đá 2-3-1, team B có thể đá 3-2-1. Trận giao hữu chỉ đội mình (team A) có sơ đồ trong hệ thống; đội đối thủ không phải thành viên nên không có participant, không có sơ đồ.

`unique (match_id, team)` đảm bảo mỗi đội trong mỗi trận có đúng một sơ đồ tại một thời điểm — đổi sơ đồ là update, không phải insert thêm dòng.

### Phân quyền

Không có gì nhạy cảm ở đây — đúng pattern chuẩn của dự án, không phải ngoại lệ như `member_dues`:

```sql
alter table match_lineups enable row level security;
create policy "public read match_lineups" on match_lineups for select using (true);
create policy "admin write match_lineups" on match_lineups for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
```

`position_slot` trên `match_participants` không cần policy riêng — cột này nằm trên bảng đã có policy `public read` từ MVP.

### Vì sao `position_slot` thêm vào `match_participants` thay vì bảng nối riêng

`match_participants` đã có sẵn `match_id + member_id + team` từ MVP. Một participant chỉ có thể giữ một vị trí trong sơ đồ của đội mình tại một thời điểm, nên thêm một cột nullable là đủ — không cần bảng thứ ba. `position_slot = null` nghĩa là người đó tham gia trận nhưng chưa được xếp vào sơ đồ (dự bị).

## 3. Sơ đồ là dữ liệu tĩnh trong code, không lưu DB

`formation` trong `match_lineups` là một chuỗi tham chiếu tới danh sách sơ đồ định nghĩa cứng trong `lib/formations.ts`, khoá theo `field_size` (5 hoặc 7 — đúng ràng buộc `check` đã có trên `matches.field_size`):

```ts
export interface FormationSlot {
  key: string      // 'GK' | 'DF1' | 'DF2' | 'MF1' | ...
  label: string     // 'Thủ môn', 'Hậu vệ phải', ...
  top: number        // % từ mép trên sân
  left: number       // % từ mép trái sân
}

export const FORMATIONS: Record<5 | 7, Record<string, FormationSlot[]>> = {
  5: {
    '1-2-1': [ /* GK + 1 DF + 2 MF + 1 FW = 5 ô */ ],
    '2-1-1': [ /* GK + 2 DF + 1 MF + 1 FW = 5 ô */ ],
  },
  7: {
    '2-3-1': [ /* GK + 2 DF + 3 MF + 1 FW = 7 ô */ ],
    '3-2-1': [ /* GK + 3 DF + 2 MF + 1 FW = 7 ô */ ],
  },
}
```

Không cho admin tự vẽ sơ đồ mới — đúng YAGNI vì mục đích chỉ là truyền đạt vị trí. `top`/`left` dùng để đặt tên cầu thủ lên một sân cỏ vẽ bằng CSS (gradient xanh + đường giữa sân), không cần ảnh nào.

Đây là dữ liệu tĩnh giống `MatchType`/`ParticipantTeam` hiện có — không unit test riêng, theo đúng chiến lược test của dự án (chỉ hàm tính toán thuần trong `lib/stats/*` có test đầy đủ).

## 4. Validate

`lib/validations/lineup.ts`:

- `formation` phải là một key hợp lệ trong `FORMATIONS[field_size]` của trận đang xét.
- Mỗi `slot_key` gửi lên trong form phải thuộc đúng danh sách slot của `formation` đã chọn — chặn request tự tạo gửi slot không tồn tại (ví dụ gửi `"DF5"` cho sơ đồ chỉ có `DF1`, `DF2`).
- Một `member_id` không được xuất hiện ở hai `slot_key` khác nhau trong cùng một lần submit (một người không thể đá hai vị trí).
- Mỗi `member_id` gửi lên phải là participant của **đúng đội** (`team`) đang xếp — chặn trường hợp form bị chỉnh sửa để gán một người của team B vào slot của team A.

## 5. Trang & Server Action

### Admin — `/admin/tran-dau/[id]`, thêm section vào trang đã có

Không tạo trang mới. Section "Sơ đồ đội hình" thêm vào trang quản lý trận hiện tại, cạnh section "Người tham gia" đã có.

- Chọn `formation` bằng `<select name="formation">`, có nút "Chọn" riêng để load lại đúng số ô của sơ đồ mới — theo cách trang công nợ đổi kỳ bằng `?ky=` (submit GET, không cần JS).
- Với trận nội bộ: hiện 2 khối, một cho team A một cho team B, mỗi khối tự chọn `formation` độc lập.
- Với trận giao hữu: chỉ hiện khối cho team A ("Đội mình").
- Mỗi ô trong sơ đồ đang chọn là một `<select name="slot_DF1">` (ví dụ), liệt kê participant của đúng đội đó (participant chưa gán slot nào lên đầu danh sách để dễ chọn), option đầu là "-- Bỏ trống --".
- Submit toàn bộ các `<select>` của một đội trong một form → Server Action `setLineup(matchId, team, formData)`. Action ghi đè toàn bộ: update `match_lineups` (tạo mới nếu chưa có, nhờ `upsert` theo `unique (match_id, team)`), rồi set lại `position_slot` cho mọi participant của đội đó — participant không có trong bất kỳ `slot_<key>` nào của lần submit này sẽ bị set `position_slot = null` (rõ ràng, không mồ côi giá trị slot cũ khi đổi sơ đồ).

Không cần Client Component có state: đổi sơ đồ là load lại trang qua query string, chọn cầu thủ cho từng ô là dropdown gốc submit cùng lúc — đúng pattern Server Component đọc + Server Action viết của toàn dự án.

### Public — `/tran-dau/[id]`, thêm khối vào trang đã có

Server Component thuần, không tương tác. Với mỗi đội có `match_lineups`, vẽ sân cỏ CSS và đặt tên participant theo `top/left` của slot họ được gán (`position_slot`). Participant có `position_slot = null` không hiện trên sân — liệt kê riêng dưới dạng "Dự bị" nếu có.

Nếu trận chưa có `match_lineups` (admin chưa xếp), không hiện khối sơ đồ — chỉ hiện danh sách tên như hiện tại (không đổi trang này khi chưa có dữ liệu mới).

## 6. Kiểm thử

- **Unit test (Vitest):** schema Zod ở mục 4 — hợp lệ, sai `formation`, sai `slot_key` ngoài danh sách, trùng `member_id` ở hai slot.
- **Kiểm thử thủ công:** chọn sơ đồ cho một trận nội bộ, gán đủ các ô cho cả 2 đội, xem `/tran-dau/[id]` lúc chưa đăng nhập → đúng tên đúng vị trí; đổi sơ đồ khác cho team A, xác nhận số ô cập nhật và gán lại không ảnh hưởng team B; bỏ trống một slot rồi lưu, xác nhận người đó không còn hiện trên sân (chuyển "Dự bị" hoặc biến mất, không lỗi).

## 7. Ngoài phạm vi

- Kéo-thả tự do bằng toạ độ x/y — thay bằng dropdown theo sơ đồ có sẵn, theo quyết định ở mục 1.
- Cho admin tự định nghĩa sơ đồ mới ngoài danh sách cứng trong code.
- Vị trí động trong trận (thay người, đổi vị trí giữa trận) — đây là "chốt đội hình trước trận", không phải theo dõi real-time.
