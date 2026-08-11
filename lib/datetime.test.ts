import { describe, it, expect } from 'vitest'
import { vietnamLocalToIso, formatVietnamDateTime } from './datetime'

describe('vietnamLocalToIso', () => {
  it('treats a datetime-local value as Vietnam time, not UTC', () => {
    expect(vietnamLocalToIso('2026-08-15T17:00')).toBe('2026-08-15T10:00:00.000Z')
  })

  it('accepts a value that includes seconds', () => {
    expect(vietnamLocalToIso('2026-08-15T17:00:30')).toBe('2026-08-15T10:00:30.000Z')
  })

  it('throws on an unparseable value', () => {
    expect(() => vietnamLocalToIso('không phải ngày')).toThrow()
  })
})

describe('formatVietnamDateTime', () => {
  it('renders a UTC instant in Vietnam time regardless of the server timezone', () => {
    expect(formatVietnamDateTime('2026-08-15T10:00:00Z')).toBe('17:00:00 15/8/2026')
  })

  it('rolls over to the next day when the Vietnam offset crosses midnight', () => {
    expect(formatVietnamDateTime('2026-08-15T17:00:00Z')).toBe('00:00:00 16/8/2026')
  })
})
