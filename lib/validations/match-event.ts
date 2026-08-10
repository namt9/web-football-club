import { z } from 'zod'

export const matchEventSchema = z.object({
  match_id: z.string().uuid(),
  member_id: z.string().uuid(),
  event_type: z.enum(['goal', 'assist']),
  minute: z.coerce.number().int().min(0).max(120).nullable().optional(),
})

export type MatchEventInput = z.infer<typeof matchEventSchema>
