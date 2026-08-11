import { describe, it, expect } from 'vitest'
import { createPeriodSchema, paymentSchema, updateAmountDueSchema } from './member-due'

describe('createPeriodSchema', () => {
  it('đổi giá trị input month thành ngày 1 của tháng', () => {
    const result = createPeriodSchema.safeParse({ period: '2026-09', amount_due: '200000' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.period).toBe('2026-09-01')
      expect(result.data.amount_due).toBe(200000)
    }
  })

  it('nhận nghĩa vụ 0 đồng (miễn đóng)', () => {
    expect(createPeriodSchema.safeParse({ period: '2026-09', amount_due: '0' }).success).toBe(true)
  })

  it('từ chối số tiền âm', () => {
    expect(createPeriodSchema.safeParse({ period: '2026-09', amount_due: '-1' }).success).toBe(false)
  })

  it('từ chối tháng ngoài 01-12', () => {
    expect(createPeriodSchema.safeParse({ period: '2026-13', amount_due: '1' }).success).toBe(false)
  })

  it('từ chối tháng thiếu số 0', () => {
    expect(createPeriodSchema.safeParse({ period: '2026-9', amount_due: '1' }).success).toBe(false)
  })

  it('từ chối chuỗi đã là ngày đầy đủ', () => {
    expect(createPeriodSchema.safeParse({ period: '2026-09-01', amount_due: '1' }).success).toBe(false)
  })
})

describe('paymentSchema', () => {
  const valid = {
    member_due_id: '3ead81b0-a323-44bc-827d-abc47936f1c0',
    amount: '200000',
    occurred_on: '2026-09-05',
  }

  it('nhận dữ liệu hợp lệ', () => {
    const result = paymentSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.amount).toBe(200000)
  })

  it('từ chối số tiền 0', () => {
    expect(paymentSchema.safeParse({ ...valid, amount: '0' }).success).toBe(false)
  })

  it('từ chối member_due_id không phải uuid', () => {
    expect(paymentSchema.safeParse({ ...valid, member_due_id: 'abc' }).success).toBe(false)
  })

  it('từ chối ngày sai định dạng', () => {
    expect(paymentSchema.safeParse({ ...valid, occurred_on: '05/09/2026' }).success).toBe(false)
  })
})

describe('updateAmountDueSchema', () => {
  it('nhận số tiền 0', () => {
    const result = updateAmountDueSchema.safeParse({
      id: '3ead81b0-a323-44bc-827d-abc47936f1c0',
      amount_due: '0',
    })
    expect(result.success).toBe(true)
  })

  it('từ chối số tiền âm', () => {
    const result = updateAmountDueSchema.safeParse({
      id: '3ead81b0-a323-44bc-827d-abc47936f1c0',
      amount_due: '-5',
    })
    expect(result.success).toBe(false)
  })
})
