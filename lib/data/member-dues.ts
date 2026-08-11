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
