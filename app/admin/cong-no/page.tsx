import { getMembers } from '@/lib/data/members'
import { getDuePeriods, getDuesForPeriod, getAllDues, getDuePayments } from '@/lib/data/member-dues'
import { computeDuesForPeriod, computeOutstandingByMember } from '@/lib/stats/member-dues'
import { createPeriod } from './actions'

const statusLabel = {
  unpaid: 'Chưa đóng',
  partial: 'Đóng thiếu',
  paid: 'Đã đóng',
} as const

function formatPeriod(period: string) {
  const [year, month] = period.split('-')
  return `Tháng ${Number(month)}/${year}`
}

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ ky?: string }>
}) {
  const { ky } = await searchParams
  const periods = await getDuePeriods()
  const selected = ky && periods.includes(ky) ? ky : periods[0]

  // Truyền TOÀN BỘ thành viên (kể cả inactive): người đã nghỉ vẫn có thể còn
  // nợ kỳ cũ, lọc active ở đây sẽ làm nợ của họ biến mất khỏi bảng.
  const [members, allDues, payments, periodDues] = await Promise.all([
    getMembers(),
    getAllDues(),
    getDuePayments(),
    selected ? getDuesForPeriod(selected) : Promise.resolve([]),
  ])

  const rows = computeDuesForPeriod(periodDues, payments, members)
  const outstanding = computeOutstandingByMember(allDues, payments)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Công nợ đóng góp</h1>
        <p className="text-sm text-gray-500">
          Chỉ admin xem được. Trang quỹ công khai không hiển thị thông tin này.
        </p>
      </div>

      <section className="rounded border bg-white p-4">
        <h2 className="font-semibold">Tạo kỳ mới</h2>
        <form action={createPeriod} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium">Kỳ</label>
            <input name="period" type="month" required className="mt-1 rounded border px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Mức đóng mỗi người</label>
            <input
              name="amount_due"
              type="number"
              min="0"
              step="1000"
              required
              className="mt-1 rounded border px-3 py-2"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800"
          >
            Tạo kỳ
          </button>
        </form>
        <p className="mt-2 text-sm text-gray-500">
          Sinh nghĩa vụ cho mọi thành viên đang hoạt động. Chạy lại trên kỳ đã có chỉ bổ sung
          người còn thiếu, không sửa số tiền của người đã có.
        </p>
      </section>

      {selected ? (
        <section>
          <form className="flex items-end gap-3">
            <div>
              <label className="block text-sm font-medium">Xem kỳ</label>
              <select name="ky" defaultValue={selected} className="mt-1 rounded border px-3 py-2">
                {periods.map((p) => (
                  <option key={p} value={p}>
                    {formatPeriod(p)}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded border px-4 py-2 hover:bg-gray-50">
              Xem
            </button>
          </form>

          <table className="mt-4 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Thành viên</th>
                <th className="py-2">Phải đóng</th>
                <th className="py-2">Đã đóng</th>
                <th className="py-2">Trạng thái</th>
                <th className="py-2">Tổng nợ lũy kế</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.memberId} className="border-b">
                  <td className="py-2">{row.fullName}</td>
                  <td className="py-2">{row.amountDue.toLocaleString('vi-VN')} đ</td>
                  <td className="py-2">{row.amountPaid.toLocaleString('vi-VN')} đ</td>
                  <td className="py-2">{statusLabel[row.status]}</td>
                  <td className="py-2">
                    {(outstanding.get(row.memberId) ?? 0).toLocaleString('vi-VN')} đ
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="mt-4 text-gray-500">Kỳ này chưa có nghĩa vụ nào.</p>
          )}
        </section>
      ) : (
        <p className="text-gray-500">Chưa có kỳ nào. Tạo kỳ đầu tiên ở trên.</p>
      )}
    </div>
  )
}
