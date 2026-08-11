'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createPeriodSchema } from '@/lib/validations/member-due'
import { getMembers } from '@/lib/data/members'
import { getDuesForPeriod } from '@/lib/data/member-dues'

export async function createPeriod(formData: FormData) {
  const parsed = createPeriodSchema.safeParse({
    period: formData.get('period'),
    amount_due: formData.get('amount_due'),
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const { period, amount_due } = parsed.data
  const [members, existing] = await Promise.all([getMembers(), getDuesForPeriod(period)])
  const alreadyHasDue = new Set(existing.map((d) => d.member_id))

  // Chỉ thêm người còn thiếu, không sửa số tiền của người đã có. Nhờ vậy chạy
  // lại trên kỳ cũ sẽ bổ sung thành viên mới vào đội mà không phá dữ liệu.
  const rows = members
    .filter((m) => m.status === 'active' && !alreadyHasDue.has(m.id))
    .map((m) => ({ member_id: m.id, period, amount_due }))

  if (rows.length > 0) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.from('member_dues').insert(rows)
    if (error) throw error
  }

  revalidatePath('/admin/cong-no')
}
