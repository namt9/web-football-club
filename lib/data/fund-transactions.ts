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
