import { getMembers } from '@/lib/data/members'

export default async function MembersPage() {
  const members = await getMembers()
  const active = members.filter((m) => m.status === 'active')

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Thành viên đội</h1>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {active.map((member) => (
          <li key={member.id} className="rounded border p-4">
            <p className="font-semibold">
              {member.full_name} {member.jersey_number ? `#${member.jersey_number}` : ''}
            </p>
            <p className="text-sm text-gray-600">{member.position ?? 'Chưa rõ vị trí'}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
