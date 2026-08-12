import { describe, it, expect } from 'vitest'
import { PUBLIC_COLUMNS } from './fund-transactions'

describe('PUBLIC_COLUMNS', () => {
  it('khớp chính xác danh sách cột trong grant select của supabase/migrations/0004_restrict_fund_columns.sql', () => {
    // Hai danh sách này PHẢI giống nhau tuyệt đối. Nếu test này fail, đừng chỉ
    // sửa giá trị mong đợi ở đây — phải cập nhật ĐỒNG THỜI cả PUBLIC_COLUMNS
    // trong lib/data/fund-transactions.ts và `grant select (...)` trong
    // supabase/migrations/0004_restrict_fund_columns.sql, nếu không role
    // `anon` sẽ bị 42501 và mọi trang public sẽ trả về lỗi 500 trên production.
    expect(PUBLIC_COLUMNS).toBe(
      'id, transaction_type, category, amount, occurred_on, description, match_id, created_at'
    )
  })
})
