import { notFound } from 'next/navigation'
import { getMatch, getMatchParticipants, getMatchEvents, getMatchLineups } from '@/lib/data/matches'
import { formatVietnamDateTime } from '@/lib/datetime'
import { getFormationSlots, isFieldSize, type FieldSize } from '@/lib/formations'
import type { MatchParticipant, Member } from '@/lib/types'

function renderPitch({
  fieldSize,
  formation,
  label,
  participants,
}: {
  fieldSize: FieldSize
  formation: string
  label: string
  participants: (MatchParticipant & { member: Member })[]
}) {
  const slots = getFormationSlots(fieldSize, formation) ?? []
  const placedMemberIds = new Set(
    slots
      .map((slot) => participants.find((p) => p.position_slot === slot.key)?.member_id)
      .filter((id): id is string => id !== undefined)
  )

  // Nếu không ai thực sự đứng vào sân theo sơ đồ hiện tại (ví dụ danh sách
  // tham gia vừa được sửa lại sau khi đã xếp sơ đồ, xoá hết position_slot),
  // không hiện sân trống — coi như chưa có sơ đồ.
  if (placedMemberIds.size === 0) return null

  const bench = participants.filter((p) => !placedMemberIds.has(p.member_id))

  return (
    <div>
      <h3 className="font-semibold">{label}</h3>
      <div className="relative mt-2 aspect-[2/3] w-full max-w-xs rounded bg-green-700">
        <div className="absolute left-0 top-1/2 h-px w-full bg-white/40" />
        {slots.map((slot) => {
          const player = participants.find((p) => p.position_slot === slot.key)
          if (!player) return null
          return (
            <div
              key={slot.key}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-center text-xs font-medium text-white"
              style={{ top: `${slot.top}%`, left: `${slot.left}%` }}
            >
              {player.member.full_name}
            </div>
          )
        })}
      </div>
      {bench.length > 0 && (
        <p className="mt-2 text-sm text-gray-500">Dự bị: {bench.map((p) => p.member.full_name).join(', ')}</p>
      )}
    </div>
  )
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const match = await getMatch(id)
  if (!match) notFound()

  const [participants, events, lineups] = await Promise.all([
    getMatchParticipants(id),
    getMatchEvents(id),
    getMatchLineups(id),
  ])

  const teamA = participants.filter((p) => p.team === 'A')
  const teamB = participants.filter((p) => p.team === 'B')
  const fieldSize = isFieldSize(match.field_size) ? match.field_size : null
  const lineupA = lineups.find((l) => l.team === 'A')
  const lineupB = lineups.find((l) => l.team === 'B')

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

      {fieldSize && (lineupA || lineupB) && (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {lineupA &&
            renderPitch({
              fieldSize,
              formation: lineupA.formation,
              label: match.match_type === 'internal' ? 'Đội A' : 'Đội mình',
              participants: teamA,
            })}
          {match.match_type === 'internal' &&
            lineupB &&
            renderPitch({
              fieldSize,
              formation: lineupB.formation,
              label: 'Đội B',
              participants: teamB,
            })}
        </div>
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
