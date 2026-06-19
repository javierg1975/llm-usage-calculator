import { describe, expect, it } from 'vitest'
import {
  combineFlowStages,
  combineWorkflowTokens,
  EMPTY_FLOW_AVERAGES,
  estimateConversationWorkflow,
  expectedAttemptsWithCap,
  type FlowAverages,
  type FlowStageInput,
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

describe('combineWorkflowTokens', () => {
  const averages: FlowAverages = {
    ...EMPTY_FLOW_AVERAGES,
    averageUserMessageTokens: 100,
    averageEvaluationPromptTokens: 200,
    averageEvaluationDecisionTokens: 10,
    averageAnswerPromptTokens: 400,
    averageDraftAnswerTokens: 250,
    averageJudgePromptTokens: 300,
    averageJudgeDecisionTokens: 15,
  }

  const baseParams = {
    includeAssistantOpeningRoundtrip: false,
    engageRate: 0.8,
    judgePassRate: 0.5,
    maxAnswerAttempts: 3,
  }

  it('scales input tokens by the API overhead but leaves output untouched', () => {
    const base = combineWorkflowTokens(averages, baseParams)
    const withOverhead = combineWorkflowTokens(averages, {
      ...baseParams,
      apiInputOverhead: 1.5,
    })

    expect(withOverhead.expectedInputTokensPerConversation).toBeCloseTo(
      base.expectedInputTokensPerConversation * 1.5,
      8,
    )
    expect(withOverhead.expectedOutputTokensPerConversation).toBeCloseTo(
      base.expectedOutputTokensPerConversation,
      8,
    )
  })

  it('defaults the API overhead to 1 (no change)', () => {
    const withExplicitOne = combineWorkflowTokens(averages, {
      ...baseParams,
      apiInputOverhead: 1,
    })
    const withDefault = combineWorkflowTokens(averages, baseParams)
    expect(withDefault.expectedInputTokensPerConversation).toBeCloseTo(
      withExplicitOne.expectedInputTokensPerConversation,
      8,
    )
  })

  it('returns zero tokens for empty averages', () => {
    const result = combineWorkflowTokens(EMPTY_FLOW_AVERAGES, baseParams)
    expect(result.expectedInputTokensPerConversation).toBe(0)
    expect(result.expectedOutputTokensPerConversation).toBe(0)
  })

  it('throws when the API overhead is below 1', () => {
    expect(() =>
      combineWorkflowTokens(averages, { ...baseParams, apiInputOverhead: 0.5 }),
    ).toThrow('apiInputOverhead must be a finite number >= 1')
  })
})

describe('combineFlowStages', () => {
  const averages: FlowAverages = {
    ...EMPTY_FLOW_AVERAGES,
    averageOpeningPromptTokens: 300,
    averageOpeningMessageTokens: 90,
    averageUserMessageTokens: 100,
    averageEvaluationPromptTokens: 200,
    averageEvaluationDecisionTokens: 10,
    averageAnswerPromptTokens: 400,
    averageDraftAnswerTokens: 250,
    averageJudgePromptTokens: 300,
    averageJudgeDecisionTokens: 15,
  }

  const gateStage: FlowStageInput = {
    id: 'gate',
    kind: 'gate',
    engageRate: 0.8,
    averages: {
      gatePrompt: averages.averageEvaluationPromptTokens,
      gateDecision: averages.averageEvaluationDecisionTokens,
    },
  }

  const answerJudgeStage: FlowStageInput = {
    id: 'aj',
    kind: 'answerJudge',
    judgePassRate: 0.5,
    maxAnswerAttempts: 3,
    averages: {
      answerPrompt: averages.averageAnswerPromptTokens,
      draftAnswer: averages.averageDraftAnswerTokens,
      judgePrompt: averages.averageJudgePromptTokens,
      judgeDecision: averages.averageJudgeDecisionTokens,
    },
  }

  const openingStage: FlowStageInput = {
    id: 'opening',
    kind: 'opening',
    averages: {
      openingPrompt: averages.averageOpeningPromptTokens,
      openingMessage: averages.averageOpeningMessageTokens,
    },
  }

  const params = { userMessageAverageTokens: averages.averageUserMessageTokens }

  it('reproduces the user-first template exactly ([gate, answerJudge])', () => {
    const legacy = combineWorkflowTokens(averages, {
      includeAssistantOpeningRoundtrip: false,
      engageRate: 0.8,
      judgePassRate: 0.5,
      maxAnswerAttempts: 3,
    })
    const staged = combineFlowStages([gateStage, answerJudgeStage], params)

    expect(staged.expectedInputTokensPerConversation).toBeCloseTo(
      legacy.expectedInputTokensPerConversation,
      6,
    )
    expect(staged.expectedOutputTokensPerConversation).toBeCloseTo(
      legacy.expectedOutputTokensPerConversation,
      6,
    )
  })

  it('reproduces the assistant-first template ([opening, gate, answerJudge])', () => {
    const legacy = combineWorkflowTokens(averages, {
      includeAssistantOpeningRoundtrip: true,
      engageRate: 0.8,
      judgePassRate: 0.5,
      maxAnswerAttempts: 3,
    })
    const staged = combineFlowStages(
      [openingStage, gateStage, answerJudgeStage],
      params,
    )

    expect(staged.expectedInputTokensPerConversation).toBeCloseTo(
      legacy.expectedInputTokensPerConversation,
      6,
    )
    expect(staged.expectedOutputTokensPerConversation).toBeCloseTo(
      legacy.expectedOutputTokensPerConversation,
      6,
    )
  })

  it('scales downstream stages by an upstream gate', () => {
    const withGate = combineFlowStages([gateStage, answerJudgeStage], params)
    const withoutGate = combineFlowStages([answerJudgeStage], params)
    // The gate keeps only 80% of conversations engaged, so the answer/judge
    // contribution should be smaller with the gate in front.
    expect(withGate.finalReachProbability).toBeCloseTo(0.8, 8)
    const ajWithGate = withGate.stages.find((s) => s.kind === 'answerJudge')!
    const ajAlone = withoutGate.stages[0]
    expect(ajWithGate.callsPerConversation).toBeCloseTo(
      ajAlone.callsPerConversation * 0.8,
      8,
    )
  })

  it('applies the API overhead to input tokens only', () => {
    const base = combineFlowStages([gateStage, answerJudgeStage], params)
    const withOverhead = combineFlowStages([gateStage, answerJudgeStage], {
      ...params,
      apiInputOverhead: 1.25,
    })
    expect(withOverhead.expectedInputTokensPerConversation).toBeCloseTo(
      base.expectedInputTokensPerConversation * 1.25,
      6,
    )
    expect(withOverhead.expectedOutputTokensPerConversation).toBeCloseTo(
      base.expectedOutputTokensPerConversation,
      6,
    )
  })

  it('returns zero for an empty stage list', () => {
    const result = combineFlowStages([], params)
    expect(result.expectedInputTokensPerConversation).toBe(0)
    expect(result.expectedOutputTokensPerConversation).toBe(0)
    expect(result.totalCallsPerConversation).toBe(0)
    expect(result.finalReachProbability).toBe(1)
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
