import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Member } from '@/lib/types'

export async function getMembers(): Promise<Member[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('members').select('*').order('full_name')

  if (error) throw error
  return data
}

export async function getMember(id: string): Promise<Member | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('members').select('*').eq('id', id).maybeSingle()

  if (error) throw error
  return data
}
