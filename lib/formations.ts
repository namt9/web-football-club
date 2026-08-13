export type FieldSize = 5 | 7

export interface FormationSlot {
  key: string
  label: string
  /** % từ mép trên sân, 0 = vạch cầu môn nhà, 100 = vạch cầu môn đối phương. */
  top: number
  /** % từ mép trái sân. */
  left: number
}

/**
 * Sơ đồ tĩnh, định nghĩa cứng — không cho admin tự tạo mới, không lưu DB.
 * Mục đích chỉ là truyền đạt vị trí ("hậu vệ phải"), không cần toạ độ chính xác.
 */
export const FORMATIONS: Record<FieldSize, Record<string, FormationSlot[]>> = {
  5: {
    '1-2-1': [
      { key: 'GK', label: 'Thủ môn', top: 90, left: 50 },
      { key: 'DF1', label: 'Hậu vệ', top: 70, left: 50 },
      { key: 'MF1', label: 'Tiền vệ 1', top: 45, left: 30 },
      { key: 'MF2', label: 'Tiền vệ 2', top: 45, left: 70 },
      { key: 'FW1', label: 'Tiền đạo', top: 15, left: 50 },
    ],
    '2-1-1': [
      { key: 'GK', label: 'Thủ môn', top: 90, left: 50 },
      { key: 'DF1', label: 'Hậu vệ 1', top: 70, left: 30 },
      { key: 'DF2', label: 'Hậu vệ 2', top: 70, left: 70 },
      { key: 'MF1', label: 'Tiền vệ', top: 45, left: 50 },
      { key: 'FW1', label: 'Tiền đạo', top: 15, left: 50 },
    ],
  },
  7: {
    '2-3-1': [
      { key: 'GK', label: 'Thủ môn', top: 90, left: 50 },
      { key: 'DF1', label: 'Hậu vệ 1', top: 72, left: 30 },
      { key: 'DF2', label: 'Hậu vệ 2', top: 72, left: 70 },
      { key: 'MF1', label: 'Tiền vệ 1', top: 48, left: 20 },
      { key: 'MF2', label: 'Tiền vệ 2', top: 48, left: 50 },
      { key: 'MF3', label: 'Tiền vệ 3', top: 48, left: 80 },
      { key: 'FW1', label: 'Tiền đạo', top: 15, left: 50 },
    ],
    '3-2-1': [
      { key: 'GK', label: 'Thủ môn', top: 90, left: 50 },
      { key: 'DF1', label: 'Hậu vệ 1', top: 72, left: 20 },
      { key: 'DF2', label: 'Hậu vệ 2', top: 72, left: 50 },
      { key: 'DF3', label: 'Hậu vệ 3', top: 72, left: 80 },
      { key: 'MF1', label: 'Tiền vệ 1', top: 45, left: 35 },
      { key: 'MF2', label: 'Tiền vệ 2', top: 45, left: 65 },
      { key: 'FW1', label: 'Tiền đạo', top: 15, left: 50 },
    ],
  },
}

export function isFieldSize(value: number): value is FieldSize {
  return value === 5 || value === 7
}

export function getFormationNames(fieldSize: FieldSize): string[] {
  return Object.keys(FORMATIONS[fieldSize])
}

export function getFormationSlots(fieldSize: FieldSize, formation: string): FormationSlot[] | undefined {
  return FORMATIONS[fieldSize][formation]
}
