import { z } from 'zod'

export const memberSchema = z.object({
  full_name: z.string().trim().min(1, 'Họ tên không được để trống'),
  jersey_number: z.coerce.number().int().min(0).max(99).nullable().optional(),
  position: z.enum(['GK', 'DF', 'MF', 'FW']).nullable().optional(),
  phone: z.string().trim().min(8).max(15).nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active'),
})

export type MemberInput = z.infer<typeof memberSchema>
