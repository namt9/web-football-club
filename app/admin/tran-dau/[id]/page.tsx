import { notFound } from 'next/navigation'
import { getMatch, getMatchParticipants, getMatchEvents, getMatchLineups } from '@/lib/data/matches'
import { getMembers } from '@/lib/data/members'
import { formatVietnamDateTime } from '@/lib/datetime'
import { getFormationNames, getFormationSlots, isFieldSize, type FieldSize } from '@/lib/formations'
import type { MatchParticipant, Member } from '@/lib/types'
import { setParticipants, recordResult, setLineup } from '../actions'

function renderLineupTeamSection({
  matchId,
  team,
  label,
  fieldSize,
  formationNames,
  selectedFormation,
  otherFormationValue,
  participants,
}: {
  matchId: string
  team: 'A' | 'B'
  label: string
  fieldSize: FieldSize
  formationNames: string[]
  selectedFormation: string
  otherFormationValue: string
  participants: (MatchParticipant & { member: Member })[]
}) {
  const slots = getFormationSlots(fieldSize, selectedFormation) ?? []
  const teamParticipants = participants
    .filter((p) => p.team === team)
    .slice()
    .sort((a, b) => (a.position_slot ? 1 : 0) - (b.position_slot ? 1 : 0))
  const formationParam = team === 'A' ? 'formation_a' : 'formation_b'
  const otherFormationParam = team === 'A' ? 'formation_b' : 'formation_a'

  return (
    <div className="rounded border p-4">
      <h3 className="font-semibold">{label}</h3>

      <form className="mt-2 flex items-end gap-2 text-sm">
        <input type="hidden" name={otherFormationParam} value={otherFormationValue} />
        <div>
          <label className="block text-sm font-medium">Sơ đồ</label>
          <select name={formationParam} defaultValue={selectedFormation} className="mt-1 rounded border px-2 py-1">
            {formationNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded border px-3 py-1 hover:bg-gray-50">
          Chọn
        </button>
      </form>

      <form action={setLineup.bind(null, matchId, team)} className="mt-4 space-y-2">
        <input type="hidden" name="formation" value={selectedFormation} />
        {slots.map((slot) => {
          const current = teamParticipants.find((p) => p.position_slot === slot.key)
          return (
            <div key={slot.key} className="flex items-center gap-2">
              <span className="w-28 text-sm text-gray-600">{slot.label}</span>
              <select
                name={`slot_${slot.key}`}
                defaultValue={current?.member_id ?? ''}
                className="rounded border px-2 py-1 text-sm"
              >
                <option value="">-- Bỏ trống --</option>
                {teamParticipants.map((p) => (
                  <option key={p.member_id} value={p.member_id}>
                    {p.member.full_name}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
        <button type="submit" className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
          Lưu sơ đồ
        </button>
      </form>
    </div>
  )
}

export default async function ManageMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ formation_a?: string; formation_b?: string }>
}) {
  const { id } = await params
  const { formation_a, formation_b } = await searchParams
  const match = await getMatch(id)
  if (!match) notFound()

  const [members, participants, events, lineups] = await Promise.all([
    getMembers(),
    getMatchParticipants(id),
    getMatchEvents(id),
    getMatchLineups(id),
  ])
  const participantIds = new Set(participants.map((p) => p.member_id))

  const fieldSize = isFieldSize(match.field_size) ? match.field_size : null
  const formationNames = fieldSize ? getFormationNames(fieldSize) : []
  const lineupA = lineups.find((l) => l.team === 'A')
  const lineupB = lineups.find((l) => l.team === 'B')
  const selectedFormationA =
    (formation_a && formationNames.includes(formation_a) ? formation_a : lineupA?.formation) ??
    formationNames[0] ??
    ''
  const selectedFormationB =
    (formation_b && formationNames.includes(formation_b) ? formation_b : lineupB?.formation) ??
    formationNames[0] ??
    ''

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-bold">
          {match.match_type === 'internal' ? 'Trận nội bộ' : `Giao hữu vs ${match.opponent_name}`}
        </h1>
        <p className="text-gray-600">
          {formatVietnamDateTime(match.scheduled_at)} · {match.location} · Sân {match.field_size}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-bold">Người tham gia</h2>
        <form action={setParticipants.bind(null, id)} className="mt-4 space-y-2">
          {members
            .filter((m) => m.status === 'active')
            .map((member) => {
              const participant = participants.find((p) => p.member_id === member.id)
              return (
                <div key={member.id} className="flex items-center gap-3 border-b py-2">
                  <input type="checkbox" name="member_id" value={member.id} defaultChecked={participantIds.has(member.id)} />
                  <span className="flex-1">{member.full_name}</span>
                  {match.match_type === 'internal' && (
                    <select name={`team_${member.id}`} defaultValue={participant?.team ?? 'A'} className="rounded border px-2 py-1 text-sm">
                      <option value="A">Đội A</option>
                      <option value="B">Đội B</option>
                    </select>
                  )}
                </div>
              )
            })}
          <button type="submit" className="mt-4 rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
            Lưu danh sách
          </button>
        </form>
      </section>

      {fieldSize && (
        <section>
          <h2 className="text-lg font-bold">Sơ đồ đội hình</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {renderLineupTeamSection({
              matchId: id,
              team: 'A',
              label: match.match_type === 'internal' ? 'Đội A' : 'Đội mình',
              fieldSize,
              formationNames,
              selectedFormation: selectedFormationA,
              otherFormationValue: selectedFormationB,
              participants,
            })}
            {match.match_type === 'internal' &&
              renderLineupTeamSection({
                matchId: id,
                team: 'B',
                label: 'Đội B',
                fieldSize,
                formationNames,
                selectedFormation: selectedFormationB,
                otherFormationValue: selectedFormationA,
                participants,
              })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-bold">Kết quả trận</h2>
        <form action={recordResult.bind(null, id)} className="mt-4 space-y-4">
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-medium">
                {match.match_type === 'internal' ? 'Tỷ số Đội A' : 'Tỷ số đội mình'}
              </label>
              <input name="team_a_score" type="number" min="0" defaultValue={match.team_a_score ?? ''} className="mt-1 w-24 rounded border px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium">
                {match.match_type === 'internal' ? 'Tỷ số Đội B' : 'Tỷ số đối thủ'}
              </label>
              <input name="team_b_score" type="number" min="0" defaultValue={match.team_b_score ?? ''} className="mt-1 w-24 rounded border px-3 py-2" />
            </div>
          </div>

          <div>
            <h3 className="font-medium">Bàn thắng / kiến tạo</h3>
            <p className="text-sm text-gray-500">Thêm từng dòng cho một bàn thắng hoặc kiến tạo.</p>
            {Array.from({ length: 6 }).map((_, i) => {
              const existing = events[i]
              return (
                <div key={i} className="mt-2 flex gap-2">
                  <select name="event_member_id" defaultValue={existing?.member_id ?? ''} className="rounded border px-2 py-1 text-sm">
                    <option value="">-- Cầu thủ --</option>
                    {participants.map((p) => (
                      <option key={p.member_id} value={p.member_id}>
                        {p.member.full_name}
                      </option>
                    ))}
                  </select>
                  <select name="event_type" defaultValue={existing?.event_type ?? ''} className="rounded border px-2 py-1 text-sm">
                    <option value="">-- Loại --</option>
                    <option value="goal">Bàn thắng</option>
                    <option value="assist">Kiến tạo</option>
                  </select>
                </div>
              )
            })}
          </div>

          <button type="submit" className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
            Lưu kết quả
          </button>
        </form>
      </section>
    </div>
  )
}
