import { notFound } from 'next/navigation'
import { getMatch, getMatchParticipants } from '@/lib/data/matches'
import { getMembers } from '@/lib/data/members'
import { setParticipants } from '../actions'

export default async function ManageMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const match = await getMatch(id)
  if (!match) notFound()

  const [members, participants] = await Promise.all([getMembers(), getMatchParticipants(id)])
  const participantIds = new Set(participants.map((p) => p.member_id))

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-bold">
          {match.match_type === 'internal' ? 'Trận nội bộ' : `Giao hữu vs ${match.opponent_name}`}
        </h1>
        <p className="text-gray-600">
          {new Date(match.scheduled_at).toLocaleString('vi-VN')} · {match.location} · Sân {match.field_size}
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
    </div>
  )
}
