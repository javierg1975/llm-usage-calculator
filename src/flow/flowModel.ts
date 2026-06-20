import {
  combineFlowStages,
  expectedAttemptsWithCap,
  type FlowStageInput,
  type FlowStagesEstimate,
  type StageKind,
} from '../lib/conversationWorkflow'
import {
  formatFrequencyPhrase,
  toAnnualFrequency,
  type FrequencyUnit,
} from '../lib/frequency'
import type { WorkloadRowInput } from '../lib/types'
import { decimalFormatter } from '../format'
import { getStageDef } from './stageCatalog'

export type FlowStageDraft = {
  id: string
  kind: StageKind
  engageRatePercent: number
  judgePassRatePercent: number
  maxAnswerAttempts: number
  samples: Record<string, string> // slot key -> sample text
  averages: Record<string, number> // slot key -> average tokens
}

export type FlowPresetId = 'user-first' | 'assistant-first' | 'blank'

export type ConversationFlowDraft = {
  id: string
  label: string
  // The preset the stages came from, or 'custom' once the structure is hand-edited.
  presetId: FlowPresetId | 'custom'
  conversationFrequencyValue: number
  conversationFrequencyUnit: FrequencyUnit
  // Shared user message — the conversation input every gate/answer/judge call sees.
  userMessageSamplesText: string
  userMessageAverage: number
  stages: FlowStageDraft[]
}

export type FlowPreset = {
  id: FlowPresetId
  name: string
  stageKinds: StageKind[]
}

export const FLOW_PRESETS: FlowPreset[] = [
  { id: 'user-first', name: 'User-first conversation', stageKinds: ['gate', 'answerJudge'] },
  {
    id: 'assistant-first',
    name: 'Assistant-first opener',
    stageKinds: ['opening', 'gate', 'answerJudge'],
  },
  { id: 'blank', name: 'Blank canvas (build your own)', stageKinds: [] },
]

export const getPreset = (presetId: FlowPresetId): FlowPreset =>
  FLOW_PRESETS.find((preset) => preset.id === presetId) ?? FLOW_PRESETS[0]

export type FlowFeedback = {
  kind: 'success' | 'error'
  message: string
}

let flowSequence = 1
let stageSequence = 1

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const makeStage = (kind: StageKind): FlowStageDraft => ({
  id: `stage-${stageSequence += 1}`,
  kind,
  engageRatePercent: 80,
  judgePassRatePercent: 85,
  maxAnswerAttempts: 3,
  samples: {},
  averages: { ...getStageDef(kind).defaultAverages },
})

export const createFlowFromPreset = (
  presetId: FlowPresetId,
  label = 'Core question-answer flow',
): ConversationFlowDraft => ({
  id: `flow-${flowSequence += 1}`,
  label,
  presetId,
  conversationFrequencyValue: 24,
  conversationFrequencyUnit: 'year',
  userMessageSamplesText: '',
  userMessageAverage: 120,
  stages: getPreset(presetId).stageKinds.map(makeStage),
})

const stageToInput = (stage: FlowStageDraft): FlowStageInput => ({
  id: stage.id,
  kind: stage.kind,
  averages: stage.averages,
  engageRate: clamp(stage.engageRatePercent, 0, 100) / 100,
  judgePassRate: clamp(stage.judgePassRatePercent, 0, 100) / 100,
  maxAnswerAttempts: Math.max(1, Math.floor(stage.maxAnswerAttempts || 1)),
})

// Recombine stored averages with the live knobs. Pure + cheap, so it runs on
// every render and the rate knobs update the budget instantly.
export const deriveFlow = (
  flow: ConversationFlowDraft,
  apiInputOverhead: number,
): FlowStagesEstimate =>
  combineFlowStages(flow.stages.map(stageToInput), {
    userMessageAverageTokens: flow.userMessageAverage,
    apiInputOverhead,
  })

export const toWorkload = (
  flow: ConversationFlowDraft,
  apiInputOverhead: number,
): WorkloadRowInput => {
  const estimate = deriveFlow(flow, apiInputOverhead)
  return {
    id: flow.id,
    label: flow.label,
    promptsPerConversation: 1,
    averagePromptTokens: estimate.expectedInputTokensPerConversation,
    userMessagesPerConversation: 0,
    averageUserMessageTokens: 0,
    llmResponsesPerConversation: 1,
    averageLlmResponseTokens: estimate.expectedOutputTokensPerConversation,
    conversationsPerUserPerYear: toAnnualFrequency(
      flow.conversationFrequencyValue,
      flow.conversationFrequencyUnit,
    ),
  }
}

// Expected extra API attempts per call from transport-level failures that get
// retried — a small multiplier (~1.01 at 99%/3) applied to input tokens.
export const apiInputOverheadFrom = (
  successRatePercent: number,
  maxAttempts: number,
): number =>
  expectedAttemptsWithCap(
    clamp(successRatePercent, 0, 100) / 100,
    Math.max(1, Math.floor(maxAttempts || 1)),
  )

export const flowCadenceSummary = (flow: ConversationFlowDraft): string => {
  const annualConversations = toAnnualFrequency(
    flow.conversationFrequencyValue,
    flow.conversationFrequencyUnit,
  )
  return `${flow.label}: ${formatFrequencyPhrase(
    flow.conversationFrequencyValue,
    flow.conversationFrequencyUnit,
  )} (~${decimalFormatter.format(annualConversations)} per year per user)`
}
