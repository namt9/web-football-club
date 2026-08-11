import Link from 'next/link'
import { getMatches } from '@/lib/data/matches'
import { getFundTransactions } from '@/lib/data/fund-transactions'
import { computeFundSummary } from '@/lib/stats/fund-balance'
import { getMembers } from '@/lib/data/members'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { computeScoringLeaderboard } from '@/lib/stats/scoring-leaderboard'
import { formatVietnamDateTime } from '@/lib/datetime'
import type { MatchEvent } from '@/lib/types'

export default async function HomePage() {
  const [matches, transactions, members] = await Promise.all([
    getMatches(),
    getFundTransactions(),
    getMembers(),
  ])

  const supabase = await createSupabaseServerClient()
  const { data: events } = await supabase.from('match_events').select('*')

  const nextMatch = matches
    .filter((m) => m.status === 'upcoming')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0]

  const summary = computeFundSummary(transactions)
  const leaderboard = computeScoringLeaderboard((events ?? []) as MatchEvent[], members).slice(0, 3)

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Đội bóng phủi</h1>

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Trận sắp tới</h2>
        {nextMatch ? (
          <Link href={`/tran-dau/${nextMatch.id}`} className="text-blue-700">
            {formatVietnamDateTime(nextMatch.scheduled_at)} · {nextMatch.location}
          </Link>
        ) : (
          <p className="text-gray-500">Chưa có trận nào sắp tới.</p>
        )}
        <Link href="/lich-thi-dau" className="mt-2 block text-sm text-gray-500 underline">
          Xem toàn bộ lịch thi đấu
        </Link>
      </section>

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Quỹ đội</h2>
        <p className="text-xl font-bold">{summary.balance.toLocaleString('vi-VN')} đ</p>
        <Link href="/quy" className="mt-2 block text-sm text-gray-500 underline">
          Xem chi tiết thu chi
        </Link>
      </section>

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Top ghi bàn</h2>
        <ul className="mt-2 space-y-1">
          {leaderboard.map((entry) => (
            <li key={entry.memberId}>
              {entry.fullName} — {entry.goals} bàn
            </li>
          ))}
        </ul>
        <Link href="/thong-ke" className="mt-2 block text-sm text-gray-500 underline">
          Xem toàn bộ thống kê
        </Link>
      </section>
    </main>
  )
}
