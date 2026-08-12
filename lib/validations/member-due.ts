import { z } from 'zod'

/** Đúng dạng của `<input type="month">`: YYYY-MM, tháng 01-12. */
const MONTH_INPUT = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/

/**
 * Số tiền phải đóng: cho phép 0 (miễn đóng) nhưng KHÔNG cho phép để trống.
 *
 * Không dùng `z.coerce.number()` trực tiếp: `Number('')` là `0`, nên ô nhập bị
 * xoá trắng sẽ lặng lẽ biến thành nghĩa vụ 0 đồng — tức xoá nợ của người đó mà
 * không báo gì. Chặn chuỗi rỗng trước rồi mới coerce.
 */
const amountDueField = z
  .string()
  .min(1, 'Số tiền không được để trống')
  .transform((value) => Number(value))
  .pipe(z.number().min(0, 'Số tiền không được âm'))

export const createPeriodSchema = z.object({
  period: z
    .string()
    .regex(MONTH_INPUT, 'Kỳ phải có dạng YYYY-MM')
    // Nối chuỗi trực tiếp, KHÔNG qua `new Date()`: cột `period` là kiểu
    // `date` nên không được để timezone chen vào giữa.
    .transform((value) => `${value}-01`),
  amount_due: amountDueField,
})

export const paymentSchema = z.object({
  member_due_id: z.string().uuid('Nghĩa vụ không hợp lệ'),
  amount: z.coerce.number().positive('Số tiền phải lớn hơn 0'),
  occurred_on: z.string().regex(DATE_INPUT, 'Ngày không hợp lệ'),
})

export const updateAmountDueSchema = z.object({
  id: z.string().uuid('Nghĩa vụ không hợp lệ'),
  amount_due: amountDueField,
})
