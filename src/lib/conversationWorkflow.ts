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
}

export type ConversationWorkflowEstimate = {
  averageOpeningPromptTokens: number
  averageOpeningMessageTokens: number
  averageUserMessageTokens: number
  averageEvaluationPromptTokens: number
  averageEvaluationDecisionTokens: number
  averageAnswerPromptTokens: number
  averageDraftAnswerTokens: number
  averageJudgePromptTokens: number
  averageJudgeDecisionTokens: number
  expectedOpeningCallsPerConversation: number
  expectedAttemptsWhenEngaged: number
  expectedEvaluationCallsPerConversation: number
  expectedAnswerCallsPerConversation: number
  expectedJudgeCallsPerConversation: number
  expectedInputTokensPerConversation: number
  expectedOutputTokensPerConversation: number
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

export const estimateConversationWorkflow = (
  input: ConversationWorkflowInput,
  countTokens: TokenCounter,
): ConversationWorkflowEstimate => {
  assertRate('engageRate', input.engageRate)
  assertRate('judgePassRate', input.judgePassRate)
  assertPositiveInteger('maxAnswerAttempts', input.maxAnswerAttempts)

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

  const expectedAttemptsWhenEngaged =
    input.engageRate === 0
      ? 0
      : expectedAttemptsWithCap(input.judgePassRate, input.maxAnswerAttempts)

  const expectedOpeningCallsPerConversation = input.includeAssistantOpeningRoundtrip
    ? 1
    : 0
  const expectedEvaluationCallsPerConversation = 1
  const expectedAnswerCallsPerConversation =
    input.engageRate * expectedAttemptsWhenEngaged
  const expectedJudgeCallsPerConversation =
    input.engageRate * expectedAttemptsWhenEngaged

  const averageOpeningPromptTokens = openingPromptStats.averageTokens
  const averageOpeningMessageTokens = openingMessageStats.averageTokens
  const averageUserMessageTokens = userMessageStats.averageTokens
  const averageEvaluationPromptTokens = evaluationPromptStats.averageTokens
  const averageEvaluationDecisionTokens = evaluationDecisionStats.averageTokens
  const averageAnswerPromptTokens = answerPromptStats.averageTokens
  const averageDraftAnswerTokens = draftAnswerStats.averageTokens
  const averageJudgePromptTokens = judgePromptStats.averageTokens
  const averageJudgeDecisionTokens = judgeDecisionStats.averageTokens

  const expectedInputTokensPerConversation =
    expectedOpeningCallsPerConversation * averageOpeningPromptTokens +
    expectedEvaluationCallsPerConversation *
      (averageUserMessageTokens + averageEvaluationPromptTokens) +
    expectedAnswerCallsPerConversation *
      (averageUserMessageTokens + averageAnswerPromptTokens) +
    expectedJudgeCallsPerConversation *
      (averageJudgePromptTokens +
        averageUserMessageTokens +
        averageDraftAnswerTokens)

  const expectedOutputTokensPerConversation =
    expectedOpeningCallsPerConversation * averageOpeningMessageTokens +
    expectedEvaluationCallsPerConversation * averageEvaluationDecisionTokens +
    expectedAnswerCallsPerConversation * averageDraftAnswerTokens +
    expectedJudgeCallsPerConversation * averageJudgeDecisionTokens

  return {
    averageOpeningPromptTokens,
    averageOpeningMessageTokens,
    averageUserMessageTokens,
    averageEvaluationPromptTokens,
    averageEvaluationDecisionTokens,
    averageAnswerPromptTokens,
    averageDraftAnswerTokens,
    averageJudgePromptTokens,
    averageJudgeDecisionTokens,
    expectedOpeningCallsPerConversation,
    expectedAttemptsWhenEngaged,
    expectedEvaluationCallsPerConversation,
    expectedAnswerCallsPerConversation,
    expectedJudgeCallsPerConversation,
    expectedInputTokensPerConversation,
    expectedOutputTokensPerConversation,
  }
}
