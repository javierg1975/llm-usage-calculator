import { describe, expect, it } from 'vitest'
import { countTokens } from './tokenization'

describe('countTokens', () => {
  it('returns zero for empty text', () => {
    expect(countTokens('')).toBe(0)
  })

  it('returns deterministic token counts for repeated input', () => {
    const text = 'Hello there, this is a sample prompt.'
    expect(countTokens(text)).toBe(countTokens(text))
  })

  it('returns more tokens for longer content', () => {
    const shortText = 'hello'
    const longText = 'hello hello hello hello hello'
    expect(countTokens(longText)).toBeGreaterThan(countTokens(shortText))
  })
})
