import { getFundTransactionsForAdmin } from '@/lib/data/fund-transactions'
import { computeFundSummary } from '@/lib/stats/fund-balance'
import { createFundTransaction } from './actions'

export default async function AdminFundPage() {
  const transactions = await getFundTransactionsForAdmin()
  const summary = computeFundSummary(transactions)

  return (
    <div className="space-y-8">
      <section className="rounded border bg-white p-4">
        <p className="text-sm text-gray-600">Số dư hiện tại</p>
        <p className="text-2xl font-bold">{summary.balance.toLocaleString('vi-VN')} đ</p>
        <p className="text-sm text-gray-500">
          Thu: {summary.totalIncome.toLocaleString('vi-VN')} đ · Chi: {summary.totalExpense.toLocaleString('vi-VN')} đ
        </p>
      </section>

      <section>
        <h1 className="text-xl font-bold">Thêm giao dịch</h1>
        <form action={createFundTransaction} className="mt-4 max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium">Loại</label>
            <select name="transaction_type" className="mt-1 w-full rounded border px-3 py-2">
              <option value="income">Thu</option>
              <option value="expense">Chi</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Hạng mục</label>
            <input name="category" placeholder="Quỹ tháng, tiền sân, đồng phục..." required className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Số tiền (đ)</label>
            <input name="amount" type="number" min="0" step="1000" required className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Ngày</label>
            <input name="occurred_on" type="date" required className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Mô tả</label>
            <textarea name="description" className="mt-1 w-full rounded border px-3 py-2" />
          </div>
          <button type="submit" className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
            Lưu
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-xl font-bold">Lịch sử giao dịch</h2>
        <table className="mt-4 w-full border-collapse text-left text-sm">
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
      </section>
    </div>
  )
}
