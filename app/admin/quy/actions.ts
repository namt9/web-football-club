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
