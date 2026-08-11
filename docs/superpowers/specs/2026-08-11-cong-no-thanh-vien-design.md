# Thiết kế: Theo dõi công nợ đóng góp theo tháng

**Ngày:** 2026-08-11
**Trạng thái:** Đã thống nhất, chờ chuyển sang implementation plan
**Thuộc:** Giai đoạn 2 của [thiết kế tổng](2026-08-10-quan-ly-doi-bong-phui-design.md)

## 1. Bối cảnh & phạm vi

Giai đoạn 1 (MVP) đã xong: quỹ đội chỉ theo dõi được **tổng** thu chi. Thủ quỹ vẫn phải nhớ ngoài hệ thống xem tháng này ai đã đóng, ai chưa. Tính năng này lấp chỗ đó.

Giai đoạn 2 trong spec tổng gồm hai hệ thống **độc lập** — sơ đồ vị trí kéo-thả và công nợ theo tháng. Chúng khác bảng, khác trang, không dùng chung logic, nên mỗi hệ thống có một vòng spec → plan → implement riêng. Tài liệu này **chỉ nói về công nợ**. Sơ đồ kéo-thả sẽ có spec riêng sau.

Phạm vi:
- Tạo nghĩa vụ đóng góp cho cả đội theo từng tháng.
- Ghi nhận ai đã đóng, đóng bao nhiêu, và số tiền đó chảy vào sổ quỹ.
- Xem tổng nợ lũy kế của từng thành viên qua mọi kỳ.
- Toàn bộ chỉ admin thấy.

## 2. Mô hình dữ liệu

```sql
create table member_dues (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  period date not null check (period = date_trunc('month', period)::date),
  amount_due numeric(12,2) not null check (amount_due >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique (member_id, period)
);

alter table fund_transactions
  add column member_due_id uuid references member_dues(id) on delete set null;
```

### Nguyên tắc: bảng chỉ lưu nghĩa vụ

`member_dues` **không có** cột "đã đóng" và **không có** cột "trạng thái", dù spec tổng ở mục 3 có phác ra. Cả hai đều tính từ `fund_transactions` tại thời điểm truy vấn, đúng nguyên tắc xuyên suốt dự án là không lưu số liệu tổng. Một khoản tiền chỉ tồn tại ở một chỗ duy nhất nên không bao giờ lệch giữa sổ quỹ và bảng công nợ.

### `period` dùng kiểu `date`, không phải `timestamptz`

Mốc là ngày 1 của tháng (`2026-09-01` cho kỳ tháng 9/2026). Kiểu `date` không mang timezone nên không lặp lại được lỗi timezone đã gặp ở `matches.scheduled_at`, nơi chuỗi không có offset bị Postgres hiểu theo timezone của session.

Ràng buộc `check (period = date_trunc('month', period)::date)` chặn ở tầng DB việc lưu một ngày giữa tháng.

### Vì sao cần `member_due_id` thay vì suy ra từ `occurred_on`

Nếu ghép một giao dịch với một kỳ bằng cách xem `occurred_on` rơi vào tháng nào, thì người đóng tiền tháng 9 vào đầu tháng 10 sẽ bị tính sang kỳ tháng 10 — vừa làm kỳ 9 hiện thiếu, vừa làm kỳ 10 hiện dư. FK tường minh xoá hẳn sự nhập nhằng đó, và cho phép đóng bù nhiều tháng trong cùng một ngày.

Một giao dịch đóng quỹ set cả `member_id` (đã có từ MVP) và `member_due_id` (mới).

## 3. Quyền đọc — phá pattern có chủ ý

Mọi bảng hiện có đều theo cặp policy "public read + admin write". Bảng này **không**, vì spec tổng mục 4 và CLAUDE.md đều yêu cầu công nợ cá nhân không được lộ ra ngoài.

```sql
alter table member_dues enable row level security;

create policy "admin read member_dues" on member_dues
  for select using (auth.role() = 'authenticated');
create policy "admin write member_dues" on member_dues
  for all using (auth.role() = 'authenticated');

revoke all on member_dues from anon;

-- Chặn anon đọc 2 cột nhạy cảm của fund_transactions.
revoke select on fund_transactions from anon;
grant select (
  id, transaction_type, category, amount, occurred_on, description, match_id, created_at
) on fund_transactions to anon;
```

Cặp `revoke` rồi `grant` lại theo từng cột là bắt buộc, không viết gọn được thành `revoke select (member_id) ... from anon`. Trong Postgres, quyền mức bảng và quyền mức cột là hai thứ độc lập — chỉ cần một trong hai cho phép là đọc được. Role `anon` đang có `SELECT` mức bảng từ grant mặc định của Supabase, nên revoke lẻ từng cột sẽ không chặn được gì.

Phần phân quyền này là chỗ dễ bị bỏ sót nhưng quan trọng nhất. Anon key nằm trong bundle client nên bất kỳ ai cũng gọi được REST API của Supabase trực tiếp. Nếu `anon` còn đọc được `fund_transactions.member_id`, họ join sang `members` là dựng lại đủ danh sách ai đã đóng ai chưa — đúng thứ spec muốn tránh, dù trang `/quy` không render thông tin đó. Chặn ở tầng DB thì trang public render gì cũng không lộ được.

**Hệ quả cần sửa:** `lib/data/fund-transactions.ts` đang dùng `select('*')`, sẽ lỗi với role `anon` sau khi revoke. Phải liệt kê tường minh các cột an toàn: `id, transaction_type, category, amount, occurred_on, description, match_id, created_at`. Hàm đọc cho admin cần đủ cột thì tách thành hàm riêng.

## 4. Tính toán — hàm thuần trong `lib/stats/member-dues.ts`

Đây là phần duy nhất của tính năng có unit test đầy đủ, theo chiến lược test của spec tổng mục 6.

```ts
interface DuesRow {
  memberId: string
  fullName: string
  amountDue: number
  amountPaid: number
  status: 'unpaid' | 'partial' | 'paid'
}

function computeDuesForPeriod(
  dues: MemberDue[],          // chỉ các nghĩa vụ của MỘT kỳ, do caller lọc trước
  payments: FundTransaction[], // có thể chứa giao dịch của mọi kỳ
  members: Pick<Member, 'id' | 'full_name'>[]
): DuesRow[]

function computeOutstandingByMember(
  dues: MemberDue[],          // nghĩa vụ của MỌI kỳ
  payments: FundTransaction[]
): Map<string, number>
```

Cả hai hàm ghép giao dịch với nghĩa vụ **chỉ qua `member_due_id`**, không bao giờ qua `member_id` hay `occurred_on`. Nhờ vậy truyền vào danh sách giao dịch rộng hơn cần thiết cũng không sai kết quả: giao dịch không trỏ tới nghĩa vụ nào trong `dues` thì bị bỏ qua. Giao dịch có `member_due_id = null` (khoản thu gộp từ MVP, khoản chi) cũng vì thế mà không ảnh hưởng gì.

Cần thêm type `MemberDue` vào `lib/types.ts` khớp schema, và thêm `member_due_id` vào type `FundTransaction` đã có.

`status` suy ra từ số tiền, không lưu:

| Điều kiện | Trạng thái |
|---|---|
| `amountPaid = 0` | `unpaid` |
| `0 < amountPaid < amountDue` | `partial` |
| `amountPaid >= amountDue` | `paid` |

`computeOutstandingByMember` trả về `sum(amount_due) - sum(payments)` trên mọi kỳ của từng người. Vì tính trên tổng nên đóng dư ở một kỳ tự động bù cho kỳ còn thiếu — không cần xử lý riêng.

Các trường hợp biên phải có test:
- Không có kỳ nào → danh sách rỗng, không phải lỗi.
- Nhiều giao dịch trong cùng một kỳ → cộng dồn.
- Đóng nhiều hơn số phải đóng → `paid`, và tổng nợ giảm xuống dưới 0 nếu đó là kỳ duy nhất.
- Thành viên có trong danh sách nhưng không có nghĩa vụ kỳ đó → không xuất hiện trong kết quả của kỳ đó.
- Giao dịch có `member_due_id` trỏ tới kỳ khác → không được tính vào kỳ đang xem.
- `amount_due = 0` (miễn đóng) → `paid` ngay, không phải `unpaid`.

## 5. Trang & Server Actions

Một trang mới `/admin/cong-no`, thêm link "Công nợ" vào nav trong `app/admin/layout.tsx`. **Không sửa trang public nào** ngoài câu query ở mục 3.

Trang gồm:
- Dropdown chọn kỳ trong các kỳ đã tạo, mặc định kỳ mới nhất.
- Form tạo kỳ: `<input type="month">` + một mức tiền áp cho cả đội.
- Bảng thành viên của kỳ đang chọn: tên, số phải đóng (sửa được), ô tick "đã đóng", ô nhập số tiền (mặc định bằng số phải đóng), trạng thái, và cột tổng nợ lũy kế.

Server Actions trong `app/admin/cong-no/actions.ts`:

| Action | Hành vi |
|---|---|
| `createPeriod` | Sinh nghĩa vụ cho mọi thành viên `active` ở kỳ được chọn. Chạy lại trên kỳ đã tồn tại thì **chỉ thêm người còn thiếu**, không sửa số tiền của người đã có — nhờ vậy thành viên mới vào đội giữa kỳ được bổ sung mà không phá dữ liệu cũ. |
| `recordPayments` | Submit cả bảng một lần. Với mỗi người được tick mà **chưa có** giao dịch cho kỳ đó, tạo một `fund_transactions` loại `income`, số tiền lấy từ ô nhập của chính dòng đó, gắn `member_id` + `member_due_id`. Người đã đóng thì bỏ qua. |
| `undoPayment` | Xoá các giao dịch đã gắn với một nghĩa vụ, dùng khi bấm nhầm. |
| `updateAmountDue` | Sửa số phải đóng của một người ở một kỳ (miễn, đóng nửa). |
| `deletePeriod` | Xoá cả kỳ, **chỉ khi kỳ đó chưa có giao dịch nào** — để không làm mồ côi tiền thật đã vào quỹ. |

`recordPayments` bỏ qua người đã có giao dịch nên submit lại nhiều lần không thu tiền hai lần. Đây là lý do chọn kiểu submit cả bảng (giống `setParticipants` đã có) thay vì mỗi người một form.

Bỏ tick **không** xoá giao dịch — muốn hoàn tác phải bấm `undoPayment` tường minh, để một lần submit vô ý không xoá tiền đã ghi nhận.

## 6. Validation

`lib/validations/member-due.ts`, dùng trong mọi action trước khi ghi:

- `createPeriodSchema`: kỳ từ `<input type="month">` (dạng `"2026-09"`) → ghép thành `"2026-09-01"` bằng nối chuỗi, **không qua `new Date()`**; số tiền `>= 0`.
- `paymentSchema`: `member_due_id` là uuid, số tiền `> 0`, `occurred_on` là ngày.

Kỳ trùng đã bị `unique (member_id, period)` chặn ở DB; action phải bắt lỗi đó và trả thông báo tiếng Việt rõ ràng thay vì để lỗi Postgres nổi lên.

## 7. Kiểm thử

- **Unit test (Vitest):** hai hàm ở mục 4, đủ các trường hợp biên đã liệt kê.
- **Kiểm thử thủ công:** tạo kỳ → tick vài người → mở `/quy` ở cửa sổ chưa đăng nhập, xác nhận số dư đã tăng nhưng **không** thấy tên ai.
- **Kiểm thử phân quyền bằng anon key**, gọi thẳng REST API của Supabase. Hai cơ chế khác nhau nên kết quả mong đợi cũng khác nhau:

| Truy vấn | Kết quả đúng | Vì sao |
|---|---|---|
| `member_dues?select=*` | `[]` (mảng rỗng, **không** phải lỗi) | RLS không có policy nào cho `anon` nên lọc sạch mọi dòng |
| `fund_transactions?select=member_id` | lỗi `42501 permission denied for column member_id` | quyền mức cột đã bị thu hồi |
| `fund_transactions?select=*` | lỗi `42501` | `*` bung ra gồm cả cột đã bị thu hồi — đây chính là lý do code public phải liệt kê cột tường minh |
| `fund_transactions?select=id,amount` | có dữ liệu | các cột an toàn vẫn đọc được bình thường |

Bước thứ hai là bắt buộc — nó là thứ duy nhất chứng minh mục 3 thực sự có hiệu lực. Lưu ý dòng thứ nhất trả về mảng rỗng chứ không báo lỗi, nên nếu chỉ kiểm tra "có lỗi hay không" thì sẽ tưởng là chưa được bảo vệ.

## 8. Ngoài phạm vi

- Sơ đồ vị trí/chiến thuật kéo-thả — hệ thống độc lập, có spec riêng ở vòng sau.
- Hiển thị công nợ cá nhân trên trang public — cố ý không bao giờ làm.
- Nhắc nợ tự động qua email/Zalo, xuất báo cáo, nghĩa vụ theo chu kỳ khác tháng (theo trận, theo quý).
