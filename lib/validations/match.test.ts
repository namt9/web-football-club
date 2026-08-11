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

  it('converts scheduled_at from Vietnam local time to a UTC instant', () => {
    const result = matchSchema.safeParse({
      match_type: 'internal',
      field_size: 7,
      scheduled_at: '2026-08-15T17:00',
      location: 'Sân ABC',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.scheduled_at).toBe('2026-08-15T10:00:00.000Z')
    }
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
