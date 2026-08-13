import { z } from 'zod'
import { FORMATIONS, type FieldSize } from '@/lib/formations'

const assignmentSchema = z.object({
  slot: z.string().min(1, 'Vị trí không được để trống'),
  member_id: z.string().uuid('Mã thành viên không hợp lệ').nullable(),
})

/**
 * Tạo theo `fieldSize` vì danh sách sơ đồ hợp lệ khác nhau giữa sân 5 và 7
 * người — không viết được một schema tĩnh dùng chung cho cả hai.
 */
export function buildLineupSchema(fieldSize: FieldSize) {
  return z
    .object({
      formation: z.string().min(1, 'Vui lòng chọn sơ đồ'),
      assignments: z.array(assignmentSchema),
    })
    .superRefine((data, ctx) => {
      const slots = FORMATIONS[fieldSize][data.formation]
      if (!slots) {
        ctx.addIssue({ code: 'custom', path: ['formation'], message: 'Sơ đồ không hợp lệ cho sân này' })
        return
      }

      const validSlotKeys = new Set(slots.map((s) => s.key))
      const seenMembers = new Set<string>()

      for (const a of data.assignments) {
        if (!validSlotKeys.has(a.slot)) {
          ctx.addIssue({ code: 'custom', path: ['assignments'], message: `Vị trí không hợp lệ: ${a.slot}` })
        }
        if (a.member_id) {
          if (seenMembers.has(a.member_id)) {
            ctx.addIssue({ code: 'custom', path: ['assignments'], message: 'Một cầu thủ không thể giữ hai vị trí' })
          }
          seenMembers.add(a.member_id)
        }
      }
    })
}

export type LineupInput = z.infer<ReturnType<typeof buildLineupSchema>>
