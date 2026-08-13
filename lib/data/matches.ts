import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Match, MatchParticipant, MatchEvent, MatchLineup, Member } from '@/lib/types'

export async function getMatches(): Promise<Match[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('scheduled_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getMatch(id: string): Promise<Match | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('matches').select('*').eq('id', id).maybeSingle()

  if (error) throw error
  return data
}

export async function getMatchParticipants(
  matchId: string
): Promise<(MatchParticipant & { member: Member })[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('match_participants')
    .select('*, member:members(*)')
    .eq('match_id', matchId)

  if (error) throw error
  return data as (MatchParticipant & { member: Member })[]
}

export async function getMatchEvents(matchId: string): Promise<MatchEvent[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('match_events').select('*').eq('match_id', matchId)

  if (error) throw error
  return data
}

export async function getMatchLineups(matchId: string): Promise<MatchLineup[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('match_lineups').select('*').eq('match_id', matchId)

  if (error) throw error
  return data
}
