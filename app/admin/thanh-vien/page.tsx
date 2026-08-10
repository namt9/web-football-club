import Link from 'next/link'
import { getMembers } from '@/lib/data/members'
import { createMember, deleteMember } from './actions'
import { MemberForm } from './MemberForm'

export default async function AdminMembersPage() {
  const members = await getMembers()

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-xl font-bold">Thêm thành viên</h1>
        <div className="mt-4">
          <MemberForm action={createMember} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">Danh sách thành viên ({members.length})</h2>
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Họ tên</th>
              <th className="py-2">Số áo</th>
              <th className="py-2">Vị trí</th>
              <th className="py-2">Trạng thái</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b">
                <td className="py-2">{member.full_name}</td>
                <td className="py-2">{member.jersey_number ?? '-'}</td>
                <td className="py-2">{member.position ?? '-'}</td>
                <td className="py-2">{member.status === 'active' ? 'Đang hoạt động' : 'Ngừng hoạt động'}</td>
                <td className="py-2 space-x-3">
                  <Link href={`/admin/thanh-vien/${member.id}`} className="text-blue-600">
                    Sửa
                  </Link>
                  <form action={deleteMember.bind(null, member.id)} className="inline">
                    <button type="submit" className="text-red-600">
                      Xóa
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
