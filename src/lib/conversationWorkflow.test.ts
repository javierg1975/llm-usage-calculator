import { describe, expect, it } from 'vitest'
import {
  estimateConversationWorkflow,
  expectedAttemptsWithCap,
} from './conversationWorkflow'

const stubCountTokens = (text: string): number => text.length

describe('expectedAttemptsWithCap', () => {
  it('returns max attempts when pass rate is zero', () => {
    expect(expectedAttemptsWithCap(0, 4)).toBe(4)
  })

  it('returns one when pass rate is one', () => {
    expect(expectedAttemptsWithCap(1, 6)).toBe(1)
  })

  it('handles truncated geometric expectation', () => {
    const value = expectedAttemptsWithCap(0.5, 3)
    expect(value).toBeCloseTo(1.75, 8)
  })

  it('throws for invalid pass rates', () => {
    expect(() => expectedAttemptsWithCap(-0.2, 3)).toThrow(
      'judgePassRate must be between 0 and 1',
    )
    expect(() => expectedAttemptsWithCap(1.2, 3)).toThrow(
      'judgePassRate must be between 0 and 1',
    )
  })

  it('throws for invalid max attempts', () => {
    expect(() => expectedAttemptsWithCap(0.5, 0)).toThrow(
      'maxAnswerAttempts must be an integer >= 1',
    )
    expect(() => expectedAttemptsWithCap(0.5, 1.5)).toThrow(
      'maxAnswerAttempts must be an integer >= 1',
    )
  })
})

describe('estimateConversationWorkflow', () => {
  const baseInput = {
    includeAssistantOpeningRoundtrip: false,
    openingPromptSamplesText: '',
    openingMessageSamplesText: '',
    userMessageSamplesText: 'hello there',
    evaluationPromptSamplesText: 'is this safe and in scope?',
    evaluationDecisionSamplesText: 'yes',
    answerPromptSamplesText: 'answer the user question',
    draftAnswerSamplesText: 'this is a candidate answer',
    judgePromptSamplesText: 'grade correctness and policy',
    judgeDecisionSamplesText: 'pass',
    engageRate: 0.8,
    judgePassRate: 0.5,
    maxAnswerAttempts: 3,
  }

  it('estimates call counts and token totals from samples', () => {
    const result = estimateConversationWorkflow(baseInput, stubCountTokens)
    expect(result.expectedEvaluationCallsPerConversation).toBe(1)
    expect(result.expectedAttemptsWhenEngaged).toBeCloseTo(1.75, 8)
    expect(result.expectedAnswerCallsPerConversation).toBeCloseTo(1.4, 8)
    expect(result.expectedJudgeCallsPerConversation).toBeCloseTo(1.4, 8)
    expect(result.expectedInputTokensPerConversation).toBeGreaterThan(0)
    expect(result.expectedOutputTokensPerConversation).toBeGreaterThan(0)
    expect(result.expectedOpeningCallsPerConversation).toBe(0)
  })

  it('supports JSON sample payloads', () => {
    const result = estimateConversationWorkflow(
      {
        ...baseInput,
        userMessageSamplesText: JSON.stringify([
          { role: 'user', content: 'first question' },
          { role: 'user', content: 'second question' },
        ]),
      },
      stubCountTokens,
    )
    expect(result.averageUserMessageTokens).toBe(14.5)
  })

  it('allows optional decision samples to be omitted', () => {
    const result = estimateConversationWorkflow(
      {
        ...baseInput,
        evaluationDecisionSamplesText: '',
        judgeDecisionSamplesText: '',
      },
      stubCountTokens,
    )
    expect(result.averageEvaluationDecisionTokens).toBe(0)
    expect(result.averageJudgeDecisionTokens).toBe(0)
  })

  it('requires core sample buckets', () => {
    expect(() =>
      estimateConversationWorkflow(
        {
          ...baseInput,
          answerPromptSamplesText: '',
        },
        stubCountTokens,
      ),
    ).toThrow('Provide at least one sample for "Answer prompt"')
  })

  it('throws for invalid engage rate', () => {
    expect(() =>
      estimateConversationWorkflow(
        {
          ...baseInput,
          engageRate: 1.1,
        },
        stubCountTokens,
      ),
    ).toThrow('engageRate must be between 0 and 1')
  })

  it('returns zero answer/judge calls when engage rate is zero', () => {
    const result = estimateConversationWorkflow(
      {
        ...baseInput,
        engageRate: 0,
      },
      stubCountTokens,
    )
    expect(result.expectedAnswerCallsPerConversation).toBe(0)
    expect(result.expectedJudgeCallsPerConversation).toBe(0)
    expect(result.expectedAttemptsWhenEngaged).toBe(0)
  })

  it('adds an opening roundtrip for assistant-first flows', () => {
    const result = estimateConversationWorkflow(
      {
        ...baseInput,
        includeAssistantOpeningRoundtrip: true,
        openingPromptSamplesText: 'generate the opening outreach',
        openingMessageSamplesText: 'hello, can you share details?',
      },
      stubCountTokens,
    )
    expect(result.expectedOpeningCallsPerConversation).toBe(1)
    expect(result.averageOpeningPromptTokens).toBe(29)
    expect(result.averageOpeningMessageTokens).toBe(29)
    expect(result.expectedInputTokensPerConversation).toBeGreaterThan(29)
    expect(result.expectedOutputTokensPerConversation).toBeGreaterThan(29)
  })

  it('requires opening samples when assistant-first is enabled', () => {
    expect(() =>
      estimateConversationWorkflow(
        {
          ...baseInput,
          includeAssistantOpeningRoundtrip: true,
          openingPromptSamplesText: '',
          openingMessageSamplesText: '',
        },
        stubCountTokens,
      ),
    ).toThrow('Provide at least one sample for "Opening prompt"')
  })
})
