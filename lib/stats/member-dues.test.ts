import { describe, it, expect } from 'vitest'
import { computeDuesForPeriod, computeOutstandingByMember } from './member-dues'
import type { MemberDue } from '@/lib/types'

const members = [
  { id: 'm1', full_name: 'An' },
  { id: 'm2', full_name: 'Bình' },
  { id: 'm3', full_name: 'Cường' },
]

function due(id: string, memberId: string, period: string, amount: number): MemberDue {
  return {
    id,
    member_id: memberId,
    period,
    amount_due: amount,
    note: null,
    created_at: '2026-09-01T00:00:00Z',
  }
}

function payment(memberDueId: string | null, amount: number) {
  return { member_due_id: memberDueId, amount }
}

describe('computeDuesForPeriod', () => {
  it('trả về danh sách rỗng khi chưa có kỳ nào', () => {
    expect(computeDuesForPeriod([], [], members)).toEqual([])
  })

  it('đánh dấu chưa đóng khi không có giao dịch nào', () => {
    const rows = computeDuesForPeriod([due('d1', 'm1', '2026-09-01', 200000)], [], members)
    expect(rows).toEqual([
      { memberId: 'm1', fullName: 'An', amountDue: 200000, amountPaid: 0, status: 'unpaid' },
    ])
  })

  it('cộng dồn nhiều giao dịch trong cùng một kỳ', () => {
    const rows = computeDuesForPeriod(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment('d1', 120000), payment('d1', 80000)],
      members
    )
    expect(rows[0].amountPaid).toBe(200000)
    expect(rows[0].status).toBe('paid')
  })

  it('đánh dấu đóng thiếu khi trả một phần', () => {
    const rows = computeDuesForPeriod(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment('d1', 50000)],
      members
    )
    expect(rows[0].status).toBe('partial')
  })

  it('coi đóng dư là đã đóng đủ', () => {
    const rows = computeDuesForPeriod(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment('d1', 250000)],
      members
    )
    expect(rows[0].status).toBe('paid')
  })

  it('coi nghĩa vụ 0 đồng là đã đóng đủ', () => {
    const rows = computeDuesForPeriod([due('d1', 'm1', '2026-09-01', 0)], [], members)
    expect(rows[0].status).toBe('paid')
  })

  it('bỏ qua giao dịch trỏ tới nghĩa vụ của kỳ khác', () => {
    const rows = computeDuesForPeriod(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment('d-thang-8', 200000)],
      members
    )
    expect(rows[0].amountPaid).toBe(0)
    expect(rows[0].status).toBe('unpaid')
  })

  it('bỏ qua giao dịch không gắn nghĩa vụ nào', () => {
    const rows = computeDuesForPeriod(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment(null, 300000)],
      members
    )
    expect(rows[0].amountPaid).toBe(0)
  })

  it('không liệt kê thành viên không có nghĩa vụ trong kỳ', () => {
    const rows = computeDuesForPeriod([due('d1', 'm2', '2026-09-01', 200000)], [], members)
    expect(rows.map((r) => r.memberId)).toEqual(['m2'])
  })

  it('sắp xếp theo tên', () => {
    const rows = computeDuesForPeriod(
      [
        due('d3', 'm3', '2026-09-01', 200000),
        due('d1', 'm1', '2026-09-01', 200000),
        due('d2', 'm2', '2026-09-01', 200000),
      ],
      [],
      members
    )
    expect(rows.map((r) => r.fullName)).toEqual(['An', 'Bình', 'Cường'])
  })
})

describe('computeOutstandingByMember', () => {
  it('trả về map rỗng khi chưa có nghĩa vụ', () => {
    expect(computeOutstandingByMember([], [])).toEqual(new Map())
  })

  it('cộng nợ qua nhiều kỳ', () => {
    const dues = [
      due('d1', 'm1', '2026-08-01', 200000),
      due('d2', 'm1', '2026-09-01', 200000),
    ]
    const outstanding = computeOutstandingByMember(dues, [payment('d1', 200000)])
    expect(outstanding.get('m1')).toBe(200000)
  })

  it('cho tổng nợ xuống dưới 0 khi đóng dư ở kỳ duy nhất', () => {
    const outstanding = computeOutstandingByMember(
      [due('d1', 'm1', '2026-09-01', 200000)],
      [payment('d1', 250000)]
    )
    expect(outstanding.get('m1')).toBe(-50000)
  })

  it('cho phép đóng dư kỳ này bù cho kỳ khác', () => {
    const dues = [
      due('d1', 'm1', '2026-08-01', 200000),
      due('d2', 'm1', '2026-09-01', 200000),
    ]
    const outstanding = computeOutstandingByMember(dues, [payment('d1', 400000)])
    expect(outstanding.get('m1')).toBe(0)
  })

  it('tách nợ theo từng thành viên', () => {
    const dues = [
      due('d1', 'm1', '2026-09-01', 200000),
      due('d2', 'm2', '2026-09-01', 200000),
    ]
    const outstanding = computeOutstandingByMember(dues, [payment('d2', 200000)])
    expect(outstanding.get('m1')).toBe(200000)
    expect(outstanding.get('m2')).toBe(0)
  })
})
