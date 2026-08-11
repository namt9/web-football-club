export type MemberPosition = 'GK' | 'DF' | 'MF' | 'FW'
export type MemberStatus = 'active' | 'inactive'

export interface Member {
  id: string
  full_name: string
  jersey_number: number | null
  position: MemberPosition | null
  phone: string | null
  photo_url: string | null
  joined_at: string
  status: MemberStatus
  created_at: string
}

export type TransactionType = 'income' | 'expense'

export interface FundTransaction {
  id: string
  transaction_type: TransactionType
  category: string
  amount: number
  occurred_on: string
  description: string | null
  match_id: string | null
  member_id: string | null
  member_due_id: string | null
  created_at: string
}

/** Bản mà role `anon` được phép đọc — thiếu 2 cột nhạy cảm. */
export type PublicFundTransaction = Omit<FundTransaction, 'member_id' | 'member_due_id'>

export type MatchType = 'internal' | 'friendly'
export type MatchStatus = 'upcoming' | 'completed' | 'cancelled'

export interface Match {
  id: string
  match_type: MatchType
  field_size: number
  scheduled_at: string
  location: string
  opponent_name: string | null
  team_a_score: number | null
  team_b_score: number | null
  status: MatchStatus
  created_at: string
}

export type ParticipantTeam = 'A' | 'B'
export type ParticipantConfirmation = 'pending' | 'confirmed' | 'declined'

export interface MatchParticipant {
  id: string
  match_id: string
  member_id: string
  team: ParticipantTeam
  confirmation: ParticipantConfirmation
}

export type MatchEventType = 'goal' | 'assist'

export interface MatchEvent {
  id: string
  match_id: string
  member_id: string
  event_type: MatchEventType
  minute: number | null
}

export interface MemberDue {
  id: string
  member_id: string
  /** Dạng 'YYYY-MM-DD', luôn là ngày 1 của tháng. */
  period: string
  amount_due: number
  note: string | null
  created_at: string
}
