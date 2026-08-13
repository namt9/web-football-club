'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { matchSchema } from '@/lib/validations/match'
import { matchEventSchema } from '@/lib/validations/match-event'
import { getMatch, getMatchParticipants } from '@/lib/data/matches'
import { isFieldSize, getFormationSlots } from '@/lib/formations'
import { buildLineupSchema } from '@/lib/validations/lineup'

export async function createMatch(formData: FormData) {
  const parsed = matchSchema.safeParse({
    match_type: formData.get('match_type'),
    field_size: formData.get('field_size'),
    scheduled_at: formData.get('scheduled_at'),
    location: formData.get('location'),
    opponent_name: formData.get('opponent_name') || null,
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('matches').insert(parsed.data).select('id').single()
  if (error) throw error

  revalidatePath('/admin/tran-dau')
  revalidatePath('/lich-thi-dau')
  redirect(`/admin/tran-dau/${data.id}`)
}

export async function setParticipants(matchId: string, formData: FormData) {
  const memberIds = formData.getAll('member_id').map(String)
  const supabase = await createSupabaseServerClient()

  await supabase.from('match_participants').delete().eq('match_id', matchId)

  if (memberIds.length > 0) {
    const rows = memberIds.map((memberId) => ({
      match_id: matchId,
      member_id: memberId,
      team: String(formData.get(`team_${memberId}`) ?? 'A'),
      confirmation: 'confirmed' as const,
    }))
    const { error } = await supabase.from('match_participants').insert(rows)
    if (error) throw error
  }

  revalidatePath(`/admin/tran-dau/${matchId}`)
  revalidatePath(`/tran-dau/${matchId}`)
}

export async function recordResult(matchId: string, formData: FormData) {
  const teamAScore = Number(formData.get('team_a_score'))
  const teamBScore = Number(formData.get('team_b_score'))

  const supabase = await createSupabaseServerClient()
  const { error: matchError } = await supabase
    .from('matches')
    .update({ team_a_score: teamAScore, team_b_score: teamBScore, status: 'completed' })
    .eq('id', matchId)
  if (matchError) throw matchError

  const memberIds = formData.getAll('event_member_id').map(String)
  const eventTypes = formData.getAll('event_type').map(String)

  await supabase.from('match_events').delete().eq('match_id', matchId)

  const events = memberIds
    .map((memberId, i) => ({ memberId, eventType: eventTypes[i] }))
    .filter((e) => e.memberId && e.eventType)
    .map((e) =>
      matchEventSchema.parse({
        match_id: matchId,
        member_id: e.memberId,
        event_type: e.eventType,
      })
    )

  if (events.length > 0) {
    const { error } = await supabase.from('match_events').insert(events)
    if (error) throw error
  }

  revalidatePath(`/admin/tran-dau/${matchId}`)
  revalidatePath(`/tran-dau/${matchId}`)
  revalidatePath('/thong-ke')
}

export async function setLineup(matchId: string, team: 'A' | 'B', formData: FormData) {
  const match = await getMatch(matchId)
  if (!match) throw new Error('Không tìm thấy trận đấu')
  if (!isFieldSize(match.field_size)) throw new Error('Sân không hợp lệ')

  const formation = String(formData.get('formation') ?? '')
  const slots = getFormationSlots(match.field_size, formation) ?? []

  // Chỉ đưa vào assignments những ô có người được chọn — ô "-- Bỏ trống --"
  // không cần validate vì không tạo ra thay đổi gì.
  const assignments = slots
    .map((slot) => ({
      slot: slot.key,
      member_id: String(formData.get(`slot_${slot.key}`) ?? '') || null,
    }))
    .filter((a) => a.member_id !== null)

  const parsed = buildLineupSchema(match.field_size).safeParse({ formation, assignments })
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  // Zod không biết participant nào thuộc đội nào — kiểm tra riêng ở đây để
  // chặn form bị chỉnh sửa gán người của đội khác vào sơ đồ đội này.
  const participants = await getMatchParticipants(matchId)
  const teamParticipantIds = new Set(
    participants.filter((p) => p.team === team).map((p) => p.member_id)
  )
  for (const a of parsed.data.assignments) {
    if (a.member_id && !teamParticipantIds.has(a.member_id)) {
      throw new Error('Một cầu thủ được chọn không thuộc đội này')
    }
  }

  const supabase = await createSupabaseServerClient()

  const { error: lineupError } = await supabase
    .from('match_lineups')
    .upsert({ match_id: matchId, team, formation: parsed.data.formation }, { onConflict: 'match_id,team' })
  if (lineupError) throw lineupError

  // Xoá hết vị trí cũ của đội này trước, rồi gán lại theo lần submit này —
  // participant không có trong assignments sẽ về lại "chưa gán" (dự bị),
  // không mồ côi giá trị slot cũ khi đổi sơ đồ.
  const { error: resetError } = await supabase
    .from('match_participants')
    .update({ position_slot: null })
    .eq('match_id', matchId)
    .eq('team', team)
  if (resetError) throw resetError

  for (const a of parsed.data.assignments) {
    if (!a.member_id) continue
    const { error } = await supabase
      .from('match_participants')
      .update({ position_slot: a.slot })
      .eq('match_id', matchId)
      .eq('member_id', a.member_id)
      .eq('team', team)
    if (error) throw error
  }

  revalidatePath(`/admin/tran-dau/${matchId}`)
  revalidatePath(`/tran-dau/${matchId}`)
}
