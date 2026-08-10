import { describe, it, expect } from 'vitest'
import { computeFundSummary } from './fund-balance'
import type { FundTransaction } from '@/lib/types'

function tx(overrides: Partial<FundTransaction>): FundTransaction {
  return {
    id: '1',
    transaction_type: 'income',
    category: 'quỹ tháng',
    amount: 100000,
    occurred_on: '2026-08-01',
    description: null,
    match_id: null,
    member_id: null,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeFundSummary', () => {
  it('returns zero balance for no transactions', () => {
    expect(computeFundSummary([])).toEqual({ totalIncome: 0, totalExpense: 0, balance: 0 })
  })

  it('sums income and expense separately and computes balance', () => {
    const transactions = [
      tx({ transaction_type: 'income', amount: 500000 }),
      tx({ transaction_type: 'income', amount: 200000 }),
      tx({ transaction_type: 'expense', amount: 150000 }),
    ]
    expect(computeFundSummary(transactions)).toEqual({
      totalIncome: 700000,
      totalExpense: 150000,
      balance: 550000,
    })
  })

  it('handles expense-only transactions producing a negative balance', () => {
    const transactions = [tx({ transaction_type: 'expense', amount: 100000 })]
    expect(computeFundSummary(transactions)).toEqual({
      totalIncome: 0,
      totalExpense: 100000,
      balance: -100000,
    })
  })
})
