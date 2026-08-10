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
