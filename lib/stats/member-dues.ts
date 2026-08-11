import type { FundTransaction, Member, MemberDue } from '@/lib/types'

export type DuesStatus = 'unpaid' | 'partial' | 'paid'

export interface DuesRow {
  memberId: string
  fullName: string
  amountDue: number
  amountPaid: number
  status: DuesStatus
}

/** Chỉ cần 2 field này của giao dịch, nên nhận kiểu hẹp cho dễ test. */
type Payment = Pick<FundTransaction, 'member_due_id' | 'amount'>

function sumPaidByDueId(payments: Payment[]): Map<string, number> {
  const paid = new Map<string, number>()

  for (const p of payments) {
    if (!p.member_due_id) continue
    paid.set(p.member_due_id, (paid.get(p.member_due_id) ?? 0) + p.amount)
  }

  return paid
}

function duesStatus(amountDue: number, amountPaid: number): DuesStatus {
  if (amountPaid >= amountDue) return 'paid'
  if (amountPaid > 0) return 'partial'
  return 'unpaid'
}

/**
 * `dues` là nghĩa vụ của MỘT kỳ (caller lọc trước). `payments` truyền vào rộng
 * bao nhiêu cũng được: ghép chỉ qua `member_due_id`, nên giao dịch của kỳ khác
 * hoặc không gắn nghĩa vụ nào đều tự bị bỏ qua.
 */
export function computeDuesForPeriod(
  dues: MemberDue[],
  payments: Payment[],
  members: Pick<Member, 'id' | 'full_name'>[]
): DuesRow[] {
  const nameById = new Map(members.map((m) => [m.id, m.full_name]))
  const paidByDueId = sumPaidByDueId(payments)

  return dues
    .filter((d) => nameById.has(d.member_id))
    .map((d) => {
      const amountPaid = paidByDueId.get(d.id) ?? 0
      return {
        memberId: d.member_id,
        fullName: nameById.get(d.member_id)!,
        amountDue: d.amount_due,
        amountPaid,
        status: duesStatus(d.amount_due, amountPaid),
      }
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'))
}

/** `dues` là nghĩa vụ của MỌI kỳ. Trả về `sum(phải đóng) - sum(đã đóng)`. */
export function computeOutstandingByMember(
  dues: MemberDue[],
  payments: Payment[]
): Map<string, number> {
  const memberByDueId = new Map(dues.map((d) => [d.id, d.member_id]))
  const outstanding = new Map<string, number>()

  for (const d of dues) {
    outstanding.set(d.member_id, (outstanding.get(d.member_id) ?? 0) + d.amount_due)
  }

  for (const p of payments) {
    if (!p.member_due_id) continue
    const memberId = memberByDueId.get(p.member_due_id)
    if (!memberId) continue
    outstanding.set(memberId, (outstanding.get(memberId) ?? 0) - p.amount)
  }

  return outstanding
}
