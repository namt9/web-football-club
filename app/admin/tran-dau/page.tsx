import Link from 'next/link'
import { getMatches } from '@/lib/data/matches'

const statusLabel: Record<string, string> = {
  upcoming: 'Sắp tới',
  completed: 'Đã diễn ra',
  cancelled: 'Đã hủy',
}

export default async function AdminMatchesPage() {
  const matches = await getMatches()

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Trận đấu</h1>
        <Link href="/admin/tran-dau/new" className="rounded bg-green-700 px-4 py-2 text-white">
          Tạo trận mới
        </Link>
      </div>
      <table className="mt-4 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Thời gian</th>
            <th className="py-2">Loại</th>
            <th className="py-2">Địa điểm</th>
            <th className="py-2">Trạng thái</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.id} className="border-b">
              <td className="py-2">{new Date(m.scheduled_at).toLocaleString('vi-VN')}</td>
              <td className="py-2">{m.match_type === 'internal' ? 'Nội bộ' : `Giao hữu vs ${m.opponent_name}`}</td>
              <td className="py-2">{m.location}</td>
              <td className="py-2">{statusLabel[m.status]}</td>
              <td className="py-2">
                <Link href={`/admin/tran-dau/${m.id}`} className="text-blue-600">
                  Quản lý
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
