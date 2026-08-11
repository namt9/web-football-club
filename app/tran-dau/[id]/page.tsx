import { notFound } from 'next/navigation'
import { getMatch, getMatchParticipants, getMatchEvents } from '@/lib/data/matches'
import { formatVietnamDateTime } from '@/lib/datetime'

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const match = await getMatch(id)
  if (!match) notFound()

  const [participants, events] = await Promise.all([getMatchParticipants(id), getMatchEvents(id)])

  const teamA = participants.filter((p) => p.team === 'A')
  const teamB = participants.filter((p) => p.team === 'B')

  const eventLabel = (memberId: string) => {
    const memberEvents = events.filter((e) => e.member_id === memberId)
    if (memberEvents.length === 0) return null
    return memberEvents.map((e) => (e.event_type === 'goal' ? '⚽' : '🎯')).join(' ')
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">
        {match.match_type === 'internal' ? 'Trận nội bộ' : `Giao hữu vs ${match.opponent_name}`}
      </h1>
      <p className="text-gray-600">
        {formatVietnamDateTime(match.scheduled_at)} · {match.location} · Sân {match.field_size}
      </p>

      {match.status === 'completed' && (
        <p className="mt-2 text-xl font-bold">
          {match.team_a_score} : {match.team_b_score}
        </p>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="font-semibold">{match.match_type === 'internal' ? 'Đội A' : 'Đội mình'}</h2>
          <ul className="mt-2 space-y-1">
            {teamA.map((p) => (
              <li key={p.id}>
                {p.member.full_name} {eventLabel(p.member_id)}
              </li>
            ))}
          </ul>
        </div>
        {match.match_type === 'internal' && (
          <div>
            <h2 className="font-semibold">Đội B</h2>
            <ul className="mt-2 space-y-1">
              {teamB.map((p) => (
                <li key={p.id}>
                  {p.member.full_name} {eventLabel(p.member_id)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  )
}
