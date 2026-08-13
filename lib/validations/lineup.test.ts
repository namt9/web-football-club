import { describe, it, expect } from 'vitest'
import { buildLineupSchema } from './lineup'

describe('buildLineupSchema', () => {
  it('nhận sơ đồ và các gán hợp lệ', () => {
    const schema = buildLineupSchema(5)
    const result = schema.safeParse({
      formation: '1-2-1',
      assignments: [
        { slot: 'GK', member_id: '3ead81b0-a323-44bc-827d-abc47936f1c0' },
        { slot: 'DF1', member_id: null },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('nhận sơ đồ chưa gán ai (assignments rỗng)', () => {
    const schema = buildLineupSchema(7)
    const result = schema.safeParse({ formation: '2-3-1', assignments: [] })
    expect(result.success).toBe(true)
  })

  it('từ chối sơ đồ không thuộc cỡ sân đang xét', () => {
    const schema = buildLineupSchema(5)
    const result = schema.safeParse({ formation: '2-3-1', assignments: [] })
    expect(result.success).toBe(false)
  })

  it('từ chối vị trí không thuộc sơ đồ đã chọn', () => {
    const schema = buildLineupSchema(5)
    const result = schema.safeParse({
      formation: '1-2-1',
      assignments: [{ slot: 'DF2', member_id: '3ead81b0-a323-44bc-827d-abc47936f1c0' }],
    })
    expect(result.success).toBe(false)
  })

  it('từ chối một cầu thủ giữ hai vị trí cùng lúc', () => {
    const schema = buildLineupSchema(7)
    const result = schema.safeParse({
      formation: '2-3-1',
      assignments: [
        { slot: 'DF1', member_id: '3ead81b0-a323-44bc-827d-abc47936f1c0' },
        { slot: 'DF2', member_id: '3ead81b0-a323-44bc-827d-abc47936f1c0' },
      ],
    })
    expect(result.success).toBe(false)
  })
})
