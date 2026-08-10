'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { memberSchema } from '@/lib/validations/member'

export async function createMember(formData: FormData) {
  const parsed = memberSchema.safeParse({
    full_name: formData.get('full_name'),
    jersey_number: formData.get('jersey_number') || null,
    position: formData.get('position') || null,
    phone: formData.get('phone') || null,
    status: formData.get('status') || 'active',
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('members').insert(parsed.data)
  if (error) throw error

  revalidatePath('/admin/thanh-vien')
  revalidatePath('/thanh-vien')
  redirect('/admin/thanh-vien')
}

export async function updateMember(id: string, formData: FormData) {
  const parsed = memberSchema.safeParse({
    full_name: formData.get('full_name'),
    jersey_number: formData.get('jersey_number') || null,
    position: formData.get('position') || null,
    phone: formData.get('phone') || null,
    status: formData.get('status') || 'active',
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(', '))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('members').update(parsed.data).eq('id', id)
  if (error) throw error

  revalidatePath('/admin/thanh-vien')
  revalidatePath('/thanh-vien')
  redirect('/admin/thanh-vien')
}

export async function deleteMember(id: string) {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('members').delete().eq('id', id)
  if (error) throw error

  revalidatePath('/admin/thanh-vien')
  revalidatePath('/thanh-vien')
}
