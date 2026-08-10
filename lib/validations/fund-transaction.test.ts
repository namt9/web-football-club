import { describe, it, expect } from 'vitest'
import { fundTransactionSchema } from './fund-transaction'

describe('fundTransactionSchema', () => {
  it('accepts a valid income transaction', () => {
    const result = fundTransactionSchema.safeParse({
      transaction_type: 'income',
      category: 'Quỹ tháng',
      amount: 500000,
      occurred_on: '2026-08-01',
    })
    expect(result.success).toBe(true)
  })

  it('rejects zero or negative amount', () => {
    const result = fundTransactionSchema.safeParse({
      transaction_type: 'expense',
      category: 'Tiền sân',
      amount: 0,
      occurred_on: '2026-08-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty category', () => {
    const result = fundTransactionSchema.safeParse({
      transaction_type: 'income',
      category: '',
      amount: 100000,
      occurred_on: '2026-08-01',
    })
    expect(result.success).toBe(false)
  })
})
