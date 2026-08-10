import { describe, it, expect } from 'vitest'
import { matchEventSchema } from './match-event'

describe('matchEventSchema', () => {
  const validBase = {
    match_id: '11111111-1111-1111-8111-111111111111',
    member_id: '22222222-2222-1222-a222-222222222222',
  }

  it('accepts a valid goal event', () => {
    const result = matchEventSchema.safeParse({ ...validBase, event_type: 'goal', minute: 45 })
    expect(result.success).toBe(true)
  })

  it('rejects an invalid event_type', () => {
    const result = matchEventSchema.safeParse({ ...validBase, event_type: 'red_card' })
    expect(result.success).toBe(false)
  })

  it('rejects minute greater than 120', () => {
    const result = matchEventSchema.safeParse({ ...validBase, event_type: 'goal', minute: 200 })
    expect(result.success).toBe(false)
  })
})
