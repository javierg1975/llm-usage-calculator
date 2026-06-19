import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countTokens } from './tokenization'
import {
  parseSampleTextEntries,
  summarizeSampleText,
} from './sampleText'
import {
  estimateConversationWorkflow,
  type ConversationWorkflowInput,
} from './conversationWorkflow'

/**
 * End-to-end verification of "token calculation from messages" using the REAL
 * tiktoken encoder (the unit tests elsewhere use a `text.length` stub). These
 * tests anchor the actual encoding so a change of model/encoding, a parsing
 * regression, or a change in the aggregation math is caught.
 */

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), '../../samples')
const readSample = (name: string): string =>
  readFileSync(join(samplesDir, name), 'utf8')

describe('countTokens (real o200k_base encoder)', () => {
  // Anchored against `getEncoding('o200k_base')` so the chosen encoding can't
  // silently drift. Update these only if the model/encoding is deliberately changed.
  it.each([
    ['hello', 1],
    ['You are a tutor.', 5],
    ['Explain recursion.', 3],
    ['Hello there, this is a sample prompt.', 9],
    ['Recursion is when a function calls itself.', 9],
    ['yes', 1],
    ['pass', 1],
  ])('counts %j as %i tokens', (text, expected) => {
    expect(countTokens(text)).toBe(expected)
  })

  it('returns zero for empty string without invoking the encoder', () => {
    expect(countTokens('')).toBe(0)
  })

  it('is additive-ish: concatenated text is at least the larger part', () => {
    const a = 'The quarterly earnings report'
    const b = ' was released this morning.'
    expect(countTokens(a + b)).toBeGreaterThanOrEqual(countTokens(a))
    expect(countTokens(a + b)).toBeGreaterThanOrEqual(countTokens(b))
  })
})

describe('message parsing → token aggregation (real encoder)', () => {
  it('averages tokens across newline-delimited messages', () => {
    const raw = 'Explain recursion.\nYou are a tutor.'
    const summary = summarizeSampleText(raw, countTokens)

    expect(summary.entries).toEqual(['Explain recursion.', 'You are a tutor.'])
    expect(summary.count).toBe(2)
    // 3 + 5 anchored above
    expect(summary.totalTokens).toBe(8)
    expect(summary.averageTokens).toBe(4)
  })

  it('counts only message text, not JSON envelope keys/roles', () => {
    const asChat = JSON.stringify([
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: 'Explain recursion.' },
    ])
    const asPlain = 'You are a tutor.\nExplain recursion.'

    // The role/structure must not contribute tokens: both forms tokenize identically.
    expect(summarizeSampleText(asChat, countTokens).totalTokens).toBe(
      summarizeSampleText(asPlain, countTokens).totalTokens,
    )
  })

  it('ignores blank and whitespace-only messages when averaging', () => {
    const summary = summarizeSampleText('hello\n   \n\nhello', countTokens)
    expect(summary.count).toBe(2)
    expect(summary.totalTokens).toBe(2) // 1 + 1
    expect(summary.averageTokens).toBe(1)
  })
})

describe('estimateConversationWorkflow token math (real encoder)', () => {
  // A fully hand-computable scenario. Token counts (anchored above):
  //   user message  "Explain recursion."                         = 3
  //   eval prompt   "You are a tutor."                           = 5
  //   gate decision "yes"                                        = 1
  //   answer prompt "Explain recursion."                         = 3
  //   draft answer  "Recursion is when a function calls itself." = 9
  //   judge prompt  "Hello there, this is a sample prompt."      = 9
  //   judge decision "pass"                                      = 1
  const scenario: ConversationWorkflowInput = {
    includeAssistantOpeningRoundtrip: false,
    openingPromptSamplesText: '',
    openingMessageSamplesText: '',
    userMessageSamplesText: 'Explain recursion.',
    evaluationPromptSamplesText: 'You are a tutor.',
    evaluationDecisionSamplesText: 'yes',
    answerPromptSamplesText: 'Explain recursion.',
    draftAnswerSamplesText: 'Recursion is when a function calls itself.',
    judgePromptSamplesText: 'Hello there, this is a sample prompt.',
    judgeDecisionSamplesText: 'pass',
    engageRate: 0.5,
    judgePassRate: 0.5,
    maxAnswerAttempts: 3,
  }

  it('derives per-sample averages from the real encoder', () => {
    const r = estimateConversationWorkflow(scenario, countTokens)
    expect(r.averageUserMessageTokens).toBe(3)
    expect(r.averageEvaluationPromptTokens).toBe(5)
    expect(r.averageEvaluationDecisionTokens).toBe(1)
    expect(r.averageAnswerPromptTokens).toBe(3)
    expect(r.averageDraftAnswerTokens).toBe(9)
    expect(r.averageJudgePromptTokens).toBe(9)
    expect(r.averageJudgeDecisionTokens).toBe(1)
  })

  it('computes expected call counts from gate + truncated-geometric retries', () => {
    const r = estimateConversationWorkflow(scenario, countTokens)
    // E[attempts] = (1 - 0.5^3) / 0.5 = 1.75
    expect(r.expectedAttemptsWhenEngaged).toBeCloseTo(1.75, 10)
    // engageRate(0.5) * 1.75 = 0.875
    expect(r.expectedAnswerCallsPerConversation).toBeCloseTo(0.875, 10)
    expect(r.expectedJudgeCallsPerConversation).toBeCloseTo(0.875, 10)
    expect(r.expectedEvaluationCallsPerConversation).toBe(1)
    expect(r.expectedOpeningCallsPerConversation).toBe(0)
  })

  it('matches the hand-computed expected input tokens per conversation', () => {
    const r = estimateConversationWorkflow(scenario, countTokens)
    // eval:   1     * (user 3 + evalPrompt 5)            = 8
    // answer: 0.875 * (user 3 + answerPrompt 3)          = 5.25
    // judge:  0.875 * (judgePrompt 9 + user 3 + draft 9) = 18.375
    expect(r.expectedInputTokensPerConversation).toBeCloseTo(31.625, 10)
  })

  it('matches the hand-computed expected output tokens per conversation', () => {
    const r = estimateConversationWorkflow(scenario, countTokens)
    // eval:   1     * gateDecision 1   = 1
    // answer: 0.875 * draftAnswer 9    = 7.875
    // judge:  0.875 * judgeDecision 1  = 0.875
    expect(r.expectedOutputTokensPerConversation).toBeCloseTo(9.75, 10)
  })

  it('zeroes answer/judge contribution when the gate never engages', () => {
    const r = estimateConversationWorkflow(
      { ...scenario, engageRate: 0 },
      countTokens,
    )
    expect(r.expectedAnswerCallsPerConversation).toBe(0)
    expect(r.expectedJudgeCallsPerConversation).toBe(0)
    // Only the (always-run) evaluation roundtrip remains.
    expect(r.expectedInputTokensPerConversation).toBe(8) // user 3 + evalPrompt 5
    expect(r.expectedOutputTokensPerConversation).toBe(1) // gateDecision 1
  })

  it('adds opening-roundtrip tokens for assistant-first flows', () => {
    const base = estimateConversationWorkflow(scenario, countTokens)
    const withOpening = estimateConversationWorkflow(
      {
        ...scenario,
        includeAssistantOpeningRoundtrip: true,
        openingPromptSamplesText: 'You are a tutor.', // 5 input
        openingMessageSamplesText: 'Recursion is when a function calls itself.', // 9 output
      },
      countTokens,
    )
    expect(withOpening.expectedOpeningCallsPerConversation).toBe(1)
    // Opening prompt is input; opening message is output.
    expect(withOpening.expectedInputTokensPerConversation).toBeCloseTo(
      base.expectedInputTokensPerConversation + 5,
      10,
    )
    expect(withOpening.expectedOutputTokensPerConversation).toBeCloseTo(
      base.expectedOutputTokensPerConversation + 9,
      10,
    )
  })

  it('increases expected tokens monotonically with engage rate', () => {
    const low = estimateConversationWorkflow(
      { ...scenario, engageRate: 0.2 },
      countTokens,
    )
    const high = estimateConversationWorkflow(
      { ...scenario, engageRate: 0.9 },
      countTokens,
    )
    expect(high.expectedInputTokensPerConversation).toBeGreaterThan(
      low.expectedInputTokensPerConversation,
    )
    expect(high.expectedOutputTokensPerConversation).toBeGreaterThan(
      low.expectedOutputTokensPerConversation,
    )
  })
})

describe('demo sample files load and produce sane estimates', () => {
  it('parses each sample file into the expected number of entries', () => {
    expect(parseSampleTextEntries(readSample('user-messages.json'))).toHaveLength(6)
    expect(parseSampleTextEntries(readSample('evaluation-prompt.txt'))).toHaveLength(1)
    expect(parseSampleTextEntries(readSample('gate-decisions.json'))).toHaveLength(4)
    expect(parseSampleTextEntries(readSample('answer-prompt.txt'))).toHaveLength(1)
    expect(parseSampleTextEntries(readSample('draft-answers.txt'))).toHaveLength(5)
    expect(parseSampleTextEntries(readSample('judge-prompt.txt'))).toHaveLength(1)
    expect(parseSampleTextEntries(readSample('judge-decisions.json'))).toHaveLength(3)
    expect(parseSampleTextEntries(readSample('opening-prompt.txt'))).toHaveLength(1)
    expect(parseSampleTextEntries(readSample('opening-messages.txt'))).toHaveLength(3)
  })

  it('drives the full user-first workflow estimate end-to-end', () => {
    const r = estimateConversationWorkflow(
      {
        includeAssistantOpeningRoundtrip: false,
        openingPromptSamplesText: '',
        openingMessageSamplesText: '',
        userMessageSamplesText: readSample('user-messages.json'),
        evaluationPromptSamplesText: readSample('evaluation-prompt.txt'),
        evaluationDecisionSamplesText: readSample('gate-decisions.json'),
        answerPromptSamplesText: readSample('answer-prompt.txt'),
        draftAnswerSamplesText: readSample('draft-answers.txt'),
        judgePromptSamplesText: readSample('judge-prompt.txt'),
        judgeDecisionSamplesText: readSample('judge-decisions.json'),
        engageRate: 0.8,
        judgePassRate: 0.85,
        maxAnswerAttempts: 3,
      },
      countTokens,
    )

    expect(r.averageUserMessageTokens).toBeGreaterThan(0)
    expect(r.averageDraftAnswerTokens).toBeGreaterThan(0)
    expect(r.expectedInputTokensPerConversation).toBeGreaterThan(0)
    expect(r.expectedOutputTokensPerConversation).toBeGreaterThan(0)
    // Sanity: an answer's draft is much longer than a one-word gate decision.
    expect(r.averageDraftAnswerTokens).toBeGreaterThan(r.averageJudgeDecisionTokens)
  })

  it('drives the assistant-first workflow estimate end-to-end', () => {
    const r = estimateConversationWorkflow(
      {
        includeAssistantOpeningRoundtrip: true,
        openingPromptSamplesText: readSample('opening-prompt.txt'),
        openingMessageSamplesText: readSample('opening-messages.txt'),
        userMessageSamplesText: readSample('user-messages.json'),
        evaluationPromptSamplesText: readSample('evaluation-prompt.txt'),
        evaluationDecisionSamplesText: readSample('gate-decisions.json'),
        answerPromptSamplesText: readSample('answer-prompt.txt'),
        draftAnswerSamplesText: readSample('draft-answers.txt'),
        judgePromptSamplesText: readSample('judge-prompt.txt'),
        judgeDecisionSamplesText: readSample('judge-decisions.json'),
        engageRate: 0.8,
        judgePassRate: 0.85,
        maxAnswerAttempts: 3,
      },
      countTokens,
    )

    expect(r.expectedOpeningCallsPerConversation).toBe(1)
    expect(r.averageOpeningPromptTokens).toBeGreaterThan(0)
    expect(r.averageOpeningMessageTokens).toBeGreaterThan(0)
  })
})
