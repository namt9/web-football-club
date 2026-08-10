import { describe, it, expect } from 'vitest'
import { memberSchema } from './member'

describe('memberSchema', () => {
  it('accepts a valid member', () => {
    const result = memberSchema.safeParse({
      full_name: 'Nguyễn Văn A',
      jersey_number: 10,
      position: 'FW',
      phone: '0912345678',
      status: 'active',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty full_name', () => {
    const result = memberSchema.safeParse({ full_name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid position', () => {
    const result = memberSchema.safeParse({ full_name: 'A', position: 'XX' })
    expect(result.success).toBe(false)
  })
})
