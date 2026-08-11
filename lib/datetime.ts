// Việt Nam dùng offset +07:00 quanh năm (không có DST từ 1975), nên offset cố
// định là đủ — không cần thư viện timezone.
const VIETNAM_OFFSET = '+07:00'
const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh'

/**
 * Đổi giá trị của `<input type="datetime-local">` (chuỗi không có offset, ví dụ
 * `2026-08-15T17:00`) thành mốc thời gian UTC.
 *
 * Bắt buộc phải qua hàm này trước khi ghi vào cột `timestamptz`: Postgres coi
 * chuỗi không offset là giờ của session (Supabase mặc định UTC), nên ghi thẳng
 * sẽ lưu sai 7 tiếng.
 */
export function vietnamLocalToIso(localValue: string): string {
  const withSeconds = localValue.length === 16 ? `${localValue}:00` : localValue
  const date = new Date(`${withSeconds}${VIETNAM_OFFSET}`)

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Thời gian không hợp lệ: ${localValue}`)
  }

  return date.toISOString()
}

/**
 * Format một mốc thời gian sang giờ Việt Nam.
 *
 * Phải dùng hàm này thay cho `toLocaleString('vi-VN')` trực tiếp: các trang là
 * Server Component nên format chạy trên server, và server production (Vercel)
 * chạy UTC — không ghim timezone thì người xem thấy lệch 7 tiếng.
 */
export function formatVietnamDateTime(value: string): string {
  return new Date(value).toLocaleString('vi-VN', { timeZone: VIETNAM_TIME_ZONE })
}
