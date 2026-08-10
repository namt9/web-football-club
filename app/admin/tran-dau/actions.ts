'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { matchSchema } from '@/lib/validations/match'

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
