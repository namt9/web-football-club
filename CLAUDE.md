# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Tổng quan dự án

Website quản lý một đội bóng phủi (sân 5 hoặc 7 người): quản lý thành viên, quỹ/thu chi, trận đấu (sắp tới/đã diễn ra), và thống kê ghi bàn. Một đội duy nhất — không phải sản phẩm multi-tenant. Chỉ 1-3 admin đăng nhập để nhập liệu; mọi trang khác là public, read-only, không cần đăng nhập.

- Spec đầy đủ: `docs/superpowers/specs/2026-08-10-quan-ly-doi-bong-phui-design.md`
- Kế hoạch triển khai MVP: `docs/superpowers/plans/2026-08-10-mvp-quan-ly-doi-bong-phui.md`

## Tech stack

- **Next.js 14+ (App Router, TypeScript)** — một app duy nhất cho cả public pages và admin.
- **Supabase** — Postgres (dữ liệu), Auth (email/password cho admin), RLS (public đọc, chỉ authenticated mới viết).
- **Zod** — validate dữ liệu form ở cả client và Server Action.
- **Vitest** — unit test cho logic tính toán thuần (không test UI/CRUD).
- **Tailwind CSS** — styling, dùng cấu hình mặc định của `create-next-app`.
- **Vercel** — hosting (free tier), cùng Supabase Cloud (free tier).

## Lệnh thường dùng

```bash
npm run dev      # chạy dev server tại localhost:3000
npm run build    # build production, cũng dùng để kiểm tra type-check toàn app
npm test         # chạy toàn bộ unit test (Vitest)
npx vitest run <path>   # chạy một file test cụ thể
```

## Kiến trúc & quy ước code

- **Đọc dữ liệu (public pages + admin pages):** luôn là React Server Component, gọi trực tiếp hàm trong `lib/data/*.ts` (không qua REST API — không cần vì không có client ngoài nào gọi vào).
- **Viết dữ liệu (mọi mutation ở admin):** dùng Next.js Server Actions (`'use server'`), đặt trong `actions.ts` cạnh page dùng nó. Không có route `/api/*` riêng cho CRUD nội bộ.
- **Validate input:** mọi Server Action validate bằng schema Zod tương ứng trong `lib/validations/*.ts` trước khi insert/update vào Supabase.
- **Tính toán tổng hợp (số dư quỹ, xếp hạng ghi bàn):** luôn là hàm thuần trong `lib/stats/*.ts`, tính từ dữ liệu gốc tại thời điểm truy vấn — không lưu số liệu tổng trong DB. Đây là phần duy nhất có unit test đầy đủ theo chiến lược test của spec.
- **Auth:** `middleware.ts` ở root chặn mọi route `/admin/*` khi chưa đăng nhập, redirect về `/login`. Không có luồng đăng ký — admin được tạo tay qua Supabase Dashboard (Authentication → Users).
- **Bảo mật ở tầng DB:** mọi bảng có RLS — policy "public read" (`using (true)`) cho SELECT, policy "admin write" (`auth.role() = 'authenticated'`) cho INSERT/UPDATE/DELETE. Middleware chặn ở tầng route, RLS chặn ở tầng DB — hai lớp độc lập.
- **Không lưu thông tin công nợ cá nhân công khai:** trang `/quy` (public) chỉ hiện tổng thu/chi + lịch sử giao dịch, không hiện "ai đang nợ ai" — dữ liệu đó thuộc Phase 2 (`member_dues`, admin-only).

## Cấu trúc thư mục

```
app/
  <public pages>/page.tsx       # Server Component, đọc qua lib/data
  admin/<feature>/page.tsx      # Server Component, cần đăng nhập (qua middleware)
  admin/<feature>/actions.ts    # Server Actions cho feature đó
  login/                        # trang đăng nhập + signIn/signOut actions
lib/
  supabase/server.ts            # Supabase client cho Server Component/Action (cookie-based)
  supabase/browser.ts           # Supabase client cho Client Component (không dùng ở MVP)
  validations/*.ts              # Zod schema, một file một entity
  stats/*.ts                    # hàm tính toán thuần + test (fund balance, scoring leaderboard)
  data/*.ts                     # hàm đọc dữ liệu từ Supabase, một file một entity
  types.ts                      # type TypeScript khớp với schema DB
supabase/migrations/*.sql       # schema + RLS, chạy tay qua Supabase SQL Editor
middleware.ts                   # bảo vệ /admin/*
```

## Phạm vi MVP (Giai đoạn 1)

Đã có trong MVP: auth admin, CRUD thành viên, quản lý trận đấu (tạo/chọn người tham gia/chia đội A-B/nhập tỷ số + ghi bàn/kiến tạo), quỹ (thu chi + số dư), toàn bộ trang public.

**Chưa làm (Giai đoạn 2, không implement trừ khi có yêu cầu mới):** sơ đồ vị trí/chiến thuật kéo-thả trên sân, theo dõi công nợ chi tiết theo tháng/từng thành viên (bảng `member_dues`).

## Ghi chú khi thêm tính năng mới

- Tuân theo pattern hiện có: Server Component để đọc, Server Action để viết, Zod để validate, hàm thuần + test cho mọi tính toán tổng hợp.
- Không thêm route `/api/*` trừ khi có client bên ngoài thực sự cần gọi vào.
- Copy UI dùng tiếng Việt, giữ nhất quán với các trang hiện có (`Thu`/`Chi`, `Nội bộ`/`Giao hữu`, `Sắp tới`/`Đã diễn ra`).
