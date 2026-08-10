import Link from 'next/link'
import { getMatches } from '@/lib/data/matches'

export default async function UpcomingMatchesPage() {
  const matches = await getMatches()
  const upcoming = matches.filter((m) => m.status === 'upcoming')
  const past = matches.filter((m) => m.status !== 'upcoming')

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Lịch thi đấu</h1>

      <h2 className="mt-6 text-lg font-semibold">Sắp tới</h2>
      <ul className="mt-2 space-y-2">
        {upcoming.map((m) => (
          <li key={m.id} className="rounded border p-3">
            <Link href={`/tran-dau/${m.id}`} className="font-medium text-blue-700">
              {new Date(m.scheduled_at).toLocaleString('vi-VN')} · {m.location}
            </Link>
            <p className="text-sm text-gray-600">
              {m.match_type === 'internal' ? 'Nội bộ' : `Giao hữu vs ${m.opponent_name}`} · Sân {m.field_size}
            </p>
          </li>
        ))}
        {upcoming.length === 0 && <p className="text-gray-500">Chưa có trận nào sắp tới.</p>}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Đã diễn ra</h2>
      <ul className="mt-2 space-y-2">
        {past.map((m) => (
          <li key={m.id} className="rounded border p-3">
            <Link href={`/tran-dau/${m.id}`} className="font-medium text-blue-700">
              {new Date(m.scheduled_at).toLocaleString('vi-VN')} · {m.location}
            </Link>
            <p className="text-sm text-gray-600">
              {m.team_a_score ?? '-'} : {m.team_b_score ?? '-'}
            </p>
          </li>
        ))}
        {past.length === 0 && <p className="text-gray-500">Chưa có trận nào đã diễn ra.</p>}
      </ul>
    </main>
  )
}
