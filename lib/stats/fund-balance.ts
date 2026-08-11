import type { FundTransaction } from '@/lib/types'

export interface FundSummary {
  totalIncome: number
  totalExpense: number
  balance: number
}

export function computeFundSummary(transactions: Pick<FundTransaction, 'transaction_type' | 'amount'>[]): FundSummary {
  let totalIncome = 0
  let totalExpense = 0

  for (const t of transactions) {
    if (t.transaction_type === 'income') {
      totalIncome += t.amount
    } else {
      totalExpense += t.amount
    }
  }

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  }
}
