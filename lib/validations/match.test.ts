import { describe, it, expect } from 'vitest'
import { matchSchema } from './match'

describe('matchSchema', () => {
  it('accepts a valid internal match', () => {
    const result = matchSchema.safeParse({
      match_type: 'internal',
      field_size: 7,
      scheduled_at: '2026-08-15T19:00',
      location: 'Sân ABC',
    })
    expect(result.success).toBe(true)
  })

  it('requires opponent_name for friendly matches', () => {
    const result = matchSchema.safeParse({
      match_type: 'friendly',
      field_size: 5,
      scheduled_at: '2026-08-15T19:00',
      location: 'Sân ABC',
    })
    expect(result.success).toBe(false)
  })

  it('rejects field sizes other than 5 or 7', () => {
    const result = matchSchema.safeParse({
      match_type: 'internal',
      field_size: 11,
      scheduled_at: '2026-08-15T19:00',
      location: 'Sân ABC',
    })
    expect(result.success).toBe(false)
  })
})
