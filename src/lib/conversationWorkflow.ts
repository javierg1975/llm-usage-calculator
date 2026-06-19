import { summarizeSampleText } from './sampleText'

type TokenCounter = (text: string) => number

const assertRate = (name: string, value: number): void => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1`)
  }
}

const assertPositiveInteger = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be an integer >= 1`)
  }
}

type RequiredSampleStats = ReturnType<typeof summarizeSampleText>

const requireSamples = (
  fieldName: string,
  stats: RequiredSampleStats,
): RequiredSampleStats => {
  if (stats.count === 0) {
    throw new Error(`Provide at least one sample for "${fieldName}"`)
  }
  return stats
}

export type ConversationWorkflowInput = {
  includeAssistantOpeningRoundtrip: boolean
  openingPromptSamplesText: string
  openingMessageSamplesText: string
  userMessageSamplesText: string
  evaluationPromptSamplesText: string
  evaluationDecisionSamplesText: string
  answerPromptSamplesText: string
  draftAnswerSamplesText: string
  judgePromptSamplesText: string
  judgeDecisionSamplesText: string
  engageRate: number
  judgePassRate: number
  maxAnswerAttempts: number
  // Multiplier on input tokens to account for transport-level API call
  // failures that are transparently retried (default 1 = no overhead).
  apiInputOverhead?: number
}

// Per-message token averages derived from sample text. These depend only on the
// samples + tokenizer, not on the engagement/retry knobs, so they can be
// computed once and recombined cheaply when the knobs move.
export type FlowAverages = {
  averageOpeningPromptTokens: number
  averageOpeningMessageTokens: number
  averageUserMessageTokens: number
  averageEvaluationPromptTokens: number
  averageEvaluationDecisionTokens: number
  averageAnswerPromptTokens: number
  averageDraftAnswerTokens: number
  averageJudgePromptTokens: number
  averageJudgeDecisionTokens: number
}

export type WorkflowRateParams = {
  includeAssistantOpeningRoundtrip: boolean
  engageRate: number
  judgePassRate: number
  maxAnswerAttempts: number
  apiInputOverhead?: number
}

export type ConversationWorkflowEstimate = FlowAverages & {
  expectedOpeningCallsPerConversation: number
  expectedAttemptsWhenEngaged: number
  expectedEvaluationCallsPerConversation: number
  expectedAnswerCallsPerConversation: number
  expectedJudgeCallsPerConversation: number
  expectedInputTokensPerConversation: number
  expectedOutputTokensPerConversation: number
}

export const EMPTY_FLOW_AVERAGES: FlowAverages = {
  averageOpeningPromptTokens: 0,
  averageOpeningMessageTokens: 0,
  averageUserMessageTokens: 0,
  averageEvaluationPromptTokens: 0,
  averageEvaluationDecisionTokens: 0,
  averageAnswerPromptTokens: 0,
  averageDraftAnswerTokens: 0,
  averageJudgePromptTokens: 0,
  averageJudgeDecisionTokens: 0,
}

export const expectedAttemptsWithCap = (
  passRate: number,
  maxAttempts: number,
): number => {
  assertRate('judgePassRate', passRate)
  assertPositiveInteger('maxAnswerAttempts', maxAttempts)

  if (passRate === 0) {
    return maxAttempts
  }

  const missRate = 1 - passRate
  return (1 - missRate ** maxAttempts) / passRate
}

// Derive per-message token averages from sample text. Validates that the core
// (non-optional) sample buckets are present; throws otherwise.
export const summarizeFlowAverages = (
  input: ConversationWorkflowInput,
  countTokens: TokenCounter,
): FlowAverages => {
  const openingPromptStats = input.includeAssistantOpeningRoundtrip
    ? requireSamples(
        'Opening prompt',
        summarizeSampleText(input.openingPromptSamplesText, countTokens),
      )
    : summarizeSampleText('', countTokens)
  const openingMessageStats = input.includeAssistantOpeningRoundtrip
    ? requireSamples(
        'Opening message',
        summarizeSampleText(input.openingMessageSamplesText, countTokens),
      )
    : summarizeSampleText('', countTokens)
  const userMessageStats = requireSamples(
    'Sample user message',
    summarizeSampleText(input.userMessageSamplesText, countTokens),
  )
  const evaluationPromptStats = requireSamples(
    'Evaluation prompt',
    summarizeSampleText(input.evaluationPromptSamplesText, countTokens),
  )
  const answerPromptStats = requireSamples(
    'Answer prompt',
    summarizeSampleText(input.answerPromptSamplesText, countTokens),
  )
  const draftAnswerStats = requireSamples(
    'Draft answer',
    summarizeSampleText(input.draftAnswerSamplesText, countTokens),
  )
  const judgePromptStats = requireSamples(
    'Judge prompt',
    summarizeSampleText(input.judgePromptSamplesText, countTokens),
  )
  const evaluationDecisionStats = summarizeSampleText(
    input.evaluationDecisionSamplesText,
    countTokens,
  )
  const judgeDecisionStats = summarizeSampleText(
    input.judgeDecisionSamplesText,
    countTokens,
  )

  return {
    averageOpeningPromptTokens: openingPromptStats.averageTokens,
    averageOpeningMessageTokens: openingMessageStats.averageTokens,
    averageUserMessageTokens: userMessageStats.averageTokens,
    averageEvaluationPromptTokens: evaluationPromptStats.averageTokens,
    averageEvaluationDecisionTokens: evaluationDecisionStats.averageTokens,
    averageAnswerPromptTokens: answerPromptStats.averageTokens,
    averageDraftAnswerTokens: draftAnswerStats.averageTokens,
    averageJudgePromptTokens: judgePromptStats.averageTokens,
    averageJudgeDecisionTokens: judgeDecisionStats.averageTokens,
  }
}

// Pure: combine per-message averages with the engagement/retry knobs into
// per-conversation call counts and token totals. No tokenizer needed, so this
// is cheap to re-run on every knob change.
export const combineWorkflowTokens = (
  averages: FlowAverages,
  params: WorkflowRateParams,
): ConversationWorkflowEstimate => {
  assertRate('engageRate', params.engageRate)
  assertRate('judgePassRate', params.judgePassRate)
  assertPositiveInteger('maxAnswerAttempts', params.maxAnswerAttempts)

  const apiInputOverhead = params.apiInputOverhead ?? 1
  if (!Number.isFinite(apiInputOverhead) || apiInputOverhead < 1) {
    throw new Error('apiInputOverhead must be a finite number >= 1')
  }

  const expectedAttemptsWhenEngaged =
    params.engageRate === 0
      ? 0
      : expectedAttemptsWithCap(params.judgePassRate, params.maxAnswerAttempts)

  const expectedOpeningCallsPerConversation = params.includeAssistantOpeningRoundtrip
    ? 1
    : 0
  const expectedEvaluationCallsPerConversation = 1
  const expectedAnswerCallsPerConversation =
    params.engageRate * expectedAttemptsWhenEngaged
  const expectedJudgeCallsPerConversation =
    params.engageRate * expectedAttemptsWhenEngaged

  const baseInputTokens =
    expectedOpeningCallsPerConversation * averages.averageOpeningPromptTokens +
    expectedEvaluationCallsPerConversation *
      (averages.averageUserMessageTokens + averages.averageEvaluationPromptTokens) +
    expectedAnswerCallsPerConversation *
      (averages.averageUserMessageTokens + averages.averageAnswerPromptTokens) +
    expectedJudgeCallsPerConversation *
      (averages.averageJudgePromptTokens +
        averages.averageUserMessageTokens +
        averages.averageDraftAnswerTokens)

  const expectedInputTokensPerConversation = baseInputTokens * apiInputOverhead

  const expectedOutputTokensPerConversation =
    expectedOpeningCallsPerConversation * averages.averageOpeningMessageTokens +
    expectedEvaluationCallsPerConversation * averages.averageEvaluationDecisionTokens +
    expectedAnswerCallsPerConversation * averages.averageDraftAnswerTokens +
    expectedJudgeCallsPerConversation * averages.averageJudgeDecisionTokens

  return {
    ...averages,
    expectedOpeningCallsPerConversation,
    expectedAttemptsWhenEngaged,
    expectedEvaluationCallsPerConversation,
    expectedAnswerCallsPerConversation,
    expectedJudgeCallsPerConversation,
    expectedInputTokensPerConversation,
    expectedOutputTokensPerConversation,
  }
}

export const estimateConversationWorkflow = (
  input: ConversationWorkflowInput,
  countTokens: TokenCounter,
): ConversationWorkflowEstimate =>
  combineWorkflowTokens(summarizeFlowAverages(input, countTokens), input)

// --- Composable flow designer ---------------------------------------------
// A flow is an ordered list of stages. The engine folds over them tracking a
// running "reach probability" (the chance a conversation gets this far): a gate
// scales it down, everything else passes it through. Feeding the engine
// [gate, answerJudge] reproduces the user-first template exactly, and
// [opening, gate, answerJudge] reproduces assistant-first — so the templates are
// just presets that emit a default stage list.

export type StageKind = 'opening' | 'gate' | 'answerJudge' | 'call'

// Per-stage token averages, keyed by slot name (e.g. 'gatePrompt'). Missing
// slots count as zero.
export type StageAverages = Partial<Record<string, number>>

export type FlowStageInput = {
  id: string
  kind: StageKind
  averages: StageAverages
  // Knobs (only the ones relevant to the kind are read).
  engageRate?: number // gate
  judgePassRate?: number // answerJudge
  maxAnswerAttempts?: number // answerJudge
}

export type StageContribution = {
  id: string
  kind: StageKind
  reachProbability: number
  callsPerConversation: number
  inputTokensPerConversation: number
  outputTokensPerConversation: number
}

export type FlowStagesEstimate = {
  expectedInputTokensPerConversation: number
  expectedOutputTokensPerConversation: number
  totalCallsPerConversation: number
  finalReachProbability: number
  stages: StageContribution[]
}

export type FlowStagesParams = {
  userMessageAverageTokens: number
  apiInputOverhead?: number
}

const slot = (averages: StageAverages, key: string): number => averages[key] ?? 0

export const combineFlowStages = (
  stages: FlowStageInput[],
  params: FlowStagesParams,
): FlowStagesEstimate => {
  const userMsg = params.userMessageAverageTokens
  const apiInputOverhead = params.apiInputOverhead ?? 1
  if (!Number.isFinite(apiInputOverhead) || apiInputOverhead < 1) {
    throw new Error('apiInputOverhead must be a finite number >= 1')
  }

  let reach = 1
  let baseInputTokens = 0
  let outputTokens = 0
  let totalCalls = 0
  const contributions: StageContribution[] = []

  for (const stage of stages) {
    const a = stage.averages
    let calls = 0
    let inTok = 0
    let outTok = 0

    switch (stage.kind) {
      case 'opening': {
        calls = reach
        inTok = calls * slot(a, 'openingPrompt')
        outTok = calls * slot(a, 'openingMessage')
        break
      }
      case 'gate': {
        const engageRate = stage.engageRate ?? 0
        assertRate('engageRate', engageRate)
        calls = reach
        inTok = calls * (userMsg + slot(a, 'gatePrompt'))
        outTok = calls * slot(a, 'gateDecision')
        break
      }
      case 'answerJudge': {
        const passRate = stage.judgePassRate ?? 0
        const maxAttempts = stage.maxAnswerAttempts ?? 1
        const attempts = expectedAttemptsWithCap(passRate, maxAttempts)
        const answerCalls = reach * attempts
        const judgeCalls = reach * attempts
        calls = answerCalls + judgeCalls
        inTok =
          answerCalls * (userMsg + slot(a, 'answerPrompt')) +
          judgeCalls * (slot(a, 'judgePrompt') + userMsg + slot(a, 'draftAnswer'))
        outTok =
          answerCalls * slot(a, 'draftAnswer') + judgeCalls * slot(a, 'judgeDecision')
        break
      }
      case 'call': {
        calls = reach
        inTok = calls * (userMsg + slot(a, 'callPrompt'))
        outTok = calls * slot(a, 'callResponse')
        break
      }
    }

    baseInputTokens += inTok
    outputTokens += outTok
    totalCalls += calls
    contributions.push({
      id: stage.id,
      kind: stage.kind,
      reachProbability: reach,
      callsPerConversation: calls,
      inputTokensPerConversation: inTok * apiInputOverhead,
      outputTokensPerConversation: outTok,
    })

    // A gate scales everything downstream by its pass rate.
    if (stage.kind === 'gate') {
      reach = reach * (stage.engageRate ?? 0)
    }
  }

  return {
    expectedInputTokensPerConversation: baseInputTokens * apiInputOverhead,
    expectedOutputTokensPerConversation: outputTokens,
    totalCallsPerConversation: totalCalls,
    finalReachProbability: reach,
    stages: contributions,
  }
}
