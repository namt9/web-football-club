import { z } from 'zod'
import { vietnamLocalToIso } from '@/lib/datetime'

export const matchSchema = z
  .object({
    match_type: z.enum(['internal', 'friendly']),
    field_size: z.coerce.number().refine((v) => v === 5 || v === 7, 'Sân phải là 5 hoặc 7 người'),
    scheduled_at: z
      .string()
      .min(1, 'Thời gian không được để trống')
      .transform((value, ctx) => {
        try {
          return vietnamLocalToIso(value)
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Thời gian không hợp lệ' })
          return z.NEVER
        }
      }),
    location: z.string().trim().min(1, 'Địa điểm không được để trống'),
    opponent_name: z.string().trim().nullable().optional(),
  })
  .refine((data) => data.match_type !== 'friendly' || !!data.opponent_name, {
    message: 'Trận giao hữu cần tên đối thủ',
    path: ['opponent_name'],
  })

export type MatchInput = z.infer<typeof matchSchema>
