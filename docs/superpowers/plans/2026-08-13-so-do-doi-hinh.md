# Sơ đồ Đội hình theo Vị trí Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho admin chọn một sơ đồ có sẵn (2-3-1, 1-2-1...) cho từng đội trong một trận, gán từng participant vào một vị trí trên sơ đồ đó bằng dropdown, và hiện sơ đồ đó lên trang public của trận — không dùng kéo-thả tự do.

**Architecture:** Sơ đồ (`formation`) là dữ liệu tĩnh định nghĩa cứng trong `lib/formations.ts`, không lưu DB. DB chỉ lưu tên sơ đồ đã chọn cho mỗi (trận, đội) và vị trí (`position_slot`) từng participant được gán. Đọc bằng Server Component, viết bằng Server Action, validate bằng Zod — đúng pattern đã có. Không có Client Component nào có state: đổi sơ đồ là load lại trang qua query string (giống cách trang công nợ đổi kỳ), gán cầu thủ là dropdown gốc submit một lần cho cả đội.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Supabase (Postgres + RLS), Zod v4, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-08-13-so-do-doi-hinh-design.md`

## Global Constraints

- Một đội duy nhất, không multi-tenant.
- Chỉ một role "admin". Cổng ghi duy nhất là `auth.role() = 'authenticated'`.
- **Không kéo-thả tự do.** Mỗi vị trí là một ô cố định trong một sơ đồ có sẵn, gán bằng dropdown — quyết định vì phải chạy tốt trên cả chuột và cảm ứng.
- Sơ đồ (`FORMATIONS`) là dữ liệu tĩnh trong code, không có bảng DB, không cho admin tự định nghĩa mới.
- Một `member_id` không được gán vào hai vị trí trong cùng một lần submit.
- Mỗi `member_id` gửi lên phải là participant của đúng đội (`team`) đang xếp.
- `match_lineups` theo pattern chuẩn của dự án: **có** policy public read (`using (true)`) — không phải ngoại lệ nhạy cảm như `member_dues`.
- Sân chỉ có 2 cỡ: 5 hoặc 7 người (đã có ràng buộc `check` trên `matches.field_size`). Danh sách sơ đồ khác nhau theo từng cỡ sân.
- Copy UI tiếng Việt, nhất quán với các trang hiện có.
- Không thêm route `/api/*`.

## File Structure

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/0005_match_lineups.sql` | Bảng `match_lineups`, cột `match_participants.position_slot`, RLS |
| `lib/types.ts` (sửa) | Thêm `MatchLineup`; thêm `position_slot` vào `MatchParticipant` |
| `lib/formations.ts` | Dữ liệu tĩnh: danh sách sơ đồ theo cỡ sân + toạ độ % từng vị trí |
| `lib/validations/lineup.ts` | Zod schema validate sơ đồ + các gán vị trí |
| `lib/data/matches.ts` (sửa) | Thêm `getMatchLineups(matchId)` |
| `app/admin/tran-dau/actions.ts` (sửa) | Thêm Server Action `setLineup` |
| `app/admin/tran-dau/[id]/page.tsx` (sửa) | Thêm section chọn sơ đồ + gán vị trí |
| `app/tran-dau/[id]/page.tsx` (sửa) | Thêm khối vẽ sân hiện sơ đồ đã chốt |

---

### Task 1: Migration và types

**Files:**
- Create: `supabase/migrations/0005_match_lineups.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: bảng `match_lineups`; cột `match_participants.position_slot`; type `MatchLineup`; field `position_slot` trên `MatchParticipant`.

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/0005_match_lineups.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration (thủ công, ngoài repo)**

Mở Supabase Dashboard → SQL Editor, dán toàn bộ nội dung file trên, bỏ chọn hết text, nhấn Run.

Không cần thứ tự đặc biệt với việc deploy code: migration này **không** đụng tới quyền của bảng nào đã có (`match_lineups` được cấp quyền đọc công khai ngay từ đầu, giống mọi bảng khác), nên áp trước hay sau khi push code đều an toàn.

- [ ] **Step 3: Kiểm tra bảng đã tạo và đọc công khai được**

```bash
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2)
KEY=$(grep ANON_KEY .env.local | cut -d= -f2)
curl -s "$URL/rest/v1/match_lineups?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Mong đợi: `[]` (mảng rỗng, không lỗi) — bảng đọc được công khai, đang chưa có dữ liệu.

- [ ] **Step 4: Thêm types**

Sửa `lib/types.ts` — thêm `position_slot: string | null` vào `MatchParticipant` (sau `confirmation`):

```ts
export interface MatchParticipant {
  id: string
  match_id: string
  member_id: string
  team: ParticipantTeam
  confirmation: ParticipantConfirmation
  position_slot: string | null
}
```

Và thêm ở cuối file:

```ts
export interface MatchLineup {
  id: string
  match_id: string
  team: ParticipantTeam
  formation: string
  created_at: string
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_match_lineups.sql lib/types.ts
git commit -m "feat: add match_lineups table and position_slot column"
```

---

### Task 2: Dữ liệu sơ đồ tĩnh

**Files:**
- Create: `lib/formations.ts`

**Interfaces:**
- Produces: type `FieldSize`, interface `FormationSlot`, const `FORMATIONS`, hàm `isFieldSize(value): value is FieldSize`, `getFormationNames(fieldSize): string[]`, `getFormationSlots(fieldSize, formation): FormationSlot[] | undefined`.

- [ ] **Step 1: Viết file**

Tạo `lib/formations.ts`:

```ts
export type FieldSize = 5 | 7

export interface FormationSlot {
  key: string
  label: string
  /** % từ mép trên sân, 0 = vạch cầu môn nhà, 100 = vạch cầu môn đối phương. */
  top: number
  /** % từ mép trái sân. */
  left: number
}

/**
 * Sơ đồ tĩnh, định nghĩa cứng — không cho admin tự tạo mới, không lưu DB.
 * Mục đích chỉ là truyền đạt vị trí ("hậu vệ phải"), không cần toạ độ chính xác.
 */
export const FORMATIONS: Record<FieldSize, Record<string, FormationSlot[]>> = {
  5: {
    '1-2-1': [
      { key: 'GK', label: 'Thủ môn', top: 90, left: 50 },
      { key: 'DF1', label: 'Hậu vệ', top: 70, left: 50 },
      { key: 'MF1', label: 'Tiền vệ 1', top: 45, left: 30 },
      { key: 'MF2', label: 'Tiền vệ 2', top: 45, left: 70 },
      { key: 'FW1', label: 'Tiền đạo', top: 15, left: 50 },
    ],
    '2-1-1': [
      { key: 'GK', label: 'Thủ môn', top: 90, left: 50 },
      { key: 'DF1', label: 'Hậu vệ 1', top: 70, left: 30 },
      { key: 'DF2', label: 'Hậu vệ 2', top: 70, left: 70 },
      { key: 'MF1', label: 'Tiền vệ', top: 45, left: 50 },
      { key: 'FW1', label: 'Tiền đạo', top: 15, left: 50 },
    ],
  },
  7: {
    '2-3-1': [
      { key: 'GK', label: 'Thủ môn', top: 90, left: 50 },
      { key: 'DF1', label: 'Hậu vệ 1', top: 72, left: 30 },
      { key: 'DF2', label: 'Hậu vệ 2', top: 72, left: 70 },
      { key: 'MF1', label: 'Tiền vệ 1', top: 48, left: 20 },
      { key: 'MF2', label: 'Tiền vệ 2', top: 48, left: 50 },
      { key: 'MF3', label: 'Tiền vệ 3', top: 48, left: 80 },
      { key: 'FW1', label: 'Tiền đạo', top: 15, left: 50 },
    ],
    '3-2-1': [
      { key: 'GK', label: 'Thủ môn', top: 90, left: 50 },
      { key: 'DF1', label: 'Hậu vệ 1', top: 72, left: 20 },
      { key: 'DF2', label: 'Hậu vệ 2', top: 72, left: 50 },
      { key: 'DF3', label: 'Hậu vệ 3', top: 72, left: 80 },
      { key: 'MF1', label: 'Tiền vệ 1', top: 45, left: 35 },
      { key: 'MF2', label: 'Tiền vệ 2', top: 45, left: 65 },
      { key: 'FW1', label: 'Tiền đạo', top: 15, left: 50 },
    ],
  },
}

export function isFieldSize(value: number): value is FieldSize {
  return value === 5 || value === 7
}

export function getFormationNames(fieldSize: FieldSize): string[] {
  return Object.keys(FORMATIONS[fieldSize])
}

export function getFormationSlots(fieldSize: FieldSize, formation: string): FormationSlot[] | undefined {
  return FORMATIONS[fieldSize][formation]
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Mong đợi: không in gì.

- [ ] **Step 3: Commit**

```bash
git add lib/formations.ts
git commit -m "feat: add static formation definitions"
```

---

### Task 3: Zod schema cho sơ đồ

**Files:**
- Create: `lib/validations/lineup.ts`
- Test: `lib/validations/lineup.test.ts`

**Interfaces:**
- Consumes: `FORMATIONS`, `FieldSize` (Task 2).
- Produces: `buildLineupSchema(fieldSize: FieldSize)`, type `LineupInput`.

- [ ] **Step 1: Viết test thất bại**

Tạo `lib/validations/lineup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildLineupSchema } from './lineup'

describe('buildLineupSchema', () => {
  it('nhận sơ đồ và các gán hợp lệ', () => {
    const schema = buildLineupSchema(5)
    const result = schema.safeParse({
      formation: '1-2-1',
      assignments: [
        { slot: 'GK', member_id: '3ead81b0-a323-44bc-827d-abc47936f1c0' },
        { slot: 'DF1', member_id: null },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('nhận sơ đồ chưa gán ai (assignments rỗng)', () => {
    const schema = buildLineupSchema(7)
    const result = schema.safeParse({ formation: '2-3-1', assignments: [] })
    expect(result.success).toBe(true)
  })

  it('từ chối sơ đồ không thuộc cỡ sân đang xét', () => {
    const schema = buildLineupSchema(5)
    const result = schema.safeParse({ formation: '2-3-1', assignments: [] })
    expect(result.success).toBe(false)
  })

  it('từ chối vị trí không thuộc sơ đồ đã chọn', () => {
    const schema = buildLineupSchema(5)
    const result = schema.safeParse({
      formation: '1-2-1',
      assignments: [{ slot: 'DF2', member_id: '3ead81b0-a323-44bc-827d-abc47936f1c0' }],
    })
    expect(result.success).toBe(false)
  })

  it('từ chối một cầu thủ giữ hai vị trí cùng lúc', () => {
    const schema = buildLineupSchema(7)
    const result = schema.safeParse({
      formation: '2-3-1',
      assignments: [
        { slot: 'DF1', member_id: '3ead81b0-a323-44bc-827d-abc47936f1c0' },
        { slot: 'DF2', member_id: '3ead81b0-a323-44bc-827d-abc47936f1c0' },
      ],
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Chạy để xác nhận fail**

```bash
npx vitest run lib/validations/lineup.test.ts
```

Mong đợi: FAIL với `Cannot find module './lineup'`.

- [ ] **Step 3: Viết schema**

Tạo `lib/validations/lineup.ts`:

```ts
import { z } from 'zod'
import { FORMATIONS, type FieldSize } from '@/lib/formations'

const assignmentSchema = z.object({
  slot: z.string().min(1),
  member_id: z.string().uuid().nullable(),
})

/**
 * Tạo theo `fieldSize` vì danh sách sơ đồ hợp lệ khác nhau giữa sân 5 và 7
 * người — không viết được một schema tĩnh dùng chung cho cả hai.
 */
export function buildLineupSchema(fieldSize: FieldSize) {
  return z
    .object({
      formation: z.string().min(1, 'Vui lòng chọn sơ đồ'),
      assignments: z.array(assignmentSchema),
    })
    .superRefine((data, ctx) => {
      const slots = FORMATIONS[fieldSize][data.formation]
      if (!slots) {
        ctx.addIssue({ code: 'custom', path: ['formation'], message: 'Sơ đồ không hợp lệ cho sân này' })
        return
      }

      const validSlotKeys = new Set(slots.map((s) => s.key))
      const seenMembers = new Set<string>()

      for (const a of data.assignments) {
        if (!validSlotKeys.has(a.slot)) {
          ctx.addIssue({ code: 'custom', path: ['assignments'], message: `Vị trí không hợp lệ: ${a.slot}` })
        }
        if (a.member_id) {
          if (seenMembers.has(a.member_id)) {
            ctx.addIssue({ code: 'custom', path: ['assignments'], message: 'Một cầu thủ không thể giữ hai vị trí' })
          }
          seenMembers.add(a.member_id)
        }
      }
    })
}

export type LineupInput = z.infer<ReturnType<typeof buildLineupSchema>>
```

- [ ] **Step 4: Chạy để xác nhận pass**

```bash
npx vitest run lib/validations/lineup.test.ts
```

Mong đợi: 5 test PASS.

- [ ] **Step 5: Chạy toàn bộ test**

```bash
npm test
```

Mong đợi: mọi test pass (56 test cũ + 5 test mới = 61), không cảnh báo.

- [ ] **Step 6: Commit**

```bash
git add lib/validations/lineup.ts lib/validations/lineup.test.ts
git commit -m "feat: add lineup validation schema"
```

---

### Task 4: Đọc dữ liệu sơ đồ

**Files:**
- Modify: `lib/data/matches.ts`

**Interfaces:**
- Consumes: `MatchLineup` (Task 1).
- Produces: `getMatchLineups(matchId: string): Promise<MatchLineup[]>`.

- [ ] **Step 1: Thêm hàm**

Sửa `lib/data/matches.ts` — thêm `MatchLineup` vào import ở dòng 2, và thêm hàm ở cuối file:

```ts
import type { Match, MatchParticipant, MatchEvent, MatchLineup, Member } from '@/lib/types'
```

```ts
export async function getMatchLineups(matchId: string): Promise<MatchLineup[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('match_lineups').select('*').eq('match_id', matchId)

  if (error) throw error
  return data
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Mong đợi: không in gì.

- [ ] **Step 3: Commit**

```bash
git add lib/data/matches.ts
git commit -m "feat: add match lineup data access"
```

---

### Task 5: Server Action `setLineup`

**Files:**
- Modify: `app/admin/tran-dau/actions.ts`

**Interfaces:**
- Consumes: `getMatch`, `getMatchParticipants` (đã có trong file); `isFieldSize`, `getFormationSlots` (Task 2); `buildLineupSchema` (Task 3).
- Produces: `setLineup(matchId: string, team: 'A' | 'B', formData: FormData)`.

- [ ] **Step 1: Thêm import**

Sửa `app/admin/tran-dau/actions.ts`, thêm vào khối import đã có ở đầu file:

```ts
import { getMatch, getMatchParticipants } from '@/lib/data/matches'
import { isFieldSize, getFormationSlots } from '@/lib/formations'
import { buildLineupSchema } from '@/lib/validations/lineup'
```

- [ ] **Step 2: Thêm action**

Thêm vào cuối `app/admin/tran-dau/actions.ts`:

```ts
export async function setLineup(matchId: string, team: 'A' | 'B', formData: FormData) {
  const match = await getMatch(matchId)
  if (!match) throw new Error('Không tìm thấy trận đấu')
  if (!isFieldSize(match.field_size)) throw new Error('Sân không hợp lệ')

  const formation = String(formData.get('formation') ?? '')
  const slots = getFormationSlots(match.field_size, formation) ?? []

  // Chỉ đưa vào assignments những ô có người được chọn — ô "-- Bỏ trống --"
  // không cần validate vì không tạo ra thay đổi gì.
  const assignments = slots
    .map((slot) => ({
      slot: slot.key,
      member_id: String(formData.get(`slot_${slot.key}`) ?? '') || null,
    }))
    .filter((a) => a.member_id !== null)

  const parsed = buildLineupSchema(match.field_size).safeParse({ formation, assignments })
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  // Zod không biết participant nào thuộc đội nào — kiểm tra riêng ở đây để
  // chặn form bị chỉnh sửa gán người của đội khác vào sơ đồ đội này.
  const participants = await getMatchParticipants(matchId)
  const teamParticipantIds = new Set(
    participants.filter((p) => p.team === team).map((p) => p.member_id)
  )
  for (const a of parsed.data.assignments) {
    if (a.member_id && !teamParticipantIds.has(a.member_id)) {
      throw new Error('Một cầu thủ được chọn không thuộc đội này')
    }
  }

  const supabase = await createSupabaseServerClient()

  const { error: lineupError } = await supabase
    .from('match_lineups')
    .upsert({ match_id: matchId, team, formation: parsed.data.formation }, { onConflict: 'match_id,team' })
  if (lineupError) throw lineupError

  // Xoá hết vị trí cũ của đội này trước, rồi gán lại theo lần submit này —
  // participant không có trong assignments sẽ về lại "chưa gán" (dự bị),
  // không mồ côi giá trị slot cũ khi đổi sơ đồ.
  const { error: resetError } = await supabase
    .from('match_participants')
    .update({ position_slot: null })
    .eq('match_id', matchId)
    .eq('team', team)
  if (resetError) throw resetError

  for (const a of parsed.data.assignments) {
    if (!a.member_id) continue
    const { error } = await supabase
      .from('match_participants')
      .update({ position_slot: a.slot })
      .eq('match_id', matchId)
      .eq('member_id', a.member_id)
      .eq('team', team)
    if (error) throw error
  }

  revalidatePath(`/admin/tran-dau/${matchId}`)
  revalidatePath(`/tran-dau/${matchId}`)
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Mong đợi: compile và TypeScript sạch.

- [ ] **Step 4: Commit**

```bash
git add app/admin/tran-dau/actions.ts
git commit -m "feat: add setLineup server action"
```

---

### Task 6: Trang admin — chọn sơ đồ và gán vị trí

**Files:**
- Modify: `app/admin/tran-dau/[id]/page.tsx`

**Interfaces:**
- Consumes: `getMatchLineups` (Task 4); `getFormationNames`, `getFormationSlots`, `isFieldSize` (Task 2); `setLineup` (Task 5).

- [ ] **Step 1: Viết lại toàn bộ file**

Thay toàn bộ nội dung `app/admin/tran-dau/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getMatch, getMatchParticipants, getMatchEvents, getMatchLineups } from '@/lib/data/matches'
import { getMembers } from '@/lib/data/members'
import { formatVietnamDateTime } from '@/lib/datetime'
import { getFormationNames, getFormationSlots, isFieldSize, type FieldSize } from '@/lib/formations'
import type { MatchParticipant, Member } from '@/lib/types'
import { setParticipants, recordResult, setLineup } from '../actions'

function renderLineupTeamSection({
  matchId,
  team,
  label,
  fieldSize,
  formationNames,
  selectedFormation,
  otherFormationValue,
  participants,
}: {
  matchId: string
  team: 'A' | 'B'
  label: string
  fieldSize: FieldSize
  formationNames: string[]
  selectedFormation: string
  otherFormationValue: string
  participants: (MatchParticipant & { member: Member })[]
}) {
  const slots = getFormationSlots(fieldSize, selectedFormation) ?? []
  const teamParticipants = participants
    .filter((p) => p.team === team)
    .slice()
    .sort((a, b) => (a.position_slot ? 1 : 0) - (b.position_slot ? 1 : 0))
  const formationParam = team === 'A' ? 'formation_a' : 'formation_b'
  const otherFormationParam = team === 'A' ? 'formation_b' : 'formation_a'

  return (
    <div className="rounded border p-4">
      <h3 className="font-semibold">{label}</h3>

      <form className="mt-2 flex items-end gap-2 text-sm">
        <input type="hidden" name={otherFormationParam} value={otherFormationValue} />
        <div>
          <label className="block text-sm font-medium">Sơ đồ</label>
          <select name={formationParam} defaultValue={selectedFormation} className="mt-1 rounded border px-2 py-1">
            {formationNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
          Chọn
        </button>
      </form>

      <form action={setLineup.bind(null, matchId, team)} className="mt-4 space-y-2">
        <input type="hidden" name="formation" value={selectedFormation} />
        {slots.map((slot) => {
          const current = teamParticipants.find((p) => p.position_slot === slot.key)
          return (
            <div key={slot.key} className="flex items-center gap-2">
              <span className="w-28 text-sm text-gray-600">{slot.label}</span>
              <select
                name={`slot_${slot.key}`}
                defaultValue={current?.member_id ?? ''}
                className="rounded border px-2 py-1 text-sm"
              >
                <option value="">-- Bỏ trống --</option>
                {teamParticipants.map((p) => (
                  <option key={p.member_id} value={p.member_id}>
                    {p.member.full_name}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
        <button type="submit" className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
          Lưu sơ đồ
        </button>
      </form>
    </div>
  )
}

export default async function ManageMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ formation_a?: string; formation_b?: string }>
}) {
  const { id } = await params
  const { formation_a, formation_b } = await searchParams
  const match = await getMatch(id)
  if (!match) notFound()

  const [members, participants, events, lineups] = await Promise.all([
    getMembers(),
    getMatchParticipants(id),
    getMatchEvents(id),
    getMatchLineups(id),
  ])
  const participantIds = new Set(participants.map((p) => p.member_id))

  const fieldSize = isFieldSize(match.field_size) ? match.field_size : null
  const formationNames = fieldSize ? getFormationNames(fieldSize) : []
  const lineupA = lineups.find((l) => l.team === 'A')
  const lineupB = lineups.find((l) => l.team === 'B')
  const selectedFormationA =
    (formation_a && formationNames.includes(formation_a) ? formation_a : lineupA?.formation) ??
    formationNames[0] ??
    ''
  const selectedFormationB =
    (formation_b && formationNames.includes(formation_b) ? formation_b : lineupB?.formation) ??
    formationNames[0] ??
    ''

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-bold">
          {match.match_type === 'internal' ? 'Trận nội bộ' : `Giao hữu vs ${match.opponent_name}`}
        </h1>
        <p className="text-gray-600">
          {formatVietnamDateTime(match.scheduled_at)} · {match.location} · Sân {match.field_size}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-bold">Người tham gia</h2>
        <form action={setParticipants.bind(null, id)} className="mt-4 space-y-2">
          {members
            .filter((m) => m.status === 'active')
            .map((member) => {
              const participant = participants.find((p) => p.member_id === member.id)
              return (
                <div key={member.id} className="flex items-center gap-3 border-b py-2">
                  <input type="checkbox" name="member_id" value={member.id} defaultChecked={participantIds.has(member.id)} />
                  <span className="flex-1">{member.full_name}</span>
                  {match.match_type === 'internal' && (
                    <select name={`team_${member.id}`} defaultValue={participant?.team ?? 'A'} className="rounded border px-2 py-1 text-sm">
                      <option value="A">Đội A</option>
                      <option value="B">Đội B</option>
                    </select>
                  )}
                </div>
              )
            })}
          <button type="submit" className="mt-4 rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
            Lưu danh sách
          </button>
        </form>
      </section>

      {fieldSize && (
        <section>
          <h2 className="text-lg font-bold">Sơ đồ đội hình</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {renderLineupTeamSection({
              matchId: id,
              team: 'A',
              label: match.match_type === 'internal' ? 'Đội A' : 'Đội mình',
              fieldSize,
              formationNames,
              selectedFormation: selectedFormationA,
              otherFormationValue: selectedFormationB,
              participants,
            })}
            {match.match_type === 'internal' &&
              renderLineupTeamSection({
                matchId: id,
                team: 'B',
                label: 'Đội B',
                fieldSize,
                formationNames,
                selectedFormation: selectedFormationB,
                otherFormationValue: selectedFormationA,
                participants,
              })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-bold">Kết quả trận</h2>
        <form action={recordResult.bind(null, id)} className="mt-4 space-y-4">
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-medium">
                {match.match_type === 'internal' ? 'Tỷ số Đội A' : 'Tỷ số đội mình'}
              </label>
              <input name="team_a_score" type="number" min="0" defaultValue={match.team_a_score ?? ''} className="mt-1 w-24 rounded border px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">
                {match.match_type === 'internal' ? 'Tỷ số Đội B' : 'Tỷ số đối thủ'}
              </label>
              <input name="team_b_score" type="number" min="0" defaultValue={match.team_b_score ?? ''} className="mt-1 w-24 rounded border px-3 py-2" />
            </div>
          </div>

          <div>
            <h3 className="font-medium">Bàn thắng / kiến tạo</h3>
            <p className="text-sm text-gray-500">Thêm từng dòng cho một bàn thắng hoặc kiến tạo.</p>
            {Array.from({ length: 6 }).map((_, i) => {
              const existing = events[i]
              return (
                <div key={i} className="mt-2 flex gap-2">
                  <select name="event_member_id" defaultValue={existing?.member_id ?? ''} className="rounded border px-2 py-1 text-sm">
                    <option value="">-- Cầu thủ --</option>
                    {participants.map((p) => (
                      <option key={p.member_id} value={p.member_id}>
                        {p.member.full_name}
                      </option>
                    ))}
                  </select>
                  <select name="event_type" defaultValue={existing?.event_type ?? ''} className="rounded border px-2 py-1 text-sm">
                    <option value="">-- Loại --</option>
                    <option value="goal">Bàn thắng</option>
                    <option value="assist">Kiến tạo</option>
                  </select>
                </div>
              )
            })}
          </div>

          <button type="submit" className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
            Lưu kết quả
          </button>
        </form>
      </section>
    </div>
  )
}
```

Section "Sơ đồ đội hình" chỉ hiện khi `fieldSize` hợp lệ (luôn đúng trong thực tế vì DB đã ràng buộc `field_size in (5,7)`; `isFieldSize` chỉ là lớp phòng thủ để không phải ép kiểu không an toàn khi gọi `getFormationSlots`).

Hai form của mỗi đội (`renderLineupTeamSection`) độc lập: form chọn sơ đồ dùng GET (không `action`, không `method` → mặc định GET, load lại trang qua query string `?formation_a=...` hoặc `?formation_b=...`), có `<input type="hidden">` giữ nguyên giá trị đang chọn của **đội kia** — thiếu dòng này thì đổi sơ đồ team A sẽ vô tình xoá lựa chọn của team B khỏi URL. Form gán vị trí dùng POST qua `setLineup.bind(null, matchId, team)`.

- [ ] **Step 2: Build**

```bash
npm run build
```

Mong đợi: compile và TypeScript sạch.

- [ ] **Step 3: Commit**

```bash
git add app/admin/tran-dau/[id]/page.tsx
git commit -m "feat: add lineup formation UI to match management page"
```

---

### Task 7: Trang public — vẽ sân

**Files:**
- Modify: `app/tran-dau/[id]/page.tsx`

**Interfaces:**
- Consumes: `getMatchLineups` (Task 4); `getFormationSlots`, `isFieldSize` (Task 2).

- [ ] **Step 1: Viết lại toàn bộ file**

Thay toàn bộ nội dung `app/tran-dau/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getMatch, getMatchParticipants, getMatchEvents, getMatchLineups } from '@/lib/data/matches'
import { formatVietnamDateTime } from '@/lib/datetime'
import { getFormationSlots, isFieldSize, type FieldSize } from '@/lib/formations'
import type { MatchParticipant, Member } from '@/lib/types'

function renderPitch({
  fieldSize,
  formation,
  label,
  participants,
}: {
  fieldSize: FieldSize
  formation: string
  label: string
  participants: (MatchParticipant & { member: Member })[]
}) {
  const slots = getFormationSlots(fieldSize, formation) ?? []
  const bench = participants.filter((p) => !p.position_slot)

  return (
    <div>
      <h3 className="font-semibold">{label}</h3>
      <div className="relative mt-2 aspect-[2/3] w-full max-w-xs rounded bg-green-700">
        <div className="absolute left-0 top-1/2 h-px w-full bg-white/40" />
        {slots.map((slot) => {
          const player = participants.find((p) => p.position_slot === slot.key)
          if (!player) return null
          return (
            <div
              key={slot.key}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-center text-xs font-medium text-white"
              style={{ top: `${slot.top}%`, left: `${slot.left}%` }}
            >
              {player.member.full_name}
            </div>
          )
        })}
      </div>
      {bench.length > 0 && (
        <p className="mt-2 text-sm text-gray-500">Dự bị: {bench.map((p) => p.member.full_name).join(', ')}</p>
      )}
    </div>
  )
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const match = await getMatch(id)
  if (!match) notFound()

  const [participants, events, lineups] = await Promise.all([
    getMatchParticipants(id),
    getMatchEvents(id),
    getMatchLineups(id),
  ])

  const teamA = participants.filter((p) => p.team === 'A')
  const teamB = participants.filter((p) => p.team === 'B')
  const fieldSize = isFieldSize(match.field_size) ? match.field_size : null
  const lineupA = lineups.find((l) => l.team === 'A')
  const lineupB = lineups.find((l) => l.team === 'B')

  const eventLabel = (memberId: string) => {
    const memberEvents = events.filter((e) => e.member_id === memberId)
    if (memberEvents.length === 0) return null
    return memberEvents.map((e) => (e.event_type === 'goal' ? '⚽' : '🎯')).join(' ')
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">
        {match.match_type === 'internal' ? 'Trận nội bộ' : `Giao hữu vs ${match.opponent_name}`}
      </h1>
      <p className="text-gray-600">
        {formatVietnamDateTime(match.scheduled_at)} · {match.location} · Sân {match.field_size}
      </p>

      {match.status === 'completed' && (
        <p className="mt-2 text-xl font-bold">
          {match.team_a_score} : {match.team_b_score}
        </p>
      )}

      {fieldSize && (lineupA || lineupB) && (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {lineupA &&
            renderPitch({
              fieldSize,
              formation: lineupA.formation,
              label: match.match_type === 'internal' ? 'Đội A' : 'Đội mình',
              participants: teamA,
            })}
          {match.match_type === 'internal' &&
            lineupB &&
            renderPitch({
              fieldSize,
              formation: lineupB.formation,
              label: 'Đội B',
              participants: teamB,
            })}
        </div>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="font-semibold">{match.match_type === 'internal' ? 'Đội A' : 'Đội mình'}</h2>
          <ul className="mt-2 space-y-1">
            {teamA.map((p) => (
              <li key={p.id}>
                {p.member.full_name} {eventLabel(p.member_id)}
              </li>
            ))}
          </ul>
        </div>
        {match.match_type === 'internal' && (
          <div>
            <h2 className="font-semibold">Đội B</h2>
            <ul className="mt-2 space-y-1">
              {teamB.map((p) => (
                <li key={p.id}>
                  {p.member.full_name} {eventLabel(p.member_id)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  )
}
```

Khối vẽ sân chỉ hiện khi có ít nhất một `match_lineups` cho trận — trận chưa được admin xếp sơ đồ vẫn hiện đúng như cũ (danh sách tên phía dưới), không đổi gì.

- [ ] **Step 2: Build**

```bash
npm run build
```

Mong đợi: compile và TypeScript sạch.

- [ ] **Step 3: Commit**

```bash
git add app/tran-dau/[id]/page.tsx
git commit -m "feat: render lineup pitch diagram on public match page"
```

---

### Task 8: Kiểm thử toàn luồng

**Files:** không sửa file nào — chỉ kiểm chứng.

**Interfaces:** none.

- [ ] **Step 1: Chạy toàn bộ test và build**

```bash
npm test
npm run build
```

Mong đợi: 61 test pass (56 cũ + 5 mới), build sạch.

- [ ] **Step 2: Kiểm thử thủ công — trận nội bộ**

Yêu cầu: đã apply migration `0005` (Task 1 Step 2), đã đăng nhập admin, có sẵn một trận `internal` sân 7 với ít nhất 4 participant mỗi đội (từ MVP).

1. Mở `/admin/tran-dau/<id>`, ở section "Sơ đồ đội hình": chọn sơ đồ `2-3-1` cho Đội A, bấm "Chọn" → 7 dropdown xuất hiện đúng nhãn (Thủ môn, Hậu vệ 1, Hậu vệ 2, Tiền vệ 1-3, Tiền đạo).
2. Gán 4-5 người vào các ô, bấm "Lưu sơ đồ" → không lỗi.
3. Đổi sơ đồ Đội A sang `3-2-1`, bấm "Chọn" → số ô đổi thành 7 ô khác (3 hậu vệ, 2 tiền vệ), gán lại vẫn được — xác nhận lựa chọn sơ đồ của Đội B **không bị mất** khỏi URL.
4. Gán và lưu sơ đồ cho Đội B tương tự.
5. Mở `/tran-dau/<id>` ở cửa sổ chưa đăng nhập → thấy 2 sân, tên đúng vị trí đã gán cho cả 2 đội; người tham gia nhưng chưa gán vị trí hiện ở dòng "Dự bị".

- [ ] **Step 3: Kiểm thử thủ công — trận giao hữu**

Mở `/admin/tran-dau/<id>` của một trận `friendly`: chỉ thấy khối "Đội mình", không có khối Đội B. Gán và lưu như trên. Mở trang public, chỉ thấy 1 sân.

- [ ] **Step 4: Kiểm thử thủ công — validate**

Từ trang admin, để trống toàn bộ dropdown của Đội A rồi bấm "Lưu sơ đồ" → không lỗi, không ai hiện trên sân sau khi lưu (đúng vì "assignments rỗng" hợp lệ theo Task 3).

- [ ] **Step 5: Không cần commit**

Task này chỉ kiểm chứng, không sửa file.
