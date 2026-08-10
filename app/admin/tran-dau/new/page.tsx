import { createMatch } from '../actions'

export default function NewMatchPage() {
  return (
    <div>
      <h1 className="text-xl font-bold">Tạo trận đấu</h1>
      <form action={createMatch} className="mt-4 max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium">Loại trận</label>
          <select name="match_type" className="mt-1 w-full rounded border px-3 py-2">
            <option value="internal">Nội bộ (chia 2 đội)</option>
            <option value="friendly">Giao hữu</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Sân</label>
          <select name="field_size" className="mt-1 w-full rounded border px-3 py-2">
            <option value="5">Sân 5 người</option>
            <option value="7">Sân 7 người</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Thời gian</label>
          <input name="scheduled_at" type="datetime-local" required className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Địa điểm</label>
          <input name="location" required className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium">Đối thủ (nếu giao hữu)</label>
          <input name="opponent_name" className="mt-1 w-full rounded border px-3 py-2" />
        </div>
        <button type="submit" className="rounded bg-green-700 px-4 py-2 text-white hover:bg-green-800">
          Tạo trận
        </button>
      </form>
    </div>
  )
}
