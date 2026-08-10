# MVP Quản lý Đội bóng Phủi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of a football-club management website for one team: admin auth, member management, match management (create/lineup/result), fund tracking, and public read-only pages (schedule, members, fund, scoring leaderboard).

**Architecture:** Next.js 14+ (App Router, TypeScript) as a single app. Public pages are Server Components reading directly from Supabase Postgres. Admin mutations use Next.js Server Actions (no separate REST layer — there is no external API consumer, so a dedicated `/api/*` route layer would be redundant). Supabase provides Postgres, Auth (email/password for 1-3 admins), and Row Level Security enforcing "anyone can read, only authenticated users can write." Deployed on Vercel + Supabase Cloud, both free tier.

**Tech Stack:** Next.js 14+, TypeScript, Tailwind CSS (via `create-next-app` defaults), `@supabase/supabase-js`, `@supabase/ssr`, Zod, Vitest.

## Global Constraints

- Single team, no multi-tenant logic — every table is global, no `organization_id` anywhere.
- Only one role exists: "admin". No per-role permission matrix — `auth.role() = 'authenticated'` is the only write gate, both in Supabase RLS policies and implicitly in Server Actions (they run behind `/admin/*`, which the middleware guards).
- All public routes must render without a signed-in session (verify in an incognito window / logged-out browser).
- Fund balance and scoring leaderboard are always computed at query time from `fund_transactions` / `match_events` — never store a running total or cached rank in the DB.
- The public `/quy` page shows aggregate income/expense and the transaction list, but never per-member due/debt status — that stays admin-only (out of scope for MVP anyway; `member_dues` is a Phase 2 table).
- UI copy is in Vietnamese, matching the spec's terminology (`Thu`/`Chi`, `Nội bộ`/`Giao hữu`, `Sắp tới`/`Đã diễn ra`).
- Matches support two field sizes only: 5 or 7 (`field_size` DB check constraint enforces this).

---

### Task 1: Scaffold the Next.js project and tooling

**Files:**
- Create: entire Next.js scaffold (via `create-next-app`) — `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, etc.
- Create: `vitest.config.ts`
- Create: `lib/sanity.test.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces: a working `npm run dev` / `npm run build` / `npm test` toolchain that every later task relies on.

- [ ] **Step 1: Scaffold with create-next-app**

Run from the repo root (`/Users/namt9/Documents/study/web-football-club`):

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

If prompted interactively, answer to match those flags (TypeScript: yes, Tailwind: yes, ESLint: yes, App Router: yes, `src/` directory: no, import alias: `@/*`). Decline Turbopack-specific prompts with the tool's default.

- [ ] **Step 2: Verify the scaffold builds**

Run: `npm run build`
Expected: build completes successfully (exits 0), producing the default Next.js starter page.

- [ ] **Step 3: Install project dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr zod
npm install -D vitest
```

- [ ] **Step 4: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 5: Add the `test` script**

Modify `package.json` — add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 6: Write a sanity test**

Create `lib/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 7: Run the sanity test**

Run: `npm test`
Expected: 1 test file, 1 test passed.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with Vitest"
```

---

### Task 2: Supabase project, DB schema, and client helpers

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/browser.ts`
- Create: `lib/types.ts`
- Create: `.env.local.example`
- Modify: `.gitignore` (ensure `.env.local` is ignored — `create-next-app` already adds this; verify)

**Interfaces:**
- Produces: `createSupabaseServerClient(): Promise<SupabaseClient>` (server.ts), `createSupabaseBrowserClient(): SupabaseClient` (browser.ts), and the shared types `Member`, `FundTransaction`, `Match`, `MatchParticipant`, `MatchEvent` used by every later task.

- [ ] **Step 1: Create a Supabase project (manual, external)**

Go to https://supabase.com/dashboard, create a new project (any region close to you, any DB password — save it somewhere safe). Wait for provisioning to finish.

- [ ] **Step 2: Get the API credentials (manual, external)**

In the Supabase dashboard: Project Settings → API. Copy the **Project URL** and the **anon public key**.

- [ ] **Step 3: Write the env example and your local env file**

Create `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Create `.env.local` (not committed) with your real values from Step 2.

- [ ] **Step 4: Write the schema migration**

Create `supabase/migrations/0001_init.sql`:

```sql
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
```

- [ ] **Step 5: Apply the migration (manual, external)**

In the Supabase dashboard: SQL Editor → New query → paste the full contents of `supabase/migrations/0001_init.sql` → Run.
Expected: "Success. No rows returned" and the 5 tables visible under Table Editor.

- [ ] **Step 6: Write shared types**

Create `lib/types.ts`:

```ts
export type MemberPosition = 'GK' | 'DF' | 'MF' | 'FW'
export type MemberStatus = 'active' | 'inactive'

export interface Member {
  id: string
  full_name: string
  jersey_number: number | null
  position: MemberPosition | null
  phone: string | null
  photo_url: string | null
  joined_at: string
  status: MemberStatus
  created_at: string
}

export type TransactionType = 'income' | 'expense'

export interface FundTransaction {
  id: string
  transaction_type: TransactionType
  category: string
  amount: number
  occurred_on: string
  description: string | null
  match_id: string | null
  member_id: string | null
  created_at: string
}

export type MatchType = 'internal' | 'friendly'
export type MatchStatus = 'upcoming' | 'completed' | 'cancelled'

export interface Match {
  id: string
  match_type: MatchType
  field_size: number
  scheduled_at: string
  location: string
  opponent_name: string | null
  team_a_score: number | null
  team_b_score: number | null
  status: MatchStatus
  created_at: string
}

export type ParticipantTeam = 'A' | 'B'
export type ParticipantConfirmation = 'pending' | 'confirmed' | 'declined'

export interface MatchParticipant {
  id: string
  match_id: string
  member_id: string
  team: ParticipantTeam
  confirmation: ParticipantConfirmation
}

export type MatchEventType = 'goal' | 'assist'

export interface MatchEvent {
  id: string
  match_id: string
  member_id: string
  event_type: MatchEventType
  minute: number | null
}
```

- [ ] **Step 7: Write the server Supabase client**

Create `lib/supabase/server.ts`:

```ts
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component render; safe to ignore because
            // middleware refreshes the session on every request.
          }
        },
      },
    }
  )
}
```

- [ ] **Step 8: Write the browser Supabase client**

Create `lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 9: Verify the build still passes**

Run: `npm run build`
Expected: exits 0 (the new files compile; nothing calls them yet, so no runtime check possible here).

- [ ] **Step 10: Commit**

```bash
git add lib/supabase lib/types.ts supabase .env.local.example package.json package-lock.json
git commit -m "feat: add Supabase schema, RLS policies, and client helpers"
```

---

### Task 3: Auth — login page and `/admin` route protection

**Files:**
- Create: `middleware.ts`
- Create: `app/login/actions.ts`
- Create: `app/login/page.tsx`
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseServerClient()` from Task 2.
- Produces: `signOut(): Promise<void>` (Server Action, imported by `app/admin/layout.tsx` and reusable by later admin pages).

- [ ] **Step 1: Create an admin user (manual, external)**

In the Supabase dashboard: Authentication → Users → Add user. Enter your email and a password, and check "Auto Confirm User". This is the only account creation flow — there is no public sign-up UI.

- [ ] **Step 2: Write the middleware**

Create `middleware.ts` (repo root, next to `package.json`):

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/admin')) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
```

- [ ] **Step 3: Write the login Server Actions**

Create `app/login/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/admin')

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`)
  }

  redirect(next)
}

export async function signOut() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 4: Write the login page**

Create `app/login/page.tsx`:

```tsx
import { signIn } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next = '/admin' } = await searchParams

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-6 text-2xl font-bold">Đăng nhập Admin</h1>
      {error && <p className="mb-4 rounded bg-red-100 p-3 text-sm text-red-700">{error}</p>}
      <form action={signIn} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input type="email" name="email" required className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Mật khẩu</label>
          <input type="password" name="password" required className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <button type="submit" className="w-full rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
          Đăng nhập
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 5: Write the admin layout and dashboard placeholder**

Create `app/admin/layout.tsx`:

```tsx
import Link from 'next/link'
import { signOut } from '../login/actions'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <nav className="flex gap-4 text-sm font-medium">
          <Link href="/admin">Tổng quan</Link>
          <Link href="/admin/thanh-vien">Thành viên</Link>
          <Link href="/admin/quy">Quỹ</Link>
          <Link href="/admin/tran-dau">Trận đấu</Link>
        </nav>
        <form action={signOut}>
          <button type="submit" className="text-sm text-red-600 hover:underline">
            Đăng xuất
          </button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
```

Create `app/admin/page.tsx`:

```tsx
export default function AdminHomePage() {
  return (
    <div>
      <h1 className="text-xl font-bold">Tổng quan quản trị</h1>
      <p className="mt-2 text-gray-600">
        Chọn một mục ở menu để quản lý thành viên, quỹ, hoặc trận đấu.
      </p>
    </div>
  )
}
```

- [ ] **Step 6: Verify manually**

Run `npm run dev`, then in a browser:
1. Visit `/admin` while logged out → expect a redirect to `/login?next=%2Fadmin`.
2. Log in with the admin credentials from Step 1 → expect a redirect to `/admin` showing "Tổng quan quản trị".
3. Click "Đăng xuất" → expect a redirect to `/login`, and visiting `/admin` again redirects back to `/login`.

- [ ] **Step 7: Commit**

```bash
git add middleware.ts app/login app/admin
git commit -m "feat: add admin auth with Supabase and route protection"
```

---

### Task 4: Member validation and data access

**Files:**
- Create: `lib/validations/member.ts`
- Create: `lib/validations/member.test.ts`
- Create: `lib/data/members.ts`

**Interfaces:**
- Consumes: `Member` type (Task 2), `createSupabaseServerClient()` (Task 2).
- Produces: `memberSchema: ZodSchema`, `MemberInput` type, `getMembers(): Promise<Member[]>`, `getMember(id: string): Promise<Member | null>` — all consumed by Tasks 5 and 6.

- [ ] **Step 1: Write the failing test**

Create `lib/validations/member.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { memberSchema } from './member'

describe('memberSchema', () => {
  it('accepts a valid member', () => {
    const result = memberSchema.safeParse({
      full_name: 'Nguyễn Văn A',
      jersey_number: 10,
      position: 'FW',
      phone: '0912345678',
      status: 'active',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty full_name', () => {
    const result = memberSchema.safeParse({ full_name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid position', () => {
    const result = memberSchema.safeParse({ full_name: 'A', position: 'XX' })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/validations/member.test.ts`
Expected: FAIL — `Cannot find module './member'`.

- [ ] **Step 3: Write the schema**

Create `lib/validations/member.ts`:

```ts
import { z } from 'zod'

export const memberSchema = z.object({
  full_name: z.string().trim().min(1, 'Họ tên không được để trống'),
  jersey_number: z.coerce.number().int().min(0).max(99).nullable().optional(),
  position: z.enum(['GK', 'DF', 'MF', 'FW']).nullable().optional(),
  phone: z.string().trim().min(8).max(15).nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
})

export type MemberInput = z.infer<typeof memberSchema>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/validations/member.test.ts`
Expected: 3 tests passed.

- [ ] **Step 5: Write the data access functions**

Create `lib/data/members.ts`:

```ts
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Member } from '@/lib/types'

export async function getMembers(): Promise<Member[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('members').select('*').order('full_name')

  if (error) throw error
  return data
}

export async function getMember(id: string): Promise<Member | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('members').select('*').eq('id', id).maybeSingle()

  if (error) throw error
  return data
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests passed (sanity test + 3 member schema tests).

- [ ] **Step 7: Commit**

```bash
git add lib/validations/member.ts lib/validations/member.test.ts lib/data/members.ts
git commit -m "feat: add member validation schema and data access"
```

---

### Task 5: Admin UI — member management

**Files:**
- Create: `app/admin/thanh-vien/actions.ts`
- Create: `app/admin/thanh-vien/MemberForm.tsx`
- Create: `app/admin/thanh-vien/page.tsx`
- Create: `app/admin/thanh-vien/[id]/page.tsx`

**Interfaces:**
- Consumes: `memberSchema` (Task 4), `getMembers`/`getMember` (Task 4), `Member` type (Task 2).
- Produces: `createMember`, `updateMember`, `deleteMember` Server Actions (not consumed elsewhere, but must keep these exact names — referenced by this task's own UI files).

- [ ] **Step 1: Write the Server Actions**

Create `app/admin/thanh-vien/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { memberSchema } from '@/lib/validations/member'

export async function createMember(formData: FormData) {
  const parsed = memberSchema.safeParse({
    full_name: formData.get('full_name'),
    jersey_number: formData.get('jersey_number') || null,
    position: formData.get('position') || null,
    phone: formData.get('phone') || null,
    status: formData.get('status') || 'active',
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('members').insert(parsed.data)
  if (error) throw error

  revalidatePath('/admin/thanh-vien')
  revalidatePath('/thanh-vien')
  redirect('/admin/thanh-vien')
}

export async function updateMember(id: string, formData: FormData) {
  const parsed = memberSchema.safeParse({
    full_name: formData.get('full_name'),
    jersey_number: formData.get('jersey_number') || null,
    position: formData.get('position') || null,
    phone: formData.get('phone') || null,
    status: formData.get('status') || 'active',
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('members').update(parsed.data).eq('id', id)
  if (error) throw error

  revalidatePath('/admin/thanh-vien')
  revalidatePath('/thanh-vien')
  redirect('/admin/thanh-vien')
}

export async function deleteMember(id: string) {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('members').delete().eq('id', id)
  if (error) throw error

  revalidatePath('/admin/thanh-vien')
  revalidatePath('/thanh-vien')
}
```

- [ ] **Step 2: Write the shared form component**

Create `app/admin/thanh-vien/MemberForm.tsx`:

```tsx
'use client'

import type { Member } from '@/lib/types'

export function MemberForm({
  member,
  action,
}: {
  member?: Member
  action: (formData: FormData) => void
}) {
  return (
    <form action={action} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium">Họ tên</label>
        <input name="full_name" defaultValue={member?.full_name} required className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Số áo</label>
        <input name="jersey_number" type="number" defaultValue={member?.jersey_number ?? ''} className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Vị trí</label>
        <select name="position" defaultValue={member?.position ?? ''} className="mt-1 w-full rounded border px-3 py-2">
          <option value="">-- Chọn --</option>
          <option value="GK">Thủ môn (GK)</option>
          <option value="DF">Hậu vệ (DF)</option>
          <option value="MF">Tiền vệ (MF)</option>
          <option value="FW">Tiền đạo (FW)</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Số điện thoại</label>
        <input name="phone" defaultValue={member?.phone ?? ''} className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Trạng thái</label>
        <select name="status" defaultValue={member?.status ?? 'active'} className="mt-1 w-full rounded border px-3 py-2">
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Ngừng hoạt động</option>
        </select>
      </div>
      <button type="submit" className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
        Lưu
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Write the list + create page**

Create `app/admin/thanh-vien/page.tsx`:

```tsx
import Link from 'next/link'
import { getMembers } from '@/lib/data/members'
import { createMember, deleteMember } from './actions'
import { MemberForm } from './MemberForm'

export default async function AdminMembersPage() {
  const members = await getMembers()

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-bold">Thêm thành viên</h1>
        <div className="mt-4">
          <MemberForm action={createMember} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">Danh sách thành viên ({members.length})</h2>
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Họ tên</th>
              <th className="py-2">Số áo</th>
              <th className="py-2">Vị trí</th>
              <th className="py-2">Trạng thái</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b">
                <td className="py-2">{member.full_name}</td>
                <td className="py-2">{member.jersey_number ?? '-'}</td>
                <td className="py-2">{member.position ?? '-'}</td>
                <td className="py-2">{member.status === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động'}</td>
                <td className="py-2 space-x-3">
                  <Link href={`/admin/thanh-vien/${member.id}`} className="text-blue-600">
                    Sửa
                  </Link>
                  <form action={deleteMember.bind(null, member.id)} className="inline">
                    <button type="submit" className="text-red-600">
                      Xóa
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Write the edit page**

Create `app/admin/thanh-vien/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getMember } from '@/lib/data/members'
import { updateMember } from '../actions'
import { MemberForm } from '../MemberForm'

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const member = await getMember(id)
  if (!member) notFound()

  return (
    <div>
      <h1 className="text-xl font-bold">Sửa thành viên</h1>
      <div className="mt-4">
        <MemberForm member={member} action={updateMember.bind(null, id)} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify manually**

Run `npm run dev`, log in, go to `/admin/thanh-vien`:
1. Create a member with full name "Nguyễn Văn A", jersey 10, position FW → expect it to appear in the list below.
2. Click "Sửa" → change status to "Ngừng hoạt động" → Save → expect the list to reflect the new status.
3. Click "Xóa" on a test member → expect it to disappear from the list.

- [ ] **Step 6: Commit**

```bash
git add app/admin/thanh-vien
git commit -m "feat: add admin member management UI"
```

---

### Task 6: Public members page

**Files:**
- Create: `app/thanh-vien/page.tsx`

**Interfaces:**
- Consumes: `getMembers()` (Task 4).

- [ ] **Step 1: Write the page**

Create `app/thanh-vien/page.tsx`:

```tsx
import { getMembers } from '@/lib/data/members'

export default async function MembersPage() {
  const members = await getMembers()
  const active = members.filter((m) => m.status === 'active')

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Thành viên đội</h1>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {active.map((member) => (
          <li key={member.id} className="rounded border p-4">
            <p className="font-semibold">
              {member.full_name} {member.jersey_number ? `#${member.jersey_number}` : ''}
            </p>
            <p className="text-sm text-gray-600">{member.position ?? 'Chưa rõ vị trí'}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 2: Verify manually**

Log out (or use an incognito window), visit `/thanh-vien` → expect the active members created in Task 5 to render without needing to sign in.

- [ ] **Step 3: Commit**

```bash
git add app/thanh-vien
git commit -m "feat: add public members page"
```

---

### Task 7: Fund transaction validation, fund balance calculation, and data access

**Files:**
- Create: `lib/validations/fund-transaction.ts`
- Create: `lib/validations/fund-transaction.test.ts`
- Create: `lib/stats/fund-balance.ts`
- Create: `lib/stats/fund-balance.test.ts`
- Create: `lib/data/fund-transactions.ts`

**Interfaces:**
- Consumes: `FundTransaction` type (Task 2).
- Produces: `fundTransactionSchema`, `FundTransactionInput` type; `computeFundSummary(transactions: FundTransaction[]): FundSummary` where `FundSummary = { totalIncome: number, totalExpense: number, balance: number }`; `getFundTransactions(): Promise<FundTransaction[]>` — all consumed by Tasks 8, 9, and 18.

- [ ] **Step 1: Write the failing validation test**

Create `lib/validations/fund-transaction.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fundTransactionSchema } from './fund-transaction'

describe('fundTransactionSchema', () => {
  it('accepts a valid income transaction', () => {
    const result = fundTransactionSchema.safeParse({
      transaction_type: 'income',
      category: 'Quỹ tháng',
      amount: 500000,
      occurred_on: '2026-08-01',
    })
    expect(result.success).toBe(true)
  })

  it('rejects zero or negative amount', () => {
    const result = fundTransactionSchema.safeParse({
      transaction_type: 'expense',
      category: 'Tiền sân',
      amount: 0,
      occurred_on: '2026-08-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty category', () => {
    const result = fundTransactionSchema.safeParse({
      transaction_type: 'income',
      category: '',
      amount: 100000,
      occurred_on: '2026-08-01',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/validations/fund-transaction.test.ts`
Expected: FAIL — `Cannot find module './fund-transaction'`.

- [ ] **Step 3: Write the schema**

Create `lib/validations/fund-transaction.ts`:

```ts
import { z } from 'zod'

export const fundTransactionSchema = z.object({
  transaction_type: z.enum(['income', 'expense']),
  category: z.string().trim().min(1, 'Hạng mục không được để trống'),
  amount: z.coerce.number().positive('Số tiền phải lớn hơn 0'),
  occurred_on: z.string().min(1, 'Ngày không được để trống'),
  description: z.string().trim().nullable().optional(),
  match_id: z.string().uuid().nullable().optional(),
  member_id: z.string().uuid().nullable().optional(),
})

export type FundTransactionInput = z.infer<typeof fundTransactionSchema>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/validations/fund-transaction.test.ts`
Expected: 3 tests passed.

- [ ] **Step 5: Write the failing fund-balance test**

Create `lib/stats/fund-balance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeFundSummary } from './fund-balance'
import type { FundTransaction } from '@/lib/types'

function tx(overrides: Partial<FundTransaction>): FundTransaction {
  return {
    id: '1',
    transaction_type: 'income',
    category: 'quỹ tháng',
    amount: 100000,
    occurred_on: '2026-08-01',
    description: null,
    match_id: null,
    member_id: null,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeFundSummary', () => {
  it('returns zero balance for no transactions', () => {
    expect(computeFundSummary([])).toEqual({ totalIncome: 0, totalExpense: 0, balance: 0 })
  })

  it('sums income and expense separately and computes balance', () => {
    const transactions = [
      tx({ transaction_type: 'income', amount: 500000 }),
      tx({ transaction_type: 'income', amount: 200000 }),
      tx({ transaction_type: 'expense', amount: 150000 }),
    ]
    expect(computeFundSummary(transactions)).toEqual({
      totalIncome: 700000,
      totalExpense: 150000,
      balance: 550000,
    })
  })

  it('handles expense-only transactions producing a negative balance', () => {
    const transactions = [tx({ transaction_type: 'expense', amount: 100000 })]
    expect(computeFundSummary(transactions)).toEqual({
      totalIncome: 0,
      totalExpense: 100000,
      balance: -100000,
    })
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run lib/stats/fund-balance.test.ts`
Expected: FAIL — `Cannot find module './fund-balance'`.

- [ ] **Step 7: Write the calculation function**

Create `lib/stats/fund-balance.ts`:

```ts
import type { FundTransaction } from '@/lib/types'

export interface FundSummary {
  totalIncome: number
  totalExpense: number
  balance: number
}

export function computeFundSummary(transactions: FundTransaction[]): FundSummary {
  let totalIncome = 0
  let totalExpense = 0

  for (const t of transactions) {
    if (t.transaction_type === 'income') {
      totalIncome += t.amount
    } else {
      totalExpense += t.amount
    }
  }

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  }
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run lib/stats/fund-balance.test.ts`
Expected: 3 tests passed.

- [ ] **Step 9: Write the data access function**

Create `lib/data/fund-transactions.ts`:

```ts
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { FundTransaction } from '@/lib/types'

export async function getFundTransactions(): Promise<FundTransaction[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('fund_transactions')
    .select('*')
    .order('occurred_on', { ascending: false })

  if (error) throw error
  return data
}
```

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: all tests passed.

- [ ] **Step 11: Commit**

```bash
git add lib/validations/fund-transaction.ts lib/validations/fund-transaction.test.ts lib/stats/fund-balance.ts lib/stats/fund-balance.test.ts lib/data/fund-transactions.ts
git commit -m "feat: add fund transaction validation, balance calculation, and data access"
```

---

### Task 8: Admin UI — fund transactions

**Files:**
- Create: `app/admin/quy/actions.ts`
- Create: `app/admin/quy/page.tsx`

**Interfaces:**
- Consumes: `fundTransactionSchema` (Task 7), `getFundTransactions` (Task 7), `computeFundSummary` (Task 7).
- Produces: `createFundTransaction` Server Action (consumed by this task's own page).

- [ ] **Step 1: Write the Server Action**

Create `app/admin/quy/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { fundTransactionSchema } from '@/lib/validations/fund-transaction'

export async function createFundTransaction(formData: FormData) {
  const parsed = fundTransactionSchema.safeParse({
    transaction_type: formData.get('transaction_type'),
    category: formData.get('category'),
    amount: formData.get('amount'),
    occurred_on: formData.get('occurred_on'),
    description: formData.get('description') || null,
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('fund_transactions').insert(parsed.data)
  if (error) throw error

  revalidatePath('/admin/quy')
  revalidatePath('/quy')
  redirect('/admin/quy')
}
```

- [ ] **Step 2: Write the page**

Create `app/admin/quy/page.tsx`:

```tsx
import { getFundTransactions } from '@/lib/data/fund-transactions'
import { computeFundSummary } from '@/lib/stats/fund-balance'
import { createFundTransaction } from './actions'

export default async function AdminFundPage() {
  const transactions = await getFundTransactions()
  const summary = computeFundSummary(transactions)

  return (
    <div className="space-y-8">
      <section className="rounded border bg-white p-4">
        <p className="text-sm text-gray-600">Số dư hiện tại</p>
        <p className="text-2xl font-bold">{summary.balance.toLocaleString('vi-VN')} đ</p>
        <p className="text-sm text-gray-500">
          Thu: {summary.totalIncome.toLocaleString('vi-VN')} đ · Chi: {summary.totalExpense.toLocaleString('vi-VN')} đ
        </p>
      </section>

      <section>
        <h1 className="text-xl font-bold">Thêm giao dịch</h1>
        <form action={createFundTransaction} className="mt-4 max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium">Loại</label>
            <select name="transaction_type" className="mt-1 w-full rounded border px-3 py-2">
              <option value="income">Thu</option>
              <option value="expense">Chi</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Hạng mục</label>
            <input name="category" placeholder="Quỹ tháng, tiền sân, đồng phục..." required className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Số tiền (đ)</label>
            <input name="amount" type="number" min="0" step="1000" required className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Ngày</label>
            <input name="occurred_on" type="date" required className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Mô tả</label>
            <textarea name="description" className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <button type="submit" className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
            Lưu
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-xl font-bold">Lịch sử giao dịch</h2>
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Ngày</th>
              <th className="py-2">Loại</th>
              <th className="py-2">Hạng mục</th>
              <th className="py-2">Số tiền</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-b">
                <td className="py-2">{t.occurred_on}</td>
                <td className="py-2">{t.transaction_type === 'income' ? 'Thu' : 'Chi'}</td>
                <td className="py-2">{t.category}</td>
                <td className="py-2">{t.amount.toLocaleString('vi-VN')} đ</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Verify manually**

Log in, go to `/admin/quy`:
1. Add an income transaction (500000, "Quỹ tháng") → expect the balance to become 500,000 đ and the row to appear in the history table.
2. Add an expense transaction (100000, "Tiền sân") → expect balance to become 400,000 đ.

- [ ] **Step 4: Commit**

```bash
git add app/admin/quy
git commit -m "feat: add admin fund transaction UI"
```

---

### Task 9: Public fund page

**Files:**
- Create: `app/quy/page.tsx`

**Interfaces:**
- Consumes: `getFundTransactions` (Task 7), `computeFundSummary` (Task 7).

- [ ] **Step 1: Write the page**

Create `app/quy/page.tsx`:

```tsx
import { getFundTransactions } from '@/lib/data/fund-transactions'
import { computeFundSummary } from '@/lib/stats/fund-balance'

export default async function PublicFundPage() {
  const transactions = await getFundTransactions()
  const summary = computeFundSummary(transactions)

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Quỹ đội</h1>
      <section className="mt-4 rounded border bg-white p-4">
        <p className="text-sm text-gray-600">Số dư hiện tại</p>
        <p className="text-2xl font-bold">{summary.balance.toLocaleString('vi-VN')} đ</p>
        <p className="text-sm text-gray-500">
          Thu: {summary.totalIncome.toLocaleString('vi-VN')} đ · Chi: {summary.totalExpense.toLocaleString('vi-VN')} đ
        </p>
      </section>

      <table className="mt-6 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Ngày</th>
            <th className="py-2">Loại</th>
            <th className="py-2">Hạng mục</th>
            <th className="py-2">Số tiền</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="py-2">{t.occurred_on}</td>
              <td className="py-2">{t.transaction_type === 'income' ? 'Thu' : 'Chi'}</td>
              <td className="py-2">{t.category}</td>
              <td className="py-2">{t.amount.toLocaleString('vi-VN')} đ</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

Note: this page intentionally shows only aggregate income/expense and the transaction list — no per-member due/debt data (out of MVP scope per the spec).

- [ ] **Step 2: Verify manually**

Logged out, visit `/quy` → expect the same balance and transactions from Task 8 to render without signing in.

- [ ] **Step 3: Commit**

```bash
git add app/quy
git commit -m "feat: add public fund page"
```

---

### Task 10: Match validation and data access

**Files:**
- Create: `lib/validations/match.ts`
- Create: `lib/validations/match.test.ts`
- Create: `lib/data/matches.ts`

**Interfaces:**
- Consumes: `Match`, `MatchParticipant`, `MatchEvent`, `Member` types (Task 2).
- Produces: `matchSchema`, `MatchInput` type; `getMatches(): Promise<Match[]>`, `getMatch(id: string): Promise<Match | null>`, `getMatchParticipants(matchId: string): Promise<(MatchParticipant & { member: Member })[]>`, `getMatchEvents(matchId: string): Promise<MatchEvent[]>` — consumed by Tasks 11, 12, 14, 15, 16, 18.

- [ ] **Step 1: Write the failing test**

Create `lib/validations/match.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchSchema } from './match'

describe('matchSchema', () => {
  it('accepts a valid internal match', () => {
    const result = matchSchema.safeParse({
      match_type: 'internal',
      field_size: 7,
      scheduled_at: '2026-08-15T19:00',
      location: 'Sân ABC',
    })
    expect(result.success).toBe(true)
  })

  it('requires opponent_name for friendly matches', () => {
    const result = matchSchema.safeParse({
      match_type: 'friendly',
      field_size: 5,
      scheduled_at: '2026-08-15T19:00',
      location: 'Sân ABC',
    })
    expect(result.success).toBe(false)
  })

  it('rejects field sizes other than 5 or 7', () => {
    const result = matchSchema.safeParse({
      match_type: 'internal',
      field_size: 11,
      scheduled_at: '2026-08-15T19:00',
      location: 'Sân ABC',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/validations/match.test.ts`
Expected: FAIL — `Cannot find module './match'`.

- [ ] **Step 3: Write the schema**

Create `lib/validations/match.ts`:

```ts
import { z } from 'zod'

export const matchSchema = z
  .object({
    match_type: z.enum(['internal', 'friendly']),
    field_size: z.coerce.number().refine((v) => v === 5 || v === 7, 'Sân phải là 5 hoặc 7 người'),
    scheduled_at: z.string().min(1, 'Thời gian không được để trống'),
    location: z.string().trim().min(1, 'Địa điểm không được để trống'),
    opponent_name: z.string().trim().nullable().optional(),
  })
  .refine((data) => data.match_type !== 'friendly' || !!data.opponent_name, {
    message: 'Trận giao hữu cần tên đối thủ',
    path: ['opponent_name'],
  })

export type MatchInput = z.infer<typeof matchSchema>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/validations/match.test.ts`
Expected: 3 tests passed.

- [ ] **Step 5: Write the data access functions**

Create `lib/data/matches.ts`:

```ts
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Match, MatchParticipant, MatchEvent, Member } from '@/lib/types'

export async function getMatches(): Promise<Match[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('scheduled_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getMatch(id: string): Promise<Match | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('matches').select('*').eq('id', id).maybeSingle()

  if (error) throw error
  return data
}

export async function getMatchParticipants(
  matchId: string
): Promise<(MatchParticipant & { member: Member })[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('match_participants')
    .select('*, member:members(*)')
    .eq('match_id', matchId)

  if (error) throw error
  return data as (MatchParticipant & { member: Member })[]
}

export async function getMatchEvents(matchId: string): Promise<MatchEvent[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('match_events').select('*').eq('match_id', matchId)

  if (error) throw error
  return data
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests passed.

- [ ] **Step 7: Commit**

```bash
git add lib/validations/match.ts lib/validations/match.test.ts lib/data/matches.ts
git commit -m "feat: add match validation and data access"
```

---

### Task 11: Admin UI — create match and matches list

**Files:**
- Create: `app/admin/tran-dau/actions.ts`
- Create: `app/admin/tran-dau/page.tsx`
- Create: `app/admin/tran-dau/new/page.tsx`

**Interfaces:**
- Consumes: `matchSchema` (Task 10), `getMatches` (Task 10).
- Produces: `createMatch` Server Action in `app/admin/tran-dau/actions.ts` (this file will gain `setParticipants` in Task 12 and `recordResult` in Task 14 — keep `createMatch` exported alongside them, don't replace the file).

- [ ] **Step 1: Write the `createMatch` Server Action**

Create `app/admin/tran-dau/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { matchSchema } from '@/lib/validations/match'

export async function createMatch(formData: FormData) {
  const parsed = matchSchema.safeParse({
    match_type: formData.get('match_type'),
    field_size: formData.get('field_size'),
    scheduled_at: formData.get('scheduled_at'),
    location: formData.get('location'),
    opponent_name: formData.get('opponent_name') || null,
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('matches').insert(parsed.data).select('id').single()
  if (error) throw error

  revalidatePath('/admin/tran-dau')
  revalidatePath('/lich-thi-dau')
  redirect(`/admin/tran-dau/${data.id}`)
}
```

- [ ] **Step 2: Write the matches list page**

Create `app/admin/tran-dau/page.tsx`:

```tsx
import Link from 'next/link'
import { getMatches } from '@/lib/data/matches'

export default async function AdminMatchesPage() {
  const matches = await getMatches()

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Trận đấu</h1>
        <Link href="/admin/tran-dau/new" className="rounded bg-green-700 px-4 py-2 text-white">
          Tạo trận mới
        </Link>
      </div>
      <table className="mt-4 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Thời gian</th>
            <th className="py-2">Loại</th>
            <th className="py-2">Địa điểm</th>
            <th className="py-2">Trạng thái</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.id} className="border-b">
              <td className="py-2">{new Date(m.scheduled_at).toLocaleString('vi-VN')}</td>
              <td className="py-2">{m.match_type === 'internal' ? 'Nội bộ' : `Giao hữu vs ${m.opponent_name}`}</td>
              <td className="py-2">{m.location}</td>
              <td className="py-2">{m.status}</td>
              <td className="py-2">
                <Link href={`/admin/tran-dau/${m.id}`} className="text-blue-600">
                  Quản lý
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Write the create-match form page**

Create `app/admin/tran-dau/new/page.tsx`:

```tsx
import { createMatch } from '../actions'

export default function NewMatchPage() {
  return (
    <div>
      <h1 className="text-xl font-bold">Tạo trận đấu</h1>
      <form action={createMatch} className="mt-4 max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium">Loại trận</label>
          <select name="match_type" className="mt-1 w-full rounded border px-3 py-2">
            <option value="internal">Nội bộ (chia 2 đội)</option>
            <option value="friendly">Giao hữu</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Sân</label>
          <select name="field_size" className="mt-1 w-full rounded border px-3 py-2">
            <option value="5">Sân 5 người</option>
            <option value="7">Sân 7 người</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Thời gian</label>
          <input name="scheduled_at" type="datetime-local" required className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Địa điểm</label>
          <input name="location" required className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Đối thủ (nếu giao hữu)</label>
          <input name="opponent_name" className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <button type="submit" className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
          Tạo trận
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Verify manually**

Log in, go to `/admin/tran-dau/new`, create an internal match on a 5-person field for tomorrow → expect a redirect to `/admin/tran-dau/<id>` (a 404 page for now, since Task 12 creates that page) and the match to appear in `/admin/tran-dau`.

- [ ] **Step 5: Commit**

```bash
git add app/admin/tran-dau
git commit -m "feat: add admin create-match form and matches list"
```

---

### Task 12: Admin UI — match participants and team assignment

**Files:**
- Modify: `app/admin/tran-dau/actions.ts` (add `setParticipants`, keep `createMatch`)
- Create: `app/admin/tran-dau/[id]/page.tsx`

**Interfaces:**
- Consumes: `getMatch`, `getMatchParticipants` (Task 10), `getMembers` (Task 4), `createMatch` (Task 11, unchanged).
- Produces: `setParticipants(matchId: string, formData: FormData): Promise<void>` Server Action added to `app/admin/tran-dau/actions.ts`. Task 14 will further modify both this action file (adding `recordResult`) and this page (adding the result-entry section) — do not remove `setParticipants` when doing so.

- [ ] **Step 1: Add `setParticipants` to the actions file**

Modify `app/admin/tran-dau/actions.ts` — append at the end of the file (after `createMatch`):

```ts
export async function setParticipants(matchId: string, formData: FormData) {
  const memberIds = formData.getAll('member_id').map(String)
  const supabase = await createSupabaseServerClient()

  await supabase.from('match_participants').delete().eq('match_id', matchId)

  if (memberIds.length > 0) {
    const rows = memberIds.map((memberId) => ({
      match_id: matchId,
      member_id: memberId,
      team: String(formData.get(`team_${memberId}`) ?? 'A'),
      confirmation: 'confirmed' as const,
    }))
    const { error } = await supabase.from('match_participants').insert(rows)
    if (error) throw error
  }

  revalidatePath(`/admin/tran-dau/${matchId}`)
  revalidatePath(`/tran-dau/${matchId}`)
}
```

- [ ] **Step 2: Write the match management page (participants section)**

Create `app/admin/tran-dau/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getMatch, getMatchParticipants } from '@/lib/data/matches'
import { getMembers } from '@/lib/data/members'
import { setParticipants } from '../actions'

export default async function ManageMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const match = await getMatch(id)
  if (!match) notFound()

  const [members, participants] = await Promise.all([getMembers(), getMatchParticipants(id)])
  const participantIds = new Set(participants.map((p) => p.member_id))

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-bold">
          {match.match_type === 'internal' ? 'Trận nội bộ' : `Giao hữu vs ${match.opponent_name}`}
        </h1>
        <p className="text-gray-600">
          {new Date(match.scheduled_at).toLocaleString('vi-VN')} · {match.location} · Sân {match.field_size}
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
    </div>
  )
}
```

- [ ] **Step 3: Verify manually**

Go to `/admin/tran-dau/<id>` for the match created in Task 11 (an internal match). Check 4-6 members, assign some to Đội A and some to Đội B, save → reload the page → expect the checkboxes and team selects to reflect what was saved.

- [ ] **Step 4: Commit**

```bash
git add app/admin/tran-dau
git commit -m "feat: add match participant and team assignment UI"
```

---

### Task 13: Match event validation and scoring leaderboard calculation

**Files:**
- Create: `lib/validations/match-event.ts`
- Create: `lib/validations/match-event.test.ts`
- Create: `lib/stats/scoring-leaderboard.ts`
- Create: `lib/stats/scoring-leaderboard.test.ts`

**Interfaces:**
- Consumes: `MatchEvent`, `Member` types (Task 2).
- Produces: `matchEventSchema`, `MatchEventInput` type (consumed by Task 14); `computeScoringLeaderboard(events: MatchEvent[], members: Pick<Member, 'id' | 'full_name'>[]): LeaderboardEntry[]` where `LeaderboardEntry = { memberId: string, fullName: string, goals: number, assists: number }` (consumed by Tasks 17 and 18).

- [ ] **Step 1: Write the failing validation test**

Create `lib/validations/match-event.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchEventSchema } from './match-event'

describe('matchEventSchema', () => {
  const validBase = {
    match_id: '11111111-1111-1111-1111-111111111111',
    member_id: '22222222-2222-2222-2222-222222222222',
  }

  it('accepts a valid goal event', () => {
    const result = matchEventSchema.safeParse({ ...validBase, event_type: 'goal', minute: 45 })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid event_type', () => {
    const result = matchEventSchema.safeParse({ ...validBase, event_type: 'red_card' })
    expect(result.success).toBe(false)
  })

  it('rejects minute greater than 120', () => {
    const result = matchEventSchema.safeParse({ ...validBase, event_type: 'goal', minute: 200 })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/validations/match-event.test.ts`
Expected: FAIL — `Cannot find module './match-event'`.

- [ ] **Step 3: Write the schema**

Create `lib/validations/match-event.ts`:

```ts
import { z } from 'zod'

export const matchEventSchema = z.object({
  match_id: z.string().uuid(),
  member_id: z.string().uuid(),
  event_type: z.enum(['goal', 'assist']),
  minute: z.coerce.number().int().min(0).max(120).nullable().optional(),
})

export type MatchEventInput = z.infer<typeof matchEventSchema>
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/validations/match-event.test.ts`
Expected: 3 tests passed.

- [ ] **Step 5: Write the failing leaderboard test**

Create `lib/stats/scoring-leaderboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeScoringLeaderboard } from './scoring-leaderboard'
import type { MatchEvent } from '@/lib/types'

const members = [
  { id: 'm1', full_name: 'Nguyễn Văn A' },
  { id: 'm2', full_name: 'Trần Văn B' },
  { id: 'm3', full_name: 'Lê Văn C' },
]

function event(overrides: Partial<MatchEvent>): MatchEvent {
  return {
    id: '1',
    match_id: 'match1',
    member_id: 'm1',
    event_type: 'goal',
    minute: null,
    ...overrides,
  }
}

describe('computeScoringLeaderboard', () => {
  it('returns empty array when no events', () => {
    expect(computeScoringLeaderboard([], members)).toEqual([])
  })

  it('counts goals and assists per member', () => {
    const events = [
      event({ member_id: 'm1', event_type: 'goal' }),
      event({ member_id: 'm1', event_type: 'goal' }),
      event({ member_id: 'm2', event_type: 'assist' }),
    ]
    const result = computeScoringLeaderboard(events, members)
    expect(result).toEqual([
      { memberId: 'm1', fullName: 'Nguyễn Văn A', goals: 2, assists: 0 },
      { memberId: 'm2', fullName: 'Trần Văn B', goals: 0, assists: 1 },
    ])
  })

  it('sorts by goals then assists, descending, and excludes members with no events', () => {
    const events = [
      event({ member_id: 'm2', event_type: 'goal' }),
      event({ member_id: 'm1', event_type: 'goal' }),
      event({ member_id: 'm1', event_type: 'assist' }),
    ]
    const result = computeScoringLeaderboard(events, members)
    expect(result.map((r) => r.memberId)).toEqual(['m1', 'm2'])
    expect(result.find((r) => r.memberId === 'm3')).toBeUndefined()
  })

  it('ignores events referencing unknown members', () => {
    const events = [event({ member_id: 'unknown', event_type: 'goal' })]
    expect(computeScoringLeaderboard(events, members)).toEqual([])
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run lib/stats/scoring-leaderboard.test.ts`
Expected: FAIL — `Cannot find module './scoring-leaderboard'`.

- [ ] **Step 7: Write the calculation function**

Create `lib/stats/scoring-leaderboard.ts`:

```ts
import type { MatchEvent, Member } from '@/lib/types'

export interface LeaderboardEntry {
  memberId: string
  fullName: string
  goals: number
  assists: number
}

export function computeScoringLeaderboard(
  events: MatchEvent[],
  members: Pick<Member, 'id' | 'full_name'>[]
): LeaderboardEntry[] {
  const byMember = new Map<string, LeaderboardEntry>()

  for (const member of members) {
    byMember.set(member.id, { memberId: member.id, fullName: member.full_name, goals: 0, assists: 0 })
  }

  for (const event of events) {
    const entry = byMember.get(event.member_id)
    if (!entry) continue
    if (event.event_type === 'goal') entry.goals += 1
    else entry.assists += 1
  }

  return Array.from(byMember.values())
    .filter((entry) => entry.goals > 0 || entry.assists > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
}
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all tests passed.

- [ ] **Step 9: Commit**

```bash
git add lib/validations/match-event.ts lib/validations/match-event.test.ts lib/stats/scoring-leaderboard.ts lib/stats/scoring-leaderboard.test.ts
git commit -m "feat: add match event validation and scoring leaderboard calculation"
```

---

### Task 14: Admin UI — record match result

**Files:**
- Modify: `app/admin/tran-dau/actions.ts` (add `recordResult`, keep `createMatch` and `setParticipants`)
- Modify: `app/admin/tran-dau/[id]/page.tsx` (add the result-entry section after the participants section)

**Interfaces:**
- Consumes: `matchEventSchema` (Task 13), `getMatchEvents` (Task 10).
- Produces: `recordResult(matchId: string, formData: FormData): Promise<void>` Server Action.

- [ ] **Step 1: Add `recordResult` to the actions file**

Modify `app/admin/tran-dau/actions.ts` — add this import at the top (alongside the existing `matchSchema` import):

```ts
import { matchEventSchema } from '@/lib/validations/match-event'
```

Then append this function at the end of the file:

```ts
export async function recordResult(matchId: string, formData: FormData) {
  const teamAScore = Number(formData.get('team_a_score'))
  const teamBScore = Number(formData.get('team_b_score'))

  const supabase = await createSupabaseServerClient()
  const { error: matchError } = await supabase
    .from('matches')
    .update({ team_a_score: teamAScore, team_b_score: teamBScore, status: 'completed' })
    .eq('id', matchId)
  if (matchError) throw matchError

  const memberIds = formData.getAll('event_member_id').map(String)
  const eventTypes = formData.getAll('event_type').map(String)

  await supabase.from('match_events').delete().eq('match_id', matchId)

  const events = memberIds
    .map((memberId, i) => ({ memberId, eventType: eventTypes[i] }))
    .filter((e) => e.memberId && e.eventType)
    .map((e) =>
      matchEventSchema.parse({
        match_id: matchId,
        member_id: e.memberId,
        event_type: e.eventType,
      })
    )

  if (events.length > 0) {
    const { error } = await supabase.from('match_events').insert(events)
    if (error) throw error
  }

  revalidatePath(`/admin/tran-dau/${matchId}`)
  revalidatePath(`/tran-dau/${matchId}`)
  revalidatePath('/thong-ke')
}
```

- [ ] **Step 2: Add the result section to the match management page**

Modify `app/admin/tran-dau/[id]/page.tsx` — replace the whole file with this updated version (adds the `getMatchEvents` import/call and the new "Kết quả trận" section after "Người tham gia"):

```tsx
import { notFound } from 'next/navigation'
import { getMatch, getMatchParticipants, getMatchEvents } from '@/lib/data/matches'
import { getMembers } from '@/lib/data/members'
import { setParticipants, recordResult } from '../actions'

export default async function ManageMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const match = await getMatch(id)
  if (!match) notFound()

  const [members, participants, events] = await Promise.all([
    getMembers(),
    getMatchParticipants(id),
    getMatchEvents(id),
  ])
  const participantIds = new Set(participants.map((p) => p.member_id))

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-bold">
          {match.match_type === 'internal' ? 'Trận nội bộ' : `Giao hữu vs ${match.opponent_name}`}
        </h1>
        <p className="text-gray-600">
          {new Date(match.scheduled_at).toLocaleString('vi-VN')} · {match.location} · Sân {match.field_size}
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

- [ ] **Step 3: Verify manually**

On the match page from Task 12, fill in a score (e.g. 5-3) and set 2-3 goal/assist rows to participants → Save → expect the match status to become "completed" and reloading the page to show the saved score and events pre-filled in the rows.

- [ ] **Step 4: Commit**

```bash
git add app/admin/tran-dau
git commit -m "feat: add match result and goal/assist entry UI"
```

---

### Task 15: Public schedule page

**Files:**
- Create: `app/lich-thi-dau/page.tsx`

**Interfaces:**
- Consumes: `getMatches` (Task 10).

- [ ] **Step 1: Write the page**

Create `app/lich-thi-dau/page.tsx`:

```tsx
import Link from 'next/link'
import { getMatches } from '@/lib/data/matches'

export default async function UpcomingMatchesPage() {
  const matches = await getMatches()
  const upcoming = matches.filter((m) => m.status === 'upcoming')
  const past = matches.filter((m) => m.status !== 'upcoming')

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Lịch thi đấu</h1>

      <h2 className="mt-6 text-lg font-semibold">Sắp tới</h2>
      <ul className="mt-2 space-y-2">
        {upcoming.map((m) => (
          <li key={m.id} className="rounded border p-3">
            <Link href={`/tran-dau/${m.id}`} className="font-medium text-blue-700">
              {new Date(m.scheduled_at).toLocaleString('vi-VN')} · {m.location}
            </Link>
            <p className="text-sm text-gray-600">
              {m.match_type === 'internal' ? 'Nội bộ' : `Giao hữu vs ${m.opponent_name}`} · Sân {m.field_size}
            </p>
          </li>
        ))}
        {upcoming.length === 0 && <p className="text-gray-500">Chưa có trận nào sắp tới.</p>}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Đã diễn ra</h2>
      <ul className="mt-2 space-y-2">
        {past.map((m) => (
          <li key={m.id} className="rounded border p-3">
            <Link href={`/tran-dau/${m.id}`} className="font-medium text-blue-700">
              {new Date(m.scheduled_at).toLocaleString('vi-VN')} · {m.location}
            </Link>
            <p className="text-sm text-gray-600">
              {m.team_a_score ?? '-'} : {m.team_b_score ?? '-'}
            </p>
          </li>
        ))}
        {past.length === 0 && <p className="text-gray-500">Chưa có trận nào đã diễn ra.</p>}
      </ul>
    </main>
  )
}
```

- [ ] **Step 2: Verify manually**

Logged out, visit `/lich-thi-dau` → expect the internal match created and completed in Tasks 11-14 to appear under "Đã diễn ra" with its score.

- [ ] **Step 3: Commit**

```bash
git add app/lich-thi-dau
git commit -m "feat: add public schedule page"
```

---

### Task 16: Public match detail page

**Files:**
- Create: `app/tran-dau/[id]/page.tsx`

**Interfaces:**
- Consumes: `getMatch`, `getMatchParticipants`, `getMatchEvents` (Task 10).

- [ ] **Step 1: Write the page**

Create `app/tran-dau/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getMatch, getMatchParticipants, getMatchEvents } from '@/lib/data/matches'

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const match = await getMatch(id)
  if (!match) notFound()

  const [participants, events] = await Promise.all([getMatchParticipants(id), getMatchEvents(id)])

  const teamA = participants.filter((p) => p.team === 'A')
  const teamB = participants.filter((p) => p.team === 'B')

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
        {new Date(match.scheduled_at).toLocaleString('vi-VN')} · {match.location} · Sân {match.field_size}
      </p>

      {match.status === 'completed' && (
        <p className="mt-2 text-xl font-bold">
          {match.team_a_score} : {match.team_b_score}
        </p>
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

- [ ] **Step 2: Verify manually**

Logged out, visit `/tran-dau/<id>` for the match from Task 14 → expect both teams, the score, and ⚽/🎯 markers next to the players who scored/assisted.

- [ ] **Step 3: Commit**

```bash
git add app/tran-dau
git commit -m "feat: add public match detail page"
```

---

### Task 17: Public stats page

**Files:**
- Create: `app/thong-ke/page.tsx`

**Interfaces:**
- Consumes: `getMembers` (Task 4), `computeScoringLeaderboard` (Task 13), `createSupabaseServerClient` (Task 2).

- [ ] **Step 1: Write the page**

Create `app/thong-ke/page.tsx`:

```tsx
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getMembers } from '@/lib/data/members'
import { computeScoringLeaderboard } from '@/lib/stats/scoring-leaderboard'
import type { MatchEvent } from '@/lib/types'

async function getAllEvents(): Promise<MatchEvent[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('match_events').select('*')
  if (error) throw error
  return data
}

export default async function StatsPage() {
  const [members, events] = await Promise.all([getMembers(), getAllEvents()])
  const leaderboard = computeScoringLeaderboard(events, members)

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Thống kê ghi bàn</h1>
      <table className="mt-6 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Cầu thủ</th>
            <th className="py-2">Bàn thắng</th>
            <th className="py-2">Kiến tạo</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry) => (
            <tr key={entry.memberId} className="border-b">
              <td className="py-2">{entry.fullName}</td>
              <td className="py-2">{entry.goals}</td>
              <td className="py-2">{entry.assists}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {leaderboard.length === 0 && <p className="mt-4 text-gray-500">Chưa có dữ liệu ghi bàn.</p>}
    </main>
  )
}
```

- [ ] **Step 2: Verify manually**

Logged out, visit `/thong-ke` → expect the players who scored/assisted in Task 14 to show up, sorted by goals then assists.

- [ ] **Step 3: Commit**

```bash
git add app/thong-ke
git commit -m "feat: add public scoring leaderboard page"
```

---

### Task 18: Home page and shared navigation

**Files:**
- Modify: `app/page.tsx` (replace the `create-next-app` starter content)
- Modify: `app/layout.tsx` (replace the `create-next-app` starter content, add nav)

**Interfaces:**
- Consumes: `getMatches` (Task 10), `getFundTransactions`/`computeFundSummary` (Task 7), `getMembers` (Task 4), `computeScoringLeaderboard` (Task 13), `createSupabaseServerClient` (Task 2).

- [ ] **Step 1: Replace the root layout**

Modify `app/layout.tsx` — replace the entire file with:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Đội bóng phủi',
  description: 'Quản lý thành viên, quỹ và trận đấu của đội bóng phủi',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <nav className="flex gap-4 border-b bg-white px-6 py-4 text-sm font-medium">
          <Link href="/">Trang chủ</Link>
          <Link href="/lich-thi-dau">Lịch thi đấu</Link>
          <Link href="/thanh-vien">Thành viên</Link>
          <Link href="/thong-ke">Thống kê</Link>
          <Link href="/quy">Quỹ</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Replace the home page**

Modify `app/page.tsx` — replace the entire file with:

```tsx
import Link from 'next/link'
import { getMatches } from '@/lib/data/matches'
import { getFundTransactions } from '@/lib/data/fund-transactions'
import { computeFundSummary } from '@/lib/stats/fund-balance'
import { getMembers } from '@/lib/data/members'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { computeScoringLeaderboard } from '@/lib/stats/scoring-leaderboard'
import type { MatchEvent } from '@/lib/types'

export default async function HomePage() {
  const [matches, transactions, members] = await Promise.all([
    getMatches(),
    getFundTransactions(),
    getMembers(),
  ])

  const supabase = await createSupabaseServerClient()
  const { data: events } = await supabase.from('match_events').select('*')

  const nextMatch = matches
    .filter((m) => m.status === 'upcoming')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0]

  const summary = computeFundSummary(transactions)
  const leaderboard = computeScoringLeaderboard((events ?? []) as MatchEvent[], members).slice(0, 3)

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Đội bóng phủi</h1>

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Trận sắp tới</h2>
        {nextMatch ? (
          <Link href={`/tran-dau/${nextMatch.id}`} className="text-blue-700">
            {new Date(nextMatch.scheduled_at).toLocaleString('vi-VN')} · {nextMatch.location}
          </Link>
        ) : (
          <p className="text-gray-500">Chưa có trận nào sắp tới.</p>
        )}
        <Link href="/lich-thi-dau" className="mt-2 block text-sm text-gray-500 underline">
          Xem toàn bộ lịch thi đấu
        </Link>
      </section>

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Quỹ đội</h2>
        <p className="text-xl font-bold">{summary.balance.toLocaleString('vi-VN')} đ</p>
        <Link href="/quy" className="mt-2 block text-sm text-gray-500 underline">
          Xem chi tiết thu chi
        </Link>
      </section>

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Top ghi bàn</h2>
        <ul className="mt-2 space-y-1">
          {leaderboard.map((entry) => (
            <li key={entry.memberId}>
              {entry.fullName} — {entry.goals} bàn
            </li>
          ))}
        </ul>
        <Link href="/thong-ke" className="mt-2 block text-sm text-gray-500 underline">
          Xem toàn bộ thống kê
        </Link>
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Verify manually**

Run `npm run build` (catches any type errors across the whole app now that every page exists), then `npm run dev` and click through the nav bar on all 5 public links plus `/admin` while logged in and logged out, confirming each page renders and the guard still works.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "feat: add home page and shared site navigation"
```

---

### Task 19: Deploy to Vercel

**Files:** none (infra/config only)

**Interfaces:** none.

- [ ] **Step 1: Push the repository to GitHub (manual, external)**

If not already done, create a GitHub repo and push:

```bash
git remote add origin <your-repo-url>
git push -u origin master
```

- [ ] **Step 2: Import the project in Vercel (manual, external)**

Go to https://vercel.com/new, import the GitHub repo. Leave build settings at their Next.js defaults.

- [ ] **Step 3: Set environment variables (manual, external)**

In the Vercel project's Settings → Environment Variables, add for the Production environment:
- `NEXT_PUBLIC_SUPABASE_URL` — same value as in `.env.local`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same value as in `.env.local`

- [ ] **Step 4: Deploy and verify**

Trigger a deploy (Vercel deploys automatically on the push from Step 1, or click "Deploy"). Once live, visit the production URL:
1. `/` and `/lich-thi-dau` and `/thanh-vien` and `/thong-ke` and `/quy` load without logging in.
2. `/admin` redirects to `/login`; logging in with the admin account from Task 3 works and lands on `/admin`.

No commit needed for this task — it's deployment configuration only.
