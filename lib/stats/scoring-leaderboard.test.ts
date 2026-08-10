import { describe, it, expect } from 'vitest'
import { computeScoringLeaderboard } from './scoring-leaderboard'
import type { MatchEvent } from '@/lib/types'

const members = [
  { id: 'm1', full_name: 'Nguyễn Văn A' },
  { id: 'm2', full_name: 'Trần Văn B' },
  { id: 'm3', full_name: 'Lê Văn C' },
]

function event(overrides: Partial<MatchEvent>): MatchEvent {
  return {
    id: '1',
    match_id: 'match1',
    member_id: 'm1',
    event_type: 'goal',
    minute: null,
    ...overrides,
  }
}

describe('computeScoringLeaderboard', () => {
  it('returns empty array when no events', () => {
    expect(computeScoringLeaderboard([], members)).toEqual([])
  })

  it('counts goals and assists per member', () => {
    const events = [
      event({ member_id: 'm1', event_type: 'goal' }),
      event({ member_id: 'm1', event_type: 'goal' }),
      event({ member_id: 'm2', event_type: 'assist' }),
    ]
    const result = computeScoringLeaderboard(events, members)
    expect(result).toEqual([
      { memberId: 'm1', fullName: 'Nguyễn Văn A', goals: 2, assists: 0 },
      { memberId: 'm2', fullName: 'Trần Văn B', goals: 0, assists: 1 },
    ])
  })

  it('sorts by goals then assists, descending, and excludes members with no events', () => {
    const events = [
      event({ member_id: 'm2', event_type: 'goal' }),
      event({ member_id: 'm1', event_type: 'goal' }),
      event({ member_id: 'm1', event_type: 'assist' }),
    ]
    const result = computeScoringLeaderboard(events, members)
    expect(result.map((r) => r.memberId)).toEqual(['m1', 'm2'])
    expect(result.find((r) => r.memberId === 'm3')).toBeUndefined()
  })

  it('ignores events referencing unknown members', () => {
    const events = [event({ member_id: 'unknown', event_type: 'goal' })]
    expect(computeScoringLeaderboard(events, members)).toEqual([])
  })
})
