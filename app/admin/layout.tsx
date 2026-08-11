import Link from 'next/link'
import { signOut } from '../login/actions'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <nav className="flex gap-4 text-sm font-medium">
          <Link href="/admin">Tổng quan</Link>
          <Link href="/admin/thanh-vien">Thành viên</Link>
          <Link href="/admin/quy">Quỹ</Link>
          <Link href="/admin/tran-dau">Trận đấu</Link>
          <Link href="/admin/cong-no">Công nợ</Link>
        </nav>
        <form action={signOut}>
          <button type="submit" className="text-sm text-red-600 hover:underline">
            Đăng xuất
          </button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
