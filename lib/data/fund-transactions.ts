import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { FundTransaction, PublicFundTransaction } from '@/lib/types'

/**
 * Các cột role `anon` được phép đọc. Phải liệt kê tường minh — `select('*')`
 * sẽ lỗi 42501 vì bung ra cả `member_id`/`member_due_id` đã bị thu hồi quyền.
 * Danh sách này PHẢI khớp với `grant select (...)` trong supabase/migrations/0004_restrict_fund_columns.sql.
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
