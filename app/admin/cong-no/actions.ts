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

    if (error) {
      // 23505 = unique_violation trên `unique (member_id, period)`. Lọc
      // `alreadyHasDue` ở trên đã chặn trường hợp thường, nên lỗi này chỉ còn
      // xảy ra khi hai submit gần như đồng thời cùng đọc được một ảnh chụp
      // "chưa có ai" rồi cùng insert. Đổi thành câu tiếng Việt thay vì để lỗi
      // Postgres thô nổi lên tận UI.
      if (error.code === '23505') {
        throw new Error('Kỳ này vừa được tạo bởi một thao tác khác. Hãy tải lại trang để xem danh sách mới nhất.')
      }
      throw error
    }
  }

  revalidatePath('/admin/cong-no')
}
