'use client'

import type { Member } from '@/lib/types'

export function MemberForm({
  member,
  action,
}: {
  member?: Member
  action: (formData: FormData) => void
}) {
  return (
    <form action={action} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm font-medium">Họ tên</label>
        <input name="full_name" defaultValue={member?.full_name} required className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Số áo</label>
        <input name="jersey_number" type="number" defaultValue={member?.jersey_number ?? ''} className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Vị trí</label>
        <select name="position" defaultValue={member?.position ?? ''} className="mt-1 w-full rounded border px-3 py-2">
          <option value="">-- Chọn --</option>
          <option value="GK">Thủ môn (GK)</option>
          <option value="DF">Hậu vệ (DF)</option>
          <option value="MF">Tiền vệ (MF)</option>
          <option value="FW">Tiền đạo (FW)</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Số điện thoại</label>
        <input name="phone" defaultValue={member?.phone ?? ''} className="mt-1 w-full rounded border px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium">Trạng thái</label>
        <select name="status" defaultValue={member?.status ?? 'active'} className="mt-1 w-full rounded border px-3 py-2">
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Ngừng hoạt động</option>
        </select>
      </div>
      <button type="submit" className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
        Lưu
      </button>
    </form>
  )
}
