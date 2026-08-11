import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getMembers } from '@/lib/data/members'
import { computeScoringLeaderboard } from '@/lib/stats/scoring-leaderboard'
import type { MatchEvent } from '@/lib/types'

async function getAllEvents(): Promise<MatchEvent[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('match_events').select('*')
  if (error) throw error
  return data
}

export default async function StatsPage() {
  const [members, events] = await Promise.all([getMembers(), getAllEvents()])
  const leaderboard = computeScoringLeaderboard(events, members)

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Thống kê ghi bàn</h1>
      <table className="mt-6 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Cầu thủ</th>
            <th className="py-2">Bàn thắng</th>
            <th className="py-2">Kiến tạo</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map((entry) => (
            <tr key={entry.memberId} className="border-b">
              <td className="py-2">{entry.fullName}</td>
              <td className="py-2">{entry.goals}</td>
              <td className="py-2">{entry.assists}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {leaderboard.length === 0 && <p className="mt-4 text-gray-500">Chưa có dữ liệu ghi bàn.</p>}
    </main>
  )
}
