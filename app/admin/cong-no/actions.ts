'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createPeriodSchema, paymentSchema } from '@/lib/validations/member-due'
import { getMembers } from '@/lib/data/members'
import { getDuesForPeriod, getDuePayments } from '@/lib/data/member-dues'

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

export async function recordPayments(period: string, formData: FormData) {
  const dueIds = formData.getAll('paid_due_id').map(String)
  if (dueIds.length === 0) return

  const [members, dues, payments] = await Promise.all([
    getMembers(),
    getDuesForPeriod(period),
    getDuePayments(),
  ])

  const memberByDueId = new Map(dues.map((d) => [d.id, d.member_id]))
  const nameById = new Map(members.map((m) => [m.id, m.full_name]))
  const alreadyPaid = new Set(
    payments.map((p) => p.member_due_id).filter((id): id is string => id !== null)
  )
  const occurredOn = String(formData.get('occurred_on') ?? '')

  // Bỏ qua nghĩa vụ đã có giao dịch → submit lại nhiều lần không thu 2 lần.
  const pending = dueIds.filter((dueId) => !alreadyPaid.has(dueId))
  if (pending.length === 0) return

  // Mọi nghĩa vụ được tick phải thuộc đúng kỳ đang mở. `memberByDueId` chỉ chứa
  // nghĩa vụ của kỳ này, nên thiếu key nghĩa là dòng đó không thuộc kỳ. Dừng
  // hẳn thay vì ghi: ghi vào sẽ tạo giao dịch không có `member_id`, tức dữ liệu
  // sai âm thầm ở một cột thật. Không xảy ra qua UI, chỉ qua request tự tạo.
  const foreign = pending.filter((dueId) => !memberByDueId.has(dueId))
  if (foreign.length > 0) {
    throw new Error('Có dòng không thuộc kỳ đang xem. Hãy tải lại trang rồi thử lại.')
  }

  // Validate toàn bộ TRƯỚC khi ghi bất cứ gì. Một dòng sai thì không lưu dòng
  // nào — nhưng phải nói rõ dòng nào sai, kèm tên người, thay vì để ZodError
  // thô nổi lên và làm mất cả lô mà admin không biết vì sao.
  const invalid: string[] = []
  const rows = []

  for (const dueId of pending) {
    const parsed = paymentSchema.safeParse({
      member_due_id: dueId,
      amount: formData.get(`amount_${dueId}`),
      occurred_on: occurredOn,
    })

    const memberId = memberByDueId.get(dueId)!

    if (!parsed.success) {
      const name = nameById.get(memberId) ?? 'Không rõ'
      invalid.push(`${name}: ${parsed.error.issues.map((i) => i.message).join(', ')}`)
      continue
    }

    rows.push({
      transaction_type: 'income' as const,
      category: 'Quỹ tháng',
      amount: parsed.data.amount,
      occurred_on: parsed.data.occurred_on,
      member_due_id: parsed.data.member_due_id,
      member_id: memberId,
    })
  }

  if (invalid.length > 0) {
    throw new Error(invalid.join('; '))
  }

  if (rows.length === 0) return

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('fund_transactions').insert(rows)
  if (error) throw error

  revalidatePath('/admin/cong-no')
  revalidatePath('/admin/quy')
  revalidatePath('/quy')
  revalidatePath('/')
}

export async function undoPayment(dueId: string) {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('fund_transactions').delete().eq('member_due_id', dueId)
  if (error) throw error

  revalidatePath('/admin/cong-no')
  revalidatePath('/admin/quy')
  revalidatePath('/quy')
  revalidatePath('/')
}
