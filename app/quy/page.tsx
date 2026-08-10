import { getFundTransactions } from '@/lib/data/fund-transactions'
import { computeFundSummary } from '@/lib/stats/fund-balance'

export default async function PublicFundPage() {
  const transactions = await getFundTransactions()
  const summary = computeFundSummary(transactions)

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Quỹ đội</h1>
      <section className="mt-4 rounded border bg-white p-4">
        <p className="text-sm text-gray-600">Số dư hiện tại</p>
        <p className="text-2xl font-bold">{summary.balance.toLocaleString('vi-VN')} đ</p>
        <p className="text-sm text-gray-500">
          Thu: {summary.totalIncome.toLocaleString('vi-VN')} đ · Chi: {summary.totalExpense.toLocaleString('vi-VN')} đ
        </p>
      </section>

      <table className="mt-6 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Ngày</th>
            <th className="py-2">Loại</th>
            <th className="py-2">Hạng mục</th>
            <th className="py-2">Số tiền</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="py-2">{t.occurred_on}</td>
              <td className="py-2">{t.transaction_type === 'income' ? 'Thu' : 'Chi'}</td>
              <td className="py-2">{t.category}</td>
              <td className="py-2">{t.amount.toLocaleString('vi-VN')} đ</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
