import type { MatchEvent, Member } from '@/lib/types'

export interface LeaderboardEntry {
  memberId: string
  fullName: string
  goals: number
  assists: number
}

export function computeScoringLeaderboard(
  events: MatchEvent[],
  members: Pick<Member, 'id' | 'full_name'>[]
): LeaderboardEntry[] {
  const byMember = new Map<string, LeaderboardEntry>()

  for (const member of members) {
    byMember.set(member.id, { memberId: member.id, fullName: member.full_name, goals: 0, assists: 0 })
  }

  for (const event of events) {
    const entry = byMember.get(event.member_id)
    if (!entry) continue
    if (event.event_type === 'goal') entry.goals += 1
    else entry.assists += 1
  }

  return Array.from(byMember.values())
    .filter((entry) => entry.goals > 0 || entry.assists > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
}
