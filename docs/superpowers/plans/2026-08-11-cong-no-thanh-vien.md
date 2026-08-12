# Công nợ Thành viên theo Tháng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho admin tạo nghĩa vụ đóng quỹ theo tháng cho cả đội, ghi nhận ai đã đóng bao nhiêu (tiền chảy thẳng vào sổ quỹ), và xem tổng nợ lũy kế từng người — toàn bộ chỉ admin thấy được.

**Architecture:** Bảng mới `member_dues` chỉ lưu **nghĩa vụ**; số đã đóng và trạng thái luôn tính tại thời điểm truy vấn từ `fund_transactions` qua FK mới `member_due_id`. Đọc bằng Server Component, viết bằng Server Action, validate bằng Zod, mọi tính toán tổng hợp là hàm thuần có unit test — đúng pattern đã có của dự án. Điểm khác biệt duy nhất: dữ liệu này nhạy cảm nên chặn ở tầng DB, không dùng policy "public read" như các bảng khác.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Supabase (Postgres + RLS + column grants), Zod, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-11-cong-no-thanh-vien-design.md`

## Global Constraints

- Một đội duy nhất, không multi-tenant — không có `organization_id` ở bất kỳ bảng nào.
- Chỉ một role "admin". Cổng ghi duy nhất là `auth.role() = 'authenticated'`.
- **Không lưu số liệu tổng.** Số đã đóng, trạng thái, tổng nợ đều tính từ dữ liệu gốc mỗi lần truy vấn.
- **Công nợ cá nhân không bao giờ hiển thị công khai**, và cũng không được đọc được qua anon key. Trang `/quy` chỉ hiện tổng thu/chi + lịch sử giao dịch.
- Ghép giao dịch với nghĩa vụ **chỉ qua `member_due_id`** — không bao giờ qua `member_id` hay tháng của `occurred_on`.
- Kỳ đóng góp dùng kiểu `date` (ngày 1 của tháng). **Không dùng `timestamptz` cho kỳ**, và không parse chuỗi kỳ bằng `new Date()` — dự án đã có một lần lỗi timezone vì chuỗi không offset bị hiểu theo timezone session.
- Copy UI tiếng Việt, nhất quán với các trang hiện có (`Thu`/`Chi`, `Nội bộ`/`Giao hữu`, `Sắp tới`/`Đã diễn ra`).
- Không thêm route `/api/*`.

## File Structure

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/0003_member_dues.sql` | Bảng `member_dues`, cột `fund_transactions.member_due_id`, RLS |
| `supabase/migrations/0004_restrict_fund_columns.sql` | Thu hồi quyền đọc 2 cột nhạy cảm khỏi role `anon` — chạy **sau** khi code đã deploy |
| `lib/types.ts` (sửa) | Thêm `MemberDue`, `PublicFundTransaction`; thêm `member_due_id` vào `FundTransaction` |
| `lib/data/fund-transactions.ts` (sửa) | Tách hàm đọc public (liệt kê cột) và hàm đọc admin (`*`) |
| `lib/stats/fund-balance.ts` (sửa) | Nới kiểu tham số để nhận được cả bản public |
| `lib/stats/member-dues.ts` | Hàm thuần: dòng công nợ theo kỳ + tổng nợ lũy kế |
| `lib/validations/member-due.ts` | Zod schema cho tạo kỳ, ghi nhận đóng tiền, sửa số phải đóng |
| `lib/data/member-dues.ts` | Đọc kỳ, nghĩa vụ, giao dịch đóng quỹ |
| `app/admin/cong-no/page.tsx` | Trang admin: chọn kỳ, tạo kỳ, bảng công nợ |
| `app/admin/cong-no/actions.ts` | 5 Server Action |
| `app/admin/layout.tsx` (sửa) | Thêm link "Công nợ" vào nav |

---

### Task 1: Migration, phân quyền, và types

**Files:**
- Create: `supabase/migrations/0003_member_dues.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: bảng `member_dues`; cột `fund_transactions.member_due_id`; type `MemberDue`, `PublicFundTransaction`; field `member_due_id` trên `FundTransaction`.

> **Thứ tự có chủ ý:** migration này **không** chạm tới quyền đọc của `fund_transactions`, nên apply xong production vẫn chạy bình thường với code cũ. Phần thu hồi quyền cột nằm ở migration `0004`, cố ý để lại Task 9 — chạy sau khi code mới đã deploy. Dự án chỉ có một Supabase project dùng chung cho local và production, nên revoke sớm sẽ làm site đang sống lỗi 500 ngay.

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/0003_member_dues.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration (thủ công, ngoài repo)**

Mở Supabase Dashboard → SQL Editor, dán toàn bộ nội dung file trên, bỏ chọn hết text (SQL Editor chỉ chạy phần đang được bôi đen nếu có), nhấn Run.

- [ ] **Step 3: Kiểm tra bảng đã tạo và anon không đọc được**

```bash
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)
KEY=$(grep ANON_KEY .env.local | cut -d= -f2)

echo "--- member_dues bang anon key (mong doi: [] ) ---"
curl -s "$URL/rest/v1/member_dues?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
echo; echo "--- fund_transactions van doc duoc binh thuong ---"
curl -s "$URL/rest/v1/fund_transactions?select=id,amount" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Mong đợi: truy vấn đầu trả **lỗi `42501 permission denied for table member_dues`**; truy vấn sau vẫn có dữ liệu, chứng tỏ migration này chưa chạm gì tới quyền của bảng cũ.

Lý do là lỗi chứ không phải `[]`: `revoke all on member_dues from anon` chặn ngay ở tầng privilege, trước khi RLS kịp chạy. Bảng này có **hai** lớp bảo vệ độc lập — thiếu grant, và không có policy nào cho `anon`. Giữ cả hai là có chủ ý: mọi bảng khác trong repo đều dùng policy `using (true)`, nên khả năng cao nhất là sau này có người copy pattern đó sang đây; lúc đó việc thiếu grant vẫn chặn được.

Bảng còn rỗng nên bước này **chưa chứng minh được RLS đang chặn** (chỉ chứng minh privilege đang chặn). Bằng chứng cho lớp RLS nằm ở Task 10.

- [ ] **Step 3b: Kiểm tra production vẫn sống**

```bash
curl -s -o /dev/null -w "/ %{http_code}\n" https://web-football-club.vercel.app/
curl -s -o /dev/null -w "/quy %{http_code}\n" https://web-football-club.vercel.app/quy
```

Mong đợi: cả hai `200`. Nếu ra 500 thì migration đã chạm vào quyền của `fund_transactions` — kiểm tra lại đã bỏ đúng phần `revoke select on fund_transactions` khỏi file 0003 chưa.

- [ ] **Step 4: Thêm types**

Sửa `lib/types.ts` — thêm `member_due_id` vào interface `FundTransaction` đã có:

```ts
export interface FundTransaction {
  id: string
  transaction_type: TransactionType
  category: string
  amount: number
  occurred_on: string
  description: string | null
  match_id: string | null
  member_id: string | null
  member_due_id: string | null
  created_at: string
}

/** Bản mà role `anon` được phép đọc — thiếu 2 cột nhạy cảm. */
export type PublicFundTransaction = Omit<FundTransaction, 'member_id' | 'member_due_id'>
```

Và thêm ở cuối file:

```ts
export interface MemberDue {
  id: string
  member_id: string
  /** Dạng 'YYYY-MM-DD', luôn là ngày 1 của tháng. */
  period: string
  amount_due: number
  note: string | null
  created_at: string
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_member_dues.sql lib/types.ts
git commit -m "feat: add member_dues table with admin-only read access"
```

---

### Task 2: Tách hàm đọc sổ quỹ theo quyền

Chuẩn bị cho việc thu hồi quyền cột ở Task 9. Thay đổi này **an toàn với quyền hiện tại**: liệt kê cột tường minh vẫn chạy đúng khi `anon` còn quyền đọc cả bảng, nên deploy được ngay mà không cần migration nào đi kèm. Đúng thứ tự này thì production không có khoảng lỗi.

**Files:**
- Modify: `lib/data/fund-transactions.ts`
- Modify: `lib/stats/fund-balance.ts:9`
- Modify: `app/admin/quy/page.tsx:1,6`

**Interfaces:**
- Consumes: `PublicFundTransaction`, `FundTransaction` (Task 1).
- Produces: `getFundTransactions(): Promise<PublicFundTransaction[]>`, `getFundTransactionsForAdmin(): Promise<FundTransaction[]>`; `computeFundSummary` nhận kiểu rộng hơn.

- [ ] **Step 1: Viết lại file data**

Thay toàn bộ `lib/data/fund-transactions.ts`:

```ts
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { FundTransaction, PublicFundTransaction } from '@/lib/types'

/**
 * Các cột role `anon` được phép đọc. Phải liệt kê tường minh — `select('*')`
 * sẽ lỗi 42501 vì bung ra cả `member_id`/`member_due_id` đã bị thu hồi quyền.
 */
const PUBLIC_COLUMNS = 'id, transaction_type, category, amount, occurred_on, description, match_id, created_at'

/** Dùng cho mọi trang public. */
export async function getFundTransactions(): Promise<PublicFundTransaction[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('fund_transactions')
    .select(PUBLIC_COLUMNS)
    .order('occurred_on', { ascending: false })

  if (error) throw error
  return data as PublicFundTransaction[]
}

/** Chỉ dùng trong `/admin/*` — có `member_id` và `member_due_id`. */
export async function getFundTransactionsForAdmin(): Promise<FundTransaction[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('fund_transactions')
    .select('*')
    .order('occurred_on', { ascending: false })

  if (error) throw error
  return data
}
```

- [ ] **Step 2: Nới kiểu tham số của `computeFundSummary`**

Sửa `lib/stats/fund-balance.ts` dòng 9 — hàm chỉ đọc 2 field nên khai báo đúng 2 field, để nhận được cả bản public lẫn bản admin:

```ts
export function computeFundSummary(
  transactions: Pick<FundTransaction, 'transaction_type' | 'amount'>[]
): FundSummary {
```

Phần thân hàm không đổi.

- [ ] **Step 3: Chuyển trang admin sang hàm admin**

Sửa `app/admin/quy/page.tsx` dòng 1 và 6:

```tsx
import { getFundTransactionsForAdmin } from '@/lib/data/fund-transactions'
```

```tsx
  const transactions = await getFundTransactionsForAdmin()
```

- [ ] **Step 4: Chạy test và build**

```bash
npm test
npm run build
```

Mong đợi: test pass hết (test cũ của `fund-balance` vẫn hợp lệ vì object đầy đủ thoả `Pick`), build và type-check sạch.

- [ ] **Step 5: Kiểm tra trang public không hỏng**

```bash
npm run dev
```

Ở cửa sổ chưa đăng nhập, mở `/` và `/quy` → số dư và bảng giao dịch render y như trước. Danh sách cột trong `PUBLIC_COLUMNS` phải khớp chính xác với danh sách sẽ grant ở Task 9; lệch một cột là Task 9 sẽ làm trang lỗi.

- [ ] **Step 6: Commit**

```bash
git add lib/data/fund-transactions.ts lib/stats/fund-balance.ts app/admin/quy/page.tsx
git commit -m "refactor: split public and admin fund transaction reads"
```

---

### Task 3: Hàm thuần tính công nợ

**Files:**
- Create: `lib/stats/member-dues.ts`
- Test: `lib/stats/member-dues.test.ts`

**Interfaces:**
- Consumes: `MemberDue`, `FundTransaction`, `Member` (Task 1).
- Produces: `computeDuesForPeriod(dues, payments, members): DuesRow[]`, `computeOutstandingByMember(dues, payments): Map<string, number>`, type `DuesRow`, `DuesStatus`.

- [ ] **Step 1: Viết test thất bại**

Tạo `lib/stats/member-dues.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeDuesForPeriod, computeOutstandingByMember } from './member-dues'
import type { MemberDue } from '@/lib/types'

const members = [
  { id: 'm1', full_name: 'An' },
  { id: 'm2', full_name: 'Bình' },
  { id: 'm3', full_name: 'Cường' },
]

function due(id: string, memberId: string, period: string, amount: number): MemberDue {
  return {
    id,
    member_id: memberId,
    period,
    amount_due: amount,
    note: null,
    created_at: '2026-09-01T00:00:00Z',
  }
}

function payment(memberDueId: string | null, amount: number) {
  return { member_due_id: memberDueId, amount }
}

describe('computeDuesForPeriod', () => {
  it('trả về danh sách rỗng khi chưa có kỳ nào', () => {
    expect(computeDuesForPeriod([], [], members)).toEqual([])
  })

  it('đánh dấu chưa đóng khi không có giao dịch nào', () => {
    const rows = computeDuesForPeriod([due('d1', 'm1', '2026-09-01', 200000)], [], members)
    expect(rows).toEqual([
      { memberId: 'm1', fullName: 'An', amountDue: 200000, amountPaid: 0, status: 'unpaid' },
    ])
  })

  it('cộng dồn nhiều giao dịch trong cùng một kỳ', () => {
    const rows = computeDuesForPeriod(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment('d1', 120000), payment('d1', 80000)],
      members
    )
    expect(rows[0].amountPaid).toBe(200000)
    expect(rows[0].status).toBe('paid')
  })

  it('đánh dấu đóng thiếu khi trả một phần', () => {
    const rows = computeDuesForPeriod(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment('d1', 50000)],
      members
    )
    expect(rows[0].status).toBe('partial')
  })

  it('coi đóng dư là đã đóng đủ', () => {
    const rows = computeDuesForPeriod(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment('d1', 250000)],
      members
    )
    expect(rows[0].status).toBe('paid')
  })

  it('coi nghĩa vụ 0 đồng là đã đóng đủ', () => {
    const rows = computeDuesForPeriod([due('d1', 'm1', '2026-09-01', 0)], [], members)
    expect(rows[0].status).toBe('paid')
  })

  it('bỏ qua giao dịch trỏ tới nghĩa vụ của kỳ khác', () => {
    const rows = computeDuesForPeriod(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment('d-thang-8', 200000)],
      members
    )
    expect(rows[0].amountPaid).toBe(0)
    expect(rows[0].status).toBe('unpaid')
  })

  it('bỏ qua giao dịch không gắn nghĩa vụ nào', () => {
    const rows = computeDuesForPeriod(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment(null, 300000)],
      members
    )
    expect(rows[0].amountPaid).toBe(0)
  })

  it('không liệt kê thành viên không có nghĩa vụ trong kỳ', () => {
    const rows = computeDuesForPeriod([due('d1', 'm2', '2026-09-01', 200000)], [], members)
    expect(rows.map((r) => r.memberId)).toEqual(['m2'])
  })

  it('sắp xếp theo tên', () => {
    const rows = computeDuesForPeriod(
      [
        due('d3', 'm3', '2026-09-01', 200000),
        due('d1', 'm1', '2026-09-01', 200000),
        due('d2', 'm2', '2026-09-01', 200000),
      ],
      [],
      members
    )
    expect(rows.map((r) => r.fullName)).toEqual(['An', 'Bình', 'Cường'])
  })
})

describe('computeOutstandingByMember', () => {
  it('trả về map rỗng khi chưa có nghĩa vụ', () => {
    expect(computeOutstandingByMember([], [])).toEqual(new Map())
  })

  it('cộng nợ qua nhiều kỳ', () => {
    const dues = [
      due('d1', 'm1', '2026-08-01', 200000),
      due('d2', 'm1', '2026-09-01', 200000),
    ]
    const outstanding = computeOutstandingByMember(dues, [payment('d1', 200000)])
    expect(outstanding.get('m1')).toBe(200000)
  })

  it('cho tổng nợ xuống dưới 0 khi đóng dư ở kỳ duy nhất', () => {
    const outstanding = computeOutstandingByMember(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment('d1', 250000)]
    )
    expect(outstanding.get('m1')).toBe(-50000)
  })

  it('cho phép đóng dư kỳ này bù cho kỳ khác', () => {
    const dues = [
      due('d1', 'm1', '2026-08-01', 200000),
      due('d2', 'm1', '2026-09-01', 200000),
    ]
    const outstanding = computeOutstandingByMember(dues, [payment('d1', 400000)])
    expect(outstanding.get('m1')).toBe(0)
  })

  it('tách nợ theo từng thành viên', () => {
    const dues = [
      due('d1', 'm1', '2026-09-01', 200000),
      due('d2', 'm2', '2026-09-01', 200000),
    ]
    const outstanding = computeOutstandingByMember(dues, [payment('d2', 200000)])
    expect(outstanding.get('m1')).toBe(200000)
    expect(outstanding.get('m2')).toBe(0)
  })
})
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
npx vitest run lib/stats/member-dues.test.ts
```

Mong đợi: FAIL với `Cannot find module './member-dues'`.

- [ ] **Step 3: Viết hàm**

Tạo `lib/stats/member-dues.ts`:

```ts
import type { FundTransaction, Member, MemberDue } from '@/lib/types'

export type DuesStatus = 'unpaid' | 'partial' | 'paid'

export interface DuesRow {
  memberId: string
  fullName: string
  amountDue: number
  amountPaid: number
  status: DuesStatus
}

/** Chỉ cần 2 field này của giao dịch, nên nhận kiểu hẹp cho dễ test. */
type Payment = Pick<FundTransaction, 'member_due_id' | 'amount'>

function sumPaidByDueId(payments: Payment[]): Map<string, number> {
  const paid = new Map<string, number>()

  for (const p of payments) {
    if (!p.member_due_id) continue
    paid.set(p.member_due_id, (paid.get(p.member_due_id) ?? 0) + p.amount)
  }

  return paid
}

function duesStatus(amountDue: number, amountPaid: number): DuesStatus {
  if (amountPaid >= amountDue) return 'paid'
  if (amountPaid > 0) return 'partial'
  return 'unpaid'
}

/**
 * `dues` là nghĩa vụ của MỘT kỳ (caller lọc trước). `payments` truyền vào rộng
 * bao nhiêu cũng được: ghép chỉ qua `member_due_id`, nên giao dịch của kỳ khác
 * hoặc không gắn nghĩa vụ nào đều tự bị bỏ qua.
 */
export function computeDuesForPeriod(
  dues: MemberDue[],
  payments: Payment[],
  members: Pick<Member, 'id' | 'full_name'>[]
): DuesRow[] {
  const nameById = new Map(members.map((m) => [m.id, m.full_name]))
  const paidByDueId = sumPaidByDueId(payments)

  return dues
    .filter((d) => nameById.has(d.member_id))
    .map((d) => {
      const amountPaid = paidByDueId.get(d.id) ?? 0
      return {
        memberId: d.member_id,
        fullName: nameById.get(d.member_id)!,
        amountDue: d.amount_due,
        amountPaid,
        status: duesStatus(d.amount_due, amountPaid),
      }
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
}

/** `dues` là nghĩa vụ của MỌI kỳ. Trả về `sum(phải đóng) - sum(đã đóng)`. */
export function computeOutstandingByMember(
  dues: MemberDue[],
  payments: Payment[]
): Map<string, number> {
  const memberByDueId = new Map(dues.map((d) => [d.id, d.member_id]))
  const outstanding = new Map<string, number>()

  for (const d of dues) {
    outstanding.set(d.member_id, (outstanding.get(d.member_id) ?? 0) + d.amount_due)
  }

  for (const p of payments) {
    if (!p.member_due_id) continue
    const memberId = memberByDueId.get(p.member_due_id)
    if (!memberId) continue
    outstanding.set(memberId, (outstanding.get(memberId) ?? 0) - p.amount)
  }

  return outstanding
}
```

- [ ] **Step 4: Chạy để xác nhận pass**

```bash
npx vitest run lib/stats/member-dues.test.ts
```

Mong đợi: 15 test PASS.

- [ ] **Step 5: Chạy toàn bộ test**

```bash
npm test
```

Mong đợi: mọi test pass, không cảnh báo.

- [ ] **Step 6: Commit**

```bash
git add lib/stats/member-dues.ts lib/stats/member-dues.test.ts
git commit -m "feat: add member dues calculation"
```

---

### Task 4: Zod schema

**Files:**
- Create: `lib/validations/member-due.ts`
- Test: `lib/validations/member-due.test.ts`

**Interfaces:**
- Produces: `createPeriodSchema`, `paymentSchema`, `updateAmountDueSchema`.

- [ ] **Step 1: Viết test thất bại**

Tạo `lib/validations/member-due.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createPeriodSchema, paymentSchema, updateAmountDueSchema } from './member-due'

describe('createPeriodSchema', () => {
  it('đổi giá trị input month thành ngày 1 của tháng', () => {
    const result = createPeriodSchema.safeParse({ period: '2026-09', amount_due: '200000' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.period).toBe('2026-09-01')
      expect(result.data.amount_due).toBe(200000)
    }
  })

  it('nhận nghĩa vụ 0 đồng (miễn đóng)', () => {
    expect(createPeriodSchema.safeParse({ period: '2026-09', amount_due: '0' }).success).toBe(true)
  })

  it('từ chối số tiền âm', () => {
    expect(createPeriodSchema.safeParse({ period: '2026-09', amount_due: '-1' }).success).toBe(false)
  })

  it('từ chối tháng ngoài 01-12', () => {
    expect(createPeriodSchema.safeParse({ period: '2026-13', amount_due: '1' }).success).toBe(false)
  })

  it('từ chối tháng thiếu số 0', () => {
    expect(createPeriodSchema.safeParse({ period: '2026-9', amount_due: '1' }).success).toBe(false)
  })

  it('từ chối chuỗi đã là ngày đầy đủ', () => {
    expect(createPeriodSchema.safeParse({ period: '2026-09-01', amount_due: '1' }).success).toBe(false)
  })
})

describe('paymentSchema', () => {
  const valid = {
    member_due_id: '3ead81b0-a323-44bc-827d-abc47936f1c0',
    amount: '200000',
    occurred_on: '2026-09-05',
  }

  it('nhận dữ liệu hợp lệ', () => {
    const result = paymentSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.amount).toBe(200000)
  })

  it('từ chối số tiền 0', () => {
    expect(paymentSchema.safeParse({ ...valid, amount: '0' }).success).toBe(false)
  })

  it('từ chối member_due_id không phải uuid', () => {
    expect(paymentSchema.safeParse({ ...valid, member_due_id: 'abc' }).success).toBe(false)
  })

  it('từ chối ngày sai định dạng', () => {
    expect(paymentSchema.safeParse({ ...valid, occurred_on: '05/09/2026' }).success).toBe(false)
  })
})

describe('updateAmountDueSchema', () => {
  it('nhận số tiền 0', () => {
    const result = updateAmountDueSchema.safeParse({
      id: '3ead81b0-a323-44bc-827d-abc47936f1c0',
      amount_due: '0',
    })
    expect(result.success).toBe(true)
  })

  it('từ chối số tiền âm', () => {
    const result = updateAmountDueSchema.safeParse({
      id: '3ead81b0-a323-44bc-827d-abc47936f1c0',
      amount_due: '-5',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
npx vitest run lib/validations/member-due.test.ts
```

Mong đợi: FAIL với `Cannot find module './member-due'`.

- [ ] **Step 3: Viết schema**

Tạo `lib/validations/member-due.ts`:

```ts
import { z } from 'zod'

/** Đúng dạng của `<input type="month">`: YYYY-MM, tháng 01-12. */
const MONTH_INPUT = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/

/**
 * Số tiền phải đóng: cho phép 0 (miễn đóng) nhưng KHÔNG cho phép để trống.
 *
 * Không dùng `z.coerce.number()` trực tiếp: `Number('')` là `0`, nên ô nhập bị
 * xoá trắng sẽ lặng lẽ biến thành nghĩa vụ 0 đồng — tức xoá nợ của người đó mà
 * không báo gì. Chặn chuỗi rỗng trước rồi mới coerce.
 */
const amountDueField = z
  .string()
  .min(1, 'Số tiền không được để trống')
  .pipe(z.coerce.number().min(0, 'Số tiền không được âm'))

export const createPeriodSchema = z.object({
  period: z
    .string()
    .regex(MONTH_INPUT, 'Kỳ phải có dạng YYYY-MM')
    // Nối chuỗi trực tiếp, KHÔNG qua `new Date()`: cột `period` là kiểu
    // `date` nên không được để timezone chen vào giữa.
    .transform((value) => `${value}-01`),
  amount_due: amountDueField,
})

export const paymentSchema = z.object({
  member_due_id: z.string().uuid('Nghĩa vụ không hợp lệ'),
  amount: z.coerce.number().positive('Số tiền phải lớn hơn 0'),
  occurred_on: z.string().regex(DATE_INPUT, 'Ngày không hợp lệ'),
})

export const updateAmountDueSchema = z.object({
  id: z.string().uuid('Nghĩa vụ không hợp lệ'),
  amount_due: amountDueField,
})
```

- [ ] **Step 4: Chạy để xác nhận pass**

```bash
npx vitest run lib/validations/member-due.test.ts
```

Mong đợi: 12 test PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validations/member-due.ts lib/validations/member-due.test.ts
git commit -m "feat: add member due validation schemas"
```

---

### Task 5: Đọc dữ liệu công nợ

**Files:**
- Create: `lib/data/member-dues.ts`

**Interfaces:**
- Consumes: `MemberDue`, `FundTransaction` (Task 1), `createSupabaseServerClient`.
- Produces: `getDuePeriods(): Promise<string[]>`, `getDuesForPeriod(period): Promise<MemberDue[]>`, `getAllDues(): Promise<MemberDue[]>`, `getDuePayments(): Promise<FundTransaction[]>`.

- [ ] **Step 1: Viết file data**

Tạo `lib/data/member-dues.ts`:

```ts
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { FundTransaction, MemberDue } from '@/lib/types'

/** Các kỳ đã tạo, mới nhất trước. */
export async function getDuePeriods(): Promise<string[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('member_dues')
    .select('period')
    .order('period', { ascending: false })

  if (error) throw error
  // Supabase JS không có DISTINCT nên lọc trùng ở đây; bảng rất nhỏ.
  return Array.from(new Set(data.map((row) => row.period as string)))
}

export async function getDuesForPeriod(period: string): Promise<MemberDue[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('member_dues').select('*').eq('period', period)

  if (error) throw error
  return data
}

export async function getAllDues(): Promise<MemberDue[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('member_dues').select('*')

  if (error) throw error
  return data
}

/**
 * Chỉ các giao dịch THU gắn với một nghĩa vụ — dùng để tính đã đóng bao nhiêu.
 *
 * Bắt buộc lọc `transaction_type = 'income'`: hàm tính công nợ cộng thẳng
 * `amount` mà không xem loại giao dịch, nên một khoản CHI vô tình gắn
 * `member_due_id` sẽ bị cộng vào "đã đóng" thay vì trừ đi. Hiện chưa có đường
 * nào trong UI tạo ra tình huống đó, nhưng chặn ở đây thì rẻ.
 */
export async function getDuePayments(): Promise<FundTransaction[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('fund_transactions')
    .select('*')
    .eq('transaction_type', 'income')
    .not('member_due_id', 'is', null)

  if (error) throw error
  return data
}
```

- [ ] **Step 2: Kiểm tra type-check**

```bash
npm run build
```

Mong đợi: compile và TypeScript sạch.

- [ ] **Step 3: Commit**

```bash
git add lib/data/member-dues.ts
git commit -m "feat: add member dues data access"
```

---

### Task 6: Trang công nợ — chọn kỳ, tạo kỳ, bảng

**Files:**
- Create: `app/admin/cong-no/page.tsx`
- Create: `app/admin/cong-no/actions.ts`
- Modify: `app/admin/layout.tsx:12`

**Interfaces:**
- Consumes: `getDuePeriods`, `getDuesForPeriod`, `getAllDues`, `getDuePayments` (Task 5); `computeDuesForPeriod`, `computeOutstandingByMember` (Task 3); `createPeriodSchema` (Task 4); `getMembers` (đã có).
- Produces: Server Action `createPeriod(formData)`.

- [ ] **Step 1: Viết action `createPeriod`**

Tạo `app/admin/cong-no/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createPeriodSchema } from '@/lib/validations/member-due'
import { getMembers } from '@/lib/data/members'
import { getDuesForPeriod } from '@/lib/data/member-dues'

export async function createPeriod(formData: FormData) {
  const parsed = createPeriodSchema.safeParse({
    period: formData.get('period'),
    amount_due: formData.get('amount_due'),
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const { period, amount_due } = parsed.data
  const [members, existing] = await Promise.all([getMembers(), getDuesForPeriod(period)])
  const alreadyHasDue = new Set(existing.map((d) => d.member_id))

  // Chỉ thêm người còn thiếu, không sửa số tiền của người đã có. Nhờ vậy chạy
  // lại trên kỳ cũ sẽ bổ sung thành viên mới vào đội mà không phá dữ liệu.
  const rows = members
    .filter((m) => m.status === 'active' && !alreadyHasDue.has(m.id))
    .map((m) => ({ member_id: m.id, period, amount_due }))

  if (rows.length > 0) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.from('member_dues').insert(rows)

    if (error) {
      // 23505 = unique_violation trên `unique (member_id, period)`. Lọc
      // `alreadyHasDue` ở trên đã chặn trường hợp thường, nên lỗi này chỉ còn
      // xảy ra khi hai submit gần như đồng thời cùng đọc được một ảnh chụp
      // "chưa có ai" rồi cùng insert. Đổi thành câu tiếng Việt thay vì để lỗi
      // Postgres thô nổi lên tận UI.
      if (error.code === '23505') {
        throw new Error('Kỳ này vừa được tạo bởi một thao tác khác. Hãy tải lại trang để xem danh sách mới nhất.')
      }
      throw error
    }
  }

  revalidatePath('/admin/cong-no')
}
```

- [ ] **Step 2: Viết trang**

Tạo `app/admin/cong-no/page.tsx`:

```tsx
import { getMembers } from '@/lib/data/members'
import { getDuePeriods, getDuesForPeriod, getAllDues, getDuePayments } from '@/lib/data/member-dues'
import { computeDuesForPeriod, computeOutstandingByMember } from '@/lib/stats/member-dues'
import { createPeriod } from './actions'

const statusLabel = {
  unpaid: 'Chưa đóng',
  partial: 'Đóng thiếu',
  paid: 'Đã đóng',
} as const

function formatPeriod(period: string) {
  const [year, month] = period.split('-')
  return `Tháng ${Number(month)}/${year}`
}

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ ky?: string }>
}) {
  const { ky } = await searchParams
  const periods = await getDuePeriods()
  const selected = ky && periods.includes(ky) ? ky : periods[0]

  // Truyền TOÀN BỘ thành viên (kể cả inactive): người đã nghỉ vẫn có thể còn
  // nợ kỳ cũ, lọc active ở đây sẽ làm nợ của họ biến mất khỏi bảng.
  const [members, allDues, payments, periodDues] = await Promise.all([
    getMembers(),
    getAllDues(),
    getDuePayments(),
    selected ? getDuesForPeriod(selected) : Promise.resolve([]),
  ])

  const rows = computeDuesForPeriod(periodDues, payments, members)
  const outstanding = computeOutstandingByMember(allDues, payments)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Công nợ đóng góp</h1>
        <p className="text-sm text-gray-500">
          Chỉ admin xem được. Trang quỹ công khai không hiển thị thông tin này.
        </p>
      </div>

      <section className="rounded border bg-white p-4">
        <h2 className="font-semibold">Tạo kỳ mới</h2>
        <form action={createPeriod} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium">Kỳ</label>
            <input name="period" type="month" required className="mt-1 rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Mức đóng mỗi người</label>
            <input
              name="amount_due"
              type="number"
              min="0"
              step="1000"
              required
              className="mt-1 rounded border px-3 py-2"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800"
          >
            Tạo kỳ
          </button>
        </form>
        <p className="mt-2 text-sm text-gray-500">
          Sinh nghĩa vụ cho mọi thành viên đang hoạt động. Chạy lại trên kỳ đã có chỉ bổ sung
          người còn thiếu, không sửa số tiền của người đã có.
        </p>
      </section>

      {selected ? (
        <section>
          <form className="flex items-end gap-3">
            <div>
              <label className="block text-sm font-medium">Xem kỳ</label>
              <select name="ky" defaultValue={selected} className="mt-1 rounded border px-3 py-2">
                {periods.map((p) => (
                  <option key={p} value={p}>
                    {formatPeriod(p)}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded border px-4 py-2 hover:bg-gray-50">
              Xem
            </button>
          </form>

          <table className="mt-4 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Thành viên</th>
                <th className="py-2">Phải đóng</th>
                <th className="py-2">Đã đóng</th>
                <th className="py-2">Trạng thái</th>
                <th className="py-2">Tổng nợ lũy kế</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.memberId} className="border-b">
                  <td className="py-2">{row.fullName}</td>
                  <td className="py-2">{row.amountDue.toLocaleString('vi-VN')} đ</td>
                  <td className="py-2">{row.amountPaid.toLocaleString('vi-VN')} đ</td>
                  <td className="py-2">{statusLabel[row.status]}</td>
                  <td className="py-2">
                    {(outstanding.get(row.memberId) ?? 0).toLocaleString('vi-VN')} đ
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="mt-4 text-gray-500">Kỳ này chưa có nghĩa vụ nào.</p>
          )}
        </section>
      ) : (
        <p className="text-gray-500">Chưa có kỳ nào. Tạo kỳ đầu tiên ở trên.</p>
      )}
    </div>
  )
}
```

Dùng `{selected ? ... : ...}` chứ **không** dùng `{periods.length > 0 && ...}`: `selected` có kiểu `string | undefined`, và TypeScript không thu hẹp kiểu của nó qua điều kiện `periods.length > 0`. Viết cách kia thì `recordPayments.bind(null, selected)` ở Task 7 và `formatPeriod(selected)` ở Task 8 sẽ lỗi type. Kiểm tra `selected` trực tiếp thì trong nhánh true nó đã được thu hẹp thành `string`.

- [ ] **Step 3: Thêm link vào nav admin**

Sửa `app/admin/layout.tsx`, thêm sau dòng 12 (`<Link href="/admin/tran-dau">Trận đấu</Link>`):

```tsx
          <Link href="/admin/cong-no">Công nợ</Link>
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Mong đợi: compile và TypeScript sạch, route `/admin/cong-no` xuất hiện trong danh sách.

- [ ] **Step 5: Kiểm tra thủ công**

`npm run dev`, đăng nhập, mở `/admin/cong-no`:
1. Tạo kỳ `2026-09` với mức `200000` → bảng hiện 11 thành viên, tất cả "Chưa đóng", phải đóng 200.000 đ.
2. Tạo lại đúng kỳ `2026-09` với mức `999999` → số tiền của 11 người **không đổi** (vẫn 200.000 đ), không thêm dòng trùng.

- [ ] **Step 6: Commit**

```bash
git add app/admin/cong-no app/admin/layout.tsx
git commit -m "feat: add dues period creation and admin dues table"
```

---

### Task 7: Ghi nhận đóng tiền và hoàn tác

**Files:**
- Modify: `app/admin/cong-no/actions.ts`
- Modify: `app/admin/cong-no/page.tsx`

**Interfaces:**
- Consumes: `paymentSchema` (Task 4), `getDuesForPeriod` (Task 5).
- Produces: Server Action `recordPayments(period, formData)`, `undoPayment(dueId, formData)`.

- [ ] **Step 1: Thêm 2 action**

Trước tiên bổ sung vào **khối import đã có** ở đầu `app/admin/cong-no/actions.ts` (đừng thêm `import` ở cuối file — hợp lệ về cú pháp nhưng lệch hẳn với phần còn lại của repo):

```ts
import { createPeriodSchema, paymentSchema } from '@/lib/validations/member-due'
import { getDuesForPeriod, getDuePayments } from '@/lib/data/member-dues'
```

(`getMembers` đã được import từ Task 6 nên không cần thêm.)

Rồi thêm 2 hàm vào cuối file:

```ts
export async function recordPayments(period: string, formData: FormData) {
  const dueIds = formData.getAll('paid_due_id').map(String)
  if (dueIds.length === 0) return

  const [members, dues, payments] = await Promise.all([
    getMembers(),
    getDuesForPeriod(period),
    getDuePayments(),
  ])

  const memberByDueId = new Map(dues.map((d) => [d.id, d.member_id]))
  const nameById = new Map(members.map((m) => [m.id, m.full_name]))
  const alreadyPaid = new Set(
    payments.map((p) => p.member_due_id).filter((id): id is string => id !== null)
  )
  const occurredOn = String(formData.get('occurred_on') ?? '')

  // Bỏ qua nghĩa vụ đã có giao dịch → submit lại nhiều lần không thu 2 lần.
  const pending = dueIds.filter((dueId) => !alreadyPaid.has(dueId))
  if (pending.length === 0) return

  // Mọi nghĩa vụ được tick phải thuộc đúng kỳ đang mở. `memberByDueId` chỉ chứa
  // nghĩa vụ của kỳ này, nên thiếu key nghĩa là dòng đó không thuộc kỳ. Dừng
  // hẳn thay vì ghi: ghi vào sẽ tạo giao dịch không có `member_id`, tức dữ liệu
  // sai âm thầm ở một cột thật. Không xảy ra qua UI, chỉ qua request tự tạo.
  const foreign = pending.filter((dueId) => !memberByDueId.has(dueId))
  if (foreign.length > 0) {
    throw new Error('Có dòng không thuộc kỳ đang xem. Hãy tải lại trang rồi thử lại.')
  }

  // Validate toàn bộ TRƯỚC khi ghi bất cứ gì. Một dòng sai thì không lưu dòng
  // nào — nhưng phải nói rõ dòng nào sai, kèm tên người, thay vì để ZodError
  // thô nổi lên và làm mất cả lô mà admin không biết vì sao.
  const invalid: string[] = []
  const rows = []

  for (const dueId of pending) {
    const parsed = paymentSchema.safeParse({
      member_due_id: dueId,
      amount: formData.get(`amount_${dueId}`),
      occurred_on: occurredOn,
    })

    const memberId = memberByDueId.get(dueId)!

    if (!parsed.success) {
      const name = nameById.get(memberId) ?? 'Không rõ'
      invalid.push(`${name}: ${parsed.error.issues.map((i) => i.message).join(', ')}`)
      continue
    }

    rows.push({
      transaction_type: 'income' as const,
      category: 'Quỹ tháng',
      amount: parsed.data.amount,
      occurred_on: parsed.data.occurred_on,
      member_due_id: parsed.data.member_due_id,
      member_id: memberId,
    })
  }

  if (invalid.length > 0) {
    throw new Error(invalid.join('; '))
  }

  if (rows.length === 0) return

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('fund_transactions').insert(rows)
  if (error) throw error

  revalidatePath('/admin/cong-no')
  revalidatePath('/admin/quy')
  revalidatePath('/quy')
  revalidatePath('/')
}

export async function undoPayment(dueId: string) {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('fund_transactions').delete().eq('member_due_id', dueId)
  if (error) throw error

  revalidatePath('/admin/cong-no')
  revalidatePath('/admin/quy')
  revalidatePath('/quy')
  revalidatePath('/')
}
```

- [ ] **Step 2: Thêm form ghi nhận vào trang**

Trong `app/admin/cong-no/page.tsx`, thêm import:

```tsx
import { createPeriod, recordPayments, undoPayment } from './actions'
```

`computeDuesForPeriod` trả về `memberId` chứ không trả `id` của nghĩa vụ, nên cần map ngược để lấy `dueId` cho từng dòng. Thêm ngay sau chỗ tính `rows`:

```tsx
  const dueIdByMemberId = new Map(periodDues.map((d) => [d.member_id, d.id]))
```

Bọc `<table>` trong form và thêm 2 cột. Thay toàn bộ khối `<table>...</table>` bằng:

```tsx
          <form action={recordPayments.bind(null, selected)} className="mt-4">
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-sm font-medium">Ngày đóng</label>
                <input
                  name="occurred_on"
                  type="date"
                  required
                  className="mt-1 rounded border px-3 py-2"
                />
              </div>
              <button
                type="submit"
                className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800"
              >
                Lưu các dòng đã tick
              </button>
            </div>

            <table className="mt-4 w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Đã đóng</th>
                  <th className="py-2">Thành viên</th>
                  <th className="py-2">Phải đóng</th>
                  <th className="py-2">Số tiền đóng</th>
                  <th className="py-2">Đã ghi nhận</th>
                  <th className="py-2">Trạng thái</th>
                  <th className="py-2">Tổng nợ lũy kế</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const dueId = dueIdByMemberId.get(row.memberId)!
                  return (
                    <tr key={row.memberId} className="border-b">
                      <td className="py-2">
                        <input
                          type="checkbox"
                          name="paid_due_id"
                          value={dueId}
                          disabled={row.amountPaid > 0}
                        />
                      </td>
                      <td className="py-2">{row.fullName}</td>
                      <td className="py-2">{row.amountDue.toLocaleString('vi-VN')} đ</td>
                      <td className="py-2">
                        <input
                          name={`amount_${dueId}`}
                          type="number"
                          min="0"
                          step="1000"
                          defaultValue={row.amountDue}
                          className="w-28 rounded border px-2 py-1"
                        />
                      </td>
                      <td className="py-2">{row.amountPaid.toLocaleString('vi-VN')} đ</td>
                      <td className="py-2">{statusLabel[row.status]}</td>
                      <td className="py-2">
                        {(outstanding.get(row.memberId) ?? 0).toLocaleString('vi-VN')} đ
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </form>

          <div className="mt-4 space-y-1">
            {rows
              .filter((row) => row.amountPaid > 0)
              .map((row) => (
                <form
                  key={row.memberId}
                  action={undoPayment.bind(null, dueIdByMemberId.get(row.memberId)!)}
                >
                  <button type="submit" className="text-sm text-red-600 hover:underline">
                    Hoàn tác khoản đóng của {row.fullName}
                  </button>
                </form>
              ))}
          </div>
```

Ô tick bị `disabled` khi đã có tiền ghi nhận, và action cũng bỏ qua các nghĩa vụ đó — chặn hai lớp để không bao giờ thu hai lần. Bỏ tick không xoá gì; muốn xoá phải bấm "Hoàn tác".

- [ ] **Step 3: Build**

```bash
npm run build
```

Mong đợi: compile và TypeScript sạch.

- [ ] **Step 4: Kiểm tra thủ công**

`npm run dev`, đăng nhập, mở `/admin/cong-no` với kỳ đã tạo ở Task 6:
1. Nhập ngày đóng, tick 2 người, bấm lưu → 2 người đó thành "Đã đóng", ô tick của họ bị mờ đi.
2. Mở `/admin/quy` → thấy 2 giao dịch thu mới, hạng mục "Quỹ tháng"; số dư tăng đúng bằng tổng 2 khoản.
3. Bấm lưu lại lần nữa với đúng các ô đó → **không** phát sinh giao dịch mới, số dư không đổi.
4. Sửa ô số tiền của một người chưa đóng thành nửa mức, tick, lưu → trạng thái "Đóng thiếu".
5. Bấm "Hoàn tác khoản đóng của ..." → người đó về "Chưa đóng", giao dịch biến mất khỏi `/admin/quy`, số dư giảm lại.

- [ ] **Step 5: Commit**

```bash
git add app/admin/cong-no
git commit -m "feat: record and undo dues payments"
```

---

### Task 8: Sửa số phải đóng và xoá kỳ

**Files:**
- Modify: `app/admin/cong-no/actions.ts`
- Modify: `app/admin/cong-no/page.tsx`

**Interfaces:**
- Consumes: `updateAmountDueSchema` (Task 4).
- Produces: Server Action `updateAmountDue(formData)`, `deletePeriod(period)`.

- [ ] **Step 1: Thêm 2 action**

Bổ sung `updateAmountDueSchema` vào khối import đã có:

```ts
import { createPeriodSchema, paymentSchema, updateAmountDueSchema } from '@/lib/validations/member-due'
```

Rồi thêm 2 hàm vào cuối `app/admin/cong-no/actions.ts`:

```ts
export async function updateAmountDue(formData: FormData) {
  const parsed = updateAmountDueSchema.safeParse({
    id: formData.get('id'),
    amount_due: formData.get('amount_due'),
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from('member_dues')
    .update({ amount_due: parsed.data.amount_due })
    .eq('id', parsed.data.id)
  if (error) throw error

  revalidatePath('/admin/cong-no')
}

export async function deletePeriod(period: string) {
  const dues = await getDuesForPeriod(period)
  const dueIds = new Set(dues.map((d) => d.id))
  const payments = await getDuePayments()

  // Chặn xoá kỳ đã có tiền thật vào quỹ — xoá sẽ làm giao dịch mất liên kết
  // (FK là `on delete set null`) nên không còn biết khoản đó thuộc kỳ nào.
  const hasPayment = payments.some((p) => p.member_due_id && dueIds.has(p.member_due_id))
  if (hasPayment) {
    throw new Error('Kỳ này đã có người đóng tiền, không xoá được. Hãy hoàn tác các khoản đóng trước.')
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('member_dues').delete().eq('period', period)
  if (error) throw error

  revalidatePath('/admin/cong-no')
}
```

- [ ] **Step 2: Thêm UI**

Trong `app/admin/cong-no/page.tsx`, bổ sung import:

```tsx
import { createPeriod, recordPayments, undoPayment, updateAmountDue, deletePeriod } from './actions'
```

**Không sửa gì trong bảng.** Ô "Phải đóng" giữ nguyên là text tĩnh, vì bảng đã nằm trong form `recordPayments` và HTML không cho lồng form trong form. Việc sửa mức đóng đặt ở một khối riêng bên dưới bảng, cạnh khối "Hoàn tác":

```tsx
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-medium">Sửa mức phải đóng</summary>
            <div className="mt-2 space-y-2">
              {rows.map((row) => (
                <form
                  key={row.memberId}
                  action={updateAmountDue}
                  className="flex items-center gap-2 text-sm"
                >
                  <input type="hidden" name="id" value={dueIdByMemberId.get(row.memberId)!} />
                  <span className="w-40">{row.fullName}</span>
                  <input
                    name="amount_due"
                    type="number"
                    min="0"
                    step="1000"
                    required
                    defaultValue={row.amountDue}
                    className="w-28 rounded border px-2 py-1"
                  />
                  <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
                    Lưu
                  </button>
                </form>
              ))}
            </div>
          </details>

          <form action={deletePeriod.bind(null, selected)} className="mt-6">
            <button type="submit" className="text-sm text-red-600 hover:underline">
              Xoá kỳ {formatPeriod(selected)}
            </button>
          </form>
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Mong đợi: compile và TypeScript sạch.

- [ ] **Step 4: Kiểm tra thủ công**

`npm run dev`, đăng nhập, `/admin/cong-no`:
1. Mở "Sửa mức phải đóng", đổi một người thành `0`, lưu → người đó thành "Đã đóng" ngay (nghĩa vụ 0 đồng), phải đóng hiện 0 đ.
2. Bấm "Xoá kỳ ..." trên kỳ đang có người đã đóng → báo lỗi "Kỳ này đã có người đóng tiền, không xoá được...".
3. Tạo một kỳ mới chưa ai đóng rồi bấm xoá → kỳ biến mất khỏi dropdown.

- [ ] **Step 5: Commit**

```bash
git add app/admin/cong-no
git commit -m "feat: edit due amounts and delete empty periods"
```

---

### Task 9: Deploy rồi thu hồi quyền đọc cột

Task duy nhất chạm tới quyền của `fund_transactions`. Đặt cuối cùng vì dự án chỉ có **một** Supabase project dùng chung cho local và production: revoke trước khi code mới lên production sẽ làm site đang sống lỗi 500 ở `/` và `/quy`.

**Files:**
- Create: `supabase/migrations/0004_restrict_fund_columns.sql`

**Interfaces:**
- Consumes: `PUBLIC_COLUMNS` trong `lib/data/fund-transactions.ts` (Task 2) — danh sách cột grant phải khớp chính xác.

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/0004_restrict_fund_columns.sql`:

```sql
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
```

- [ ] **Step 2: Đối chiếu danh sách cột**

```bash
grep -n "PUBLIC_COLUMNS" -A2 lib/data/fund-transactions.ts
grep -n "grant select" -A3 supabase/migrations/0004_restrict_fund_columns.sql
```

Hai danh sách phải trùng khít từng cột. Lệch một cột là production sẽ lỗi 500 ngay sau khi chạy migration.

- [ ] **Step 3: Deploy code trước**

```bash
git push origin master
```

Chờ Vercel build xong, rồi xác nhận production đã chạy code mới:

```bash
curl -s -o /dev/null -w "/quy %{http_code}\n" https://web-football-club.vercel.app/quy
```

Mong đợi `200`. **Không chạy Step 4 trước khi bước này xong** — đó chính là thứ tự bảo vệ site khỏi khoảng lỗi.

- [ ] **Step 4: Apply migration (thủ công, ngoài repo)**

Supabase Dashboard → SQL Editor, dán toàn bộ file `0004`, bỏ chọn hết text, nhấn Run.

- [ ] **Step 5: Xác nhận production vẫn sống sau khi revoke**

```bash
curl -s -o /dev/null -w "/ %{http_code}\n" https://web-football-club.vercel.app/
curl -s -o /dev/null -w "/quy %{http_code}\n" https://web-football-club.vercel.app/quy
```

Mong đợi cả hai `200`. Nếu 500 thì danh sách cột lệch — so lại Step 2.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_restrict_fund_columns.sql
git commit -m "feat: restrict anon read access to fund transaction member columns"
```

---

### Task 10: Kiểm thử toàn luồng và xác nhận không lộ dữ liệu

**Files:** không sửa file nào — chỉ kiểm chứng.

**Interfaces:** none.

- [ ] **Step 1: Chạy toàn bộ test và build**

```bash
npm test
npm run build
```

Mong đợi: mọi test pass, build sạch, danh sách route có `/admin/cong-no`.

- [ ] **Step 2: Xác nhận trang public không lộ tên ai**

Với dữ liệu đã nhập ở Task 7, mở cửa sổ chưa đăng nhập:
1. `/quy` → số dư đã bao gồm các khoản đóng quỹ; bảng giao dịch hiện hạng mục "Quỹ tháng" nhưng **không có cột nào chứa tên thành viên**.
2. `/` → số dư khớp với `/quy`.
3. Tìm trong HTML trả về của `/quy` xem có tên thành viên nào không:

```bash
curl -s http://localhost:3000/quy | grep -c "Trần\|Nguyễn\|Hoàng"
```

Mong đợi: `0`.

- [ ] **Step 3: Xác nhận anon key không đọc được công nợ**

Chạy 4 truy vấn dưới đây, lần này **sau khi đã có dữ liệu thật** trong `member_dues` và migration `0004` đã apply:

```bash
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)
KEY=$(grep ANON_KEY .env.local | cut -d= -f2)

for Q in "member_dues?select=*" "fund_transactions?select=member_id" "fund_transactions?select=*" "fund_transactions?select=id,amount"; do
  echo "--- $Q ---"
  curl -s "$URL/rest/v1/$Q" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | head -c 300
  echo
done
```


| Truy vấn | Mong đợi |
|---|---|
| `member_dues?select=*` | lỗi `42501 permission denied for table member_dues` — bảng đã có dữ liệu thật mà anon vẫn không chạm tới được |
| `fund_transactions?select=member_id` | lỗi `42501` |
| `fund_transactions?select=*` | lỗi `42501` |
| `fund_transactions?select=id,amount` | có dữ liệu |

Dòng đầu là bước quan trọng nhất của cả plan: ở Task 1 bảng còn rỗng nên `[]` chưa chứng minh được gì. Chỉ khi bảng đã có dữ liệu mà vẫn trả `[]` thì mới biết RLS thật sự đang chặn.

- [ ] **Step 4: Xác nhận middleware vẫn chặn trang mới**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/admin/cong-no
```

Mong đợi: `307` và redirect về `/login?next=%2Fadmin%2Fcong-no`.

- [ ] **Step 5: Không cần commit**

Task này chỉ kiểm chứng, không sửa file.
