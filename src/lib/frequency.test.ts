import { describe, expect, it } from 'vitest'
import { formatFrequencyPhrase, toAnnualFrequency } from './frequency'

describe('toAnnualFrequency', () => {
  it('converts daily values', () => {
    expect(toAnnualFrequency(2, 'day')).toBe(730)
  })

  it('converts weekly values', () => {
    expect(toAnnualFrequency(3, 'week')).toBe(156)
  })

  it('converts monthly values', () => {
    expect(toAnnualFrequency(4, 'month')).toBe(48)
  })

  it('keeps yearly values unchanged', () => {
    expect(toAnnualFrequency(40, 'year')).toBe(40)
  })

  it('throws for invalid values', () => {
    expect(() => toAnnualFrequency(-1, 'month')).toThrow(
      'Frequency value must be a non-negative finite number',
    )
  })
})

describe('formatFrequencyPhrase', () => {
  it('formats readable frequency text', () => {
    expect(formatFrequencyPhrase(5, 'week')).toBe('5 per week')
  })
})
