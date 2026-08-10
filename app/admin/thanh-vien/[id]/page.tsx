import { notFound } from 'next/navigation'
import { getMember } from '@/lib/data/members'
import { updateMember } from '../actions'
import { MemberForm } from '../MemberForm'

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const member = await getMember(id)
  if (!member) notFound()

  return (
    <div>
      <h1 className="text-xl font-bold">Sửa thành viên</h1>
      <div className="mt-4">
        <MemberForm member={member} action={updateMember.bind(null, id)} />
      </div>
    </div>
  )
}
