import { describe, expect, it } from 'vitest'
import {
  deriveMetricsFromSamples,
  parseSampleTextEntries,
  summarizeSampleText,
} from './sampleText'

const stubCountTokens = (text: string): number => text.length

describe('parseSampleTextEntries', () => {
  it('parses newline-delimited text entries', () => {
    expect(parseSampleTextEntries('one\n\ntwo\n three  ')).toEqual([
      'one',
      'two',
      'three',
    ])
  })

  it('parses JSON arrays of strings', () => {
    const raw = JSON.stringify(['hello', 'world'])
    expect(parseSampleTextEntries(raw)).toEqual(['hello', 'world'])
  })

  it('parses JSON chat message arrays', () => {
    const raw = JSON.stringify([
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: 'Explain recursion.' },
      { role: 'assistant', content: 'Recursion is...' },
    ])
    expect(parseSampleTextEntries(raw)).toEqual([
      'You are a tutor.',
      'Explain recursion.',
      'Recursion is...',
    ])
  })

  it('parses nested JSON structures', () => {
    const raw = JSON.stringify({
      prompts: [{ text: 'Prompt A' }, { text: 'Prompt B' }],
      messages: [{ user: 'Question' }, { assistant: 'Answer' }],
    })
    expect(parseSampleTextEntries(raw)).toEqual([
      'Prompt A',
      'Prompt B',
      'Question',
      'Answer',
    ])
  })

  it('returns empty entries for empty text', () => {
    expect(parseSampleTextEntries('   ')).toEqual([])
  })
})

describe('summarizeSampleText', () => {
  it('returns count, token total, and average', () => {
    const summary = summarizeSampleText('abc\ndefg', stubCountTokens)
    expect(summary.entries).toEqual(['abc', 'defg'])
    expect(summary.count).toBe(2)
    expect(summary.totalTokens).toBe(7)
    expect(summary.averageTokens).toBe(3.5)
  })

  it('returns zero average for empty input', () => {
    const summary = summarizeSampleText('', stubCountTokens)
    expect(summary.count).toBe(0)
    expect(summary.totalTokens).toBe(0)
    expect(summary.averageTokens).toBe(0)
  })
})

describe('deriveMetricsFromSamples', () => {
  it('derives counts and averages from supplied samples', () => {
    const metrics = deriveMetricsFromSamples(
      'hello\nworld',
      'short\nmuch longer',
      'response',
      stubCountTokens,
    )
    expect(metrics.promptsPerConversation).toBe(2)
    expect(metrics.averagePromptTokens).toBe(5)
    expect(metrics.userMessagesPerConversation).toBe(2)
    expect(metrics.averageUserMessageTokens).toBe(8)
    expect(metrics.llmResponsesPerConversation).toBe(1)
    expect(metrics.averageLlmResponseTokens).toBe(8)
  })

  it('supports JSON payloads as samples', () => {
    const metrics = deriveMetricsFromSamples(
      JSON.stringify([{ content: 'first prompt' }, { content: 'second prompt' }]),
      'user',
      'assistant',
      stubCountTokens,
    )
    expect(metrics.promptsPerConversation).toBe(2)
    expect(metrics.averagePromptTokens).toBe(12.5)
  })

  it('throws when all sample buckets are empty', () => {
    expect(() =>
      deriveMetricsFromSamples('', '  ', '\n', stubCountTokens),
    ).toThrow('No sample text found.')
  })
})
