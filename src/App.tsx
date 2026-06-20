import { Fragment, useMemo, useState, type ChangeEvent } from 'react'
import './App.css'
import {
  calculateAnnualBudget,
  type AnnualBudgetResult,
} from './lib/calculator'
import {
  combineFlowStages,
  expectedAttemptsWithCap,
  type FlowStageInput,
  type FlowStagesEstimate,
  type StageKind,
} from './lib/conversationWorkflow'
import {
  FREQUENCY_UNITS,
  formatFrequencyPhrase,
  toAnnualFrequency,
  type FrequencyUnit,
} from './lib/frequency'
import { ENGAGEMENT_DISTRIBUTIONS } from './lib/distributions'
import { AZURE_DATA_ZONE_MODELS } from './lib/models'
import { parseSampleTextEntries, summarizeSampleText } from './lib/sampleText'
import type { EngagementSegment, WorkloadRowInput } from './lib/types'

const tokenFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})
const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})
const decimalFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// --- Stage component palette ----------------------------------------------
// Each stage kind declares its rate knobs and sample slots. Slot keys match the
// names the engine's combineFlowStages reads (gatePrompt, draftAnswer, …).

type StageKnobField = 'engageRatePercent' | 'judgePassRatePercent' | 'maxAnswerAttempts'

type StageKnobDef = {
  field: StageKnobField
  label: string
  suffix?: string
  min: number
  max?: number
  step: number
}

type StageSlotDef = {
  key: string
  label: string
  placeholder: string
  optional?: boolean
}

type StageDef = {
  kind: StageKind
  name: string
  caption: string
  iconPath: string
  knobs: StageKnobDef[]
  slots: StageSlotDef[]
  // Seed averages so a freshly added stage yields a sensible estimate before
  // any samples are pasted. Overwritten by "Estimate workflow".
  defaultAverages: Record<string, number>
}

const ENGAGE_KNOB: StageKnobDef = {
  field: 'engageRatePercent',
  label: 'Engage rate after gate',
  suffix: '%',
  min: 0,
  max: 100,
  step: 0.1,
}
const PASS_KNOB: StageKnobDef = {
  field: 'judgePassRatePercent',
  label: 'Judge pass rate per attempt',
  suffix: '%',
  min: 0,
  max: 100,
  step: 0.1,
}
const ATTEMPTS_KNOB: StageKnobDef = {
  field: 'maxAnswerAttempts',
  label: 'Max answer attempts',
  min: 1,
  step: 1,
}

const STAGE_DEFS: Record<StageKind, StageDef> = {
  opening: {
    kind: 'opening',
    name: 'Opening',
    caption: 'Assistant sends the first message',
    iconPath:
      'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
    knobs: [],
    slots: [
      {
        key: 'openingPrompt',
        label: 'Opening prompt (template)',
        placeholder: 'Prompt used to generate the initial outbound message.',
      },
      {
        key: 'openingMessage',
        label: 'Opening message',
        placeholder: 'Initial outbound message sample(s) sent before the user replies.',
      },
    ],
    defaultAverages: { openingPrompt: 300, openingMessage: 90 },
  },
  gate: {
    kind: 'gate',
    name: 'Gate',
    caption: 'Decide whether to engage (scales everything downstream)',
    iconPath:
      'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z',
    knobs: [ENGAGE_KNOB],
    slots: [
      {
        key: 'gatePrompt',
        label: 'Gate prompt (template only)',
        placeholder:
          'Prompt scaffolding that decides whether to engage. Leave out the user message — it is counted separately.',
      },
      {
        key: 'gateDecision',
        label: 'Gate decision output',
        placeholder: 'Optional examples like yes/no or classifier JSON.',
        optional: true,
      },
    ],
    defaultAverages: { gatePrompt: 220, gateDecision: 8 },
  },
  answerJudge: {
    kind: 'answerJudge',
    name: 'Answer → Judge',
    caption: 'Draft an answer, judge it, retry until it passes',
    iconPath:
      'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
    knobs: [PASS_KNOB, ATTEMPTS_KNOB],
    slots: [
      {
        key: 'answerPrompt',
        label: 'Answer prompt (template only)',
        placeholder:
          'Prompt scaffolding used to answer. Leave out the user message — it is counted separately.',
      },
      {
        key: 'draftAnswer',
        label: 'Draft LLM answer',
        placeholder: 'Candidate answers from the model.',
      },
      {
        key: 'judgePrompt',
        label: 'Judge prompt (template only)',
        placeholder:
          'LLM-as-a-judge scaffolding. Leave out the answer/message — they are counted separately.',
      },
      {
        key: 'judgeDecision',
        label: 'Judge decision output',
        placeholder: 'Optional pass/fail outputs or score JSON.',
        optional: true,
      },
    ],
    defaultAverages: {
      answerPrompt: 520,
      draftAnswer: 260,
      judgePrompt: 340,
      judgeDecision: 14,
    },
  },
  call: {
    kind: 'call',
    name: 'LLM call',
    caption: 'A generic single call (prompt → response)',
    iconPath:
      'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    knobs: [],
    slots: [
      {
        key: 'callPrompt',
        label: 'Prompt (template only)',
        placeholder:
          'Prompt scaffolding for this call. Leave out the user message — it is counted separately.',
      },
      {
        key: 'callResponse',
        label: 'Response output',
        placeholder: 'Sample model responses for this call.',
      },
    ],
    defaultAverages: { callPrompt: 300, callResponse: 200 },
  },
}

const STAGE_KINDS: StageKind[] = ['opening', 'gate', 'answerJudge', 'call']

const getStageDef = (kind: StageKind): StageDef => STAGE_DEFS[kind]

type FlowStageDraft = {
  id: string
  kind: StageKind
  engageRatePercent: number
  judgePassRatePercent: number
  maxAnswerAttempts: number
  samples: Record<string, string> // slot key -> sample text
  averages: Record<string, number> // slot key -> average tokens
}

type ConversationFlowDraft = {
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

type FlowPresetId = 'user-first' | 'assistant-first' | 'blank'

type FlowPreset = {
  id: FlowPresetId
  name: string
  stageKinds: StageKind[]
}

const FLOW_PRESETS: FlowPreset[] = [
  { id: 'user-first', name: 'User-first conversation', stageKinds: ['gate', 'answerJudge'] },
  {
    id: 'assistant-first',
    name: 'Assistant-first opener',
    stageKinds: ['opening', 'gate', 'answerJudge'],
  },
  { id: 'blank', name: 'Blank canvas (build your own)', stageKinds: [] },
]

const getPreset = (presetId: FlowPresetId): FlowPreset =>
  FLOW_PRESETS.find((preset) => preset.id === presetId) ?? FLOW_PRESETS[0]

type FlowFeedback = {
  kind: 'success' | 'error'
  message: string
}

let flowSequence = 1
let stageSequence = 1

const makeStage = (kind: StageKind): FlowStageDraft => ({
  id: `stage-${stageSequence += 1}`,
  kind,
  engageRatePercent: 80,
  judgePassRatePercent: 85,
  maxAnswerAttempts: 3,
  samples: {},
  averages: { ...getStageDef(kind).defaultAverages },
})

const createFlowFromPreset = (
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

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const formatTokens = (value: number): string => tokenFormatter.format(Math.round(value))

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
const deriveFlow = (
  flow: ConversationFlowDraft,
  apiInputOverhead: number,
): FlowStagesEstimate =>
  combineFlowStages(flow.stages.map(stageToInput), {
    userMessageAverageTokens: flow.userMessageAverage,
    apiInputOverhead,
  })

const toWorkload = (
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
const apiInputOverheadFrom = (successRatePercent: number, maxAttempts: number): number =>
  expectedAttemptsWithCap(
    clamp(successRatePercent, 0, 100) / 100,
    Math.max(1, Math.floor(maxAttempts || 1)),
  )

const flowCadenceSummary = (flow: ConversationFlowDraft): string => {
  const annualConversations = toAnnualFrequency(
    flow.conversationFrequencyValue,
    flow.conversationFrequencyUnit,
  )
  return `${flow.label}: ${formatFrequencyPhrase(
    flow.conversationFrequencyValue,
    flow.conversationFrequencyUnit,
  )} (~${decimalFormatter.format(annualConversations)} per year per user)`
}

// A mini distribution histogram: each segment is a bar whose width is the user
// share and whose height is the engagement multiplier (sqrt-scaled so the big
// outliers don't flatten the rest). Bar area ≈ that segment's share of tokens.
const SPARK_W = 240
const SPARK_H = 88
const SPARK_PAD = { top: 10, right: 8, bottom: 8, left: 8 }

const DistributionSparkline = ({
  segments,
}: {
  segments: EngagementSegment[]
}) => {
  const innerW = SPARK_W - SPARK_PAD.left - SPARK_PAD.right
  const innerH = SPARK_H - SPARK_PAD.top - SPARK_PAD.bottom
  const maxMultiplier = Math.max(...segments.map((segment) => segment.multiplier), 1)
  const yScale = (multiplier: number): number =>
    Math.sqrt(multiplier / maxMultiplier) * innerH
  const baseY = SPARK_PAD.top + innerH
  const baselineY = baseY - yScale(1)
  const gap = 2.5

  const bars = segments.map((segment, index) => {
    const startShare = segments
      .slice(0, index)
      .reduce((sum, prior) => sum + prior.share, 0)
    const x = SPARK_PAD.left + startShare * innerW
    const width = Math.max(segment.share * innerW - gap, 1.5)
    const height = yScale(segment.multiplier)
    return { segment, x, y: baseY - height, width, height }
  })

  return (
    <svg
      className="dist-spark"
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      role="img"
      aria-label="Engagement distribution: bar width is user share, bar height is engagement multiplier"
    >
      <line
        className="dist-spark-baseline"
        x1={SPARK_PAD.left}
        x2={SPARK_W - SPARK_PAD.right}
        y1={baselineY}
        y2={baselineY}
      />
      <text className="dist-spark-baseline-label" x={SPARK_W - SPARK_PAD.right} y={baselineY - 3}>
        1×
      </text>
      {bars.map((bar) => (
        <rect
          key={bar.segment.id}
          className="dist-spark-bar"
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          rx={1.5}
          fillOpacity={0.45 + 0.55 * Math.sqrt(bar.segment.multiplier / maxMultiplier)}
        >
          <title>
            {`${bar.segment.label}: ${Math.round(bar.segment.share * 100)}% of users · ${bar.segment.multiplier}× engagement`}
          </title>
        </rect>
      ))}
    </svg>
  )
}

function App() {
  const [selectedModelId, setSelectedModelId] = useState(
    AZURE_DATA_ZONE_MODELS[0].id,
  )
  const [selectedDistributionId, setSelectedDistributionId] = useState(
    ENGAGEMENT_DISTRIBUTIONS[0].id,
  )
  const [annualUsers, setAnnualUsers] = useState(10000)
  // Global transport-level API reliability — applied to input tokens across all flows.
  const [apiSuccessRatePercent, setApiSuccessRatePercent] = useState(99)
  const [apiMaxAttempts, setApiMaxAttempts] = useState(3)
  const [newFlowPresetId, setNewFlowPresetId] =
    useState<FlowPresetId>('user-first')
  const [flows, setFlows] = useState<ConversationFlowDraft[]>([
    createFlowFromPreset('user-first'),
  ])
  const [flowFeedback, setFlowFeedback] = useState<
    Record<string, FlowFeedback | undefined>
  >({})

  // Accordion state: track which flows are collapsed (default true/expanded)
  const [collapsedFlows, setCollapsedFlows] = useState<Record<string, boolean>>({})

  const apiInputOverhead = useMemo(
    () => apiInputOverheadFrom(apiSuccessRatePercent, apiMaxAttempts),
    [apiSuccessRatePercent, apiMaxAttempts],
  )

  const selectedModel = useMemo(
    () =>
      AZURE_DATA_ZONE_MODELS.find((model) => model.id === selectedModelId) ??
      AZURE_DATA_ZONE_MODELS[0],
    [selectedModelId],
  )
  const selectedDistribution = useMemo(
    () =>
      ENGAGEMENT_DISTRIBUTIONS.find(
        (distribution) => distribution.id === selectedDistributionId,
      ) ?? ENGAGEMENT_DISTRIBUTIONS[0],
    [selectedDistributionId],
  )

  const budgetResult: AnnualBudgetResult = useMemo(
    () =>
      calculateAnnualBudget({
        annualUsers,
        model: selectedModel,
        distribution: selectedDistribution,
        workloads: flows.map((flow) => toWorkload(flow, apiInputOverhead)),
      }),
    [annualUsers, apiInputOverhead, flows, selectedDistribution, selectedModel],
  )

  const annualConversationsPerUser = useMemo(
    () =>
      flows.reduce(
        (sum, flow) =>
          sum + toAnnualFrequency(flow.conversationFrequencyValue, flow.conversationFrequencyUnit),
        0,
      ),
    [flows],
  )

  const updateFlow = (
    flowId: string,
    updater: (flow: ConversationFlowDraft) => ConversationFlowDraft,
  ): void => {
    setFlows((currentFlows) =>
      currentFlows.map((flow) => (flow.id === flowId ? updater(flow) : flow)),
    )
  }

  const updateStage = (
    flowId: string,
    stageId: string,
    updater: (stage: FlowStageDraft) => FlowStageDraft,
  ): void => {
    updateFlow(flowId, (flow) => ({
      ...flow,
      stages: flow.stages.map((stage) =>
        stage.id === stageId ? updater(stage) : stage,
      ),
    }))
  }

  const handleFlowFrequencyValueChange = (flowId: string, value: number): void => {
    const normalized = Number.isFinite(value) ? Math.max(0, value) : 0
    updateFlow(flowId, (flow) => ({ ...flow, conversationFrequencyValue: normalized }))
  }

  const handleFlowFrequencyUnitChange = (
    flowId: string,
    value: FrequencyUnit,
  ): void => {
    updateFlow(flowId, (flow) => ({ ...flow, conversationFrequencyUnit: value }))
  }

  const handleFlowLabelChange = (flowId: string, label: string): void => {
    updateFlow(flowId, (flow) => ({ ...flow, label }))
  }

  const handleUserMessageChange = (flowId: string, value: string): void => {
    updateFlow(flowId, (flow) => ({ ...flow, userMessageSamplesText: value }))
  }

  const handleStageKnobChange = (
    flowId: string,
    stageId: string,
    field: StageKnobField,
    value: number,
  ): void => {
    const normalized = Number.isFinite(value) ? value : 0
    updateStage(flowId, stageId, (stage) =>
      field === 'maxAnswerAttempts'
        ? { ...stage, maxAnswerAttempts: Math.max(1, Math.floor(normalized || 1)) }
        : { ...stage, [field]: clamp(normalized, 0, 100) },
    )
  }

  const handleStageSampleChange = (
    flowId: string,
    stageId: string,
    slotKey: string,
    value: string,
  ): void => {
    updateStage(flowId, stageId, (stage) => ({
      ...stage,
      samples: { ...stage.samples, [slotKey]: value },
    }))
  }

  const applyPreset = (flowId: string, presetId: FlowPresetId): void => {
    updateFlow(flowId, (flow) => ({
      ...flow,
      presetId,
      stages: getPreset(presetId).stageKinds.map(makeStage),
    }))
  }

  const addStage = (flowId: string, kind: StageKind): void => {
    updateFlow(flowId, (flow) => ({
      ...flow,
      presetId: 'custom',
      stages: [...flow.stages, makeStage(kind)],
    }))
  }

  const removeStage = (flowId: string, stageId: string): void => {
    updateFlow(flowId, (flow) => ({
      ...flow,
      presetId: 'custom',
      stages: flow.stages.filter((stage) => stage.id !== stageId),
    }))
  }

  const moveStage = (flowId: string, stageId: string, direction: -1 | 1): void => {
    updateFlow(flowId, (flow) => {
      const index = flow.stages.findIndex((stage) => stage.id === stageId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= flow.stages.length) {
        return flow
      }
      const stages = [...flow.stages]
      ;[stages[index], stages[target]] = [stages[target], stages[index]]
      return { ...flow, presetId: 'custom', stages }
    })
  }

  const estimateFlowFromSamples = async (flowId: string): Promise<void> => {
    const flow = flows.find((entry) => entry.id === flowId)
    if (!flow) {
      return
    }

    try {
      const { countTokens } = await import('./lib/tokenization')
      const avgOf = (text: string): number =>
        summarizeSampleText(text, countTokens).averageTokens
      const userMessageAverage = avgOf(flow.userMessageSamplesText)
      const stages = flow.stages.map((stage) => {
        const averages: Record<string, number> = {}
        for (const slotDef of getStageDef(stage.kind).slots) {
          averages[slotDef.key] = avgOf(stage.samples[slotDef.key] ?? '')
        }
        return { ...stage, averages }
      })
      updateFlow(flowId, (entry) => ({ ...entry, userMessageAverage, stages }))
      setFlowFeedback((currentFeedback) => ({
        ...currentFeedback,
        [flowId]: {
          kind: 'success',
          message:
            'Token averages updated from sample text. Rate knobs now scale the estimate live.',
        },
      }))
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to estimate this workflow from samples.'
      setFlowFeedback((currentFeedback) => ({
        ...currentFeedback,
        [flowId]: { kind: 'error', message },
      }))
    }
  }

  const loadFileInto = async (
    flowId: string,
    event: ChangeEvent<HTMLInputElement>,
    apply: (contents: string) => void,
  ): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    try {
      const contents = await file.text()
      apply(contents)
      setFlowFeedback((currentFeedback) => ({
        ...currentFeedback,
        [flowId]: {
          kind: 'success',
          message: `Loaded ${file.name}. Click "Estimate workflow" to apply.`,
        },
      }))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to read the uploaded file.'
      setFlowFeedback((currentFeedback) => ({
        ...currentFeedback,
        [flowId]: { kind: 'error', message },
      }))
    } finally {
      event.target.value = ''
    }
  }

  const addFlow = (): void => {
    const preset = getPreset(newFlowPresetId)
    setFlows((currentFlows) => [
      ...currentFlows,
      createFlowFromPreset(newFlowPresetId, `${preset.name} ${currentFlows.length + 1}`),
    ])
  }

  const removeFlow = (flowId: string): void => {
    setFlows((currentFlows) =>
      currentFlows.length <= 1
        ? currentFlows
        : currentFlows.filter((flow) => flow.id !== flowId),
    )
    setFlowFeedback((currentFeedback) => {
      const nextFeedback = { ...currentFeedback }
      delete nextFeedback[flowId]
      return nextFeedback
    })
  }

  const toggleCollapseFlow = (flowId: string) => {
    setCollapsedFlows((prev) => ({
      ...prev,
      [flowId]: !prev[flowId],
    }))
  }

  const distributionBreakdown = selectedDistribution.segments
    .map(
      (segment) =>
        `${percentFormatter.format(segment.share)} ${segment.label} (${decimalFormatter.format(
          segment.multiplier,
        )}x)`,
    )
    .join(', ')

  return (
    <main className="app">
      <header className="header glassmorphic">
        <div className="header-logo">
          <svg className="header-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 11h.01M12 7h.01M15 11h.01M15 7h.01M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
          </svg>
          <div>
            <h1>Azure OpenAI Budget Estimator</h1>
            <p>
              Estimate annual Azure OpenAI spend using <strong>Data Zone</strong> prices and expected conversation workflows.
            </p>
          </div>
        </div>
        <div className="header-meta">
          <p className="muted small">Models standard user-first and assistant-first openers.</p>
          <p className="muted small">Cached-input pricing excluded. Values in USD.</p>
        </div>
      </header>

      <div className="dashboard-layout">
        <div className="dashboard-inputs">
          {/* Section 1: Assumptions */}
          <section className="card">
            <div className="card-header">
              <svg className="card-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h2>1) Core assumptions</h2>
            </div>
            <div className="grid two">
              <label>
                Model
                <select
                  value={selectedModel.id}
                  onChange={(event) => setSelectedModelId(event.target.value)}
                >
                  {AZURE_DATA_ZONE_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} (in: ${model.inputCostPerMillion}/1M, out: ${model.outputCostPerMillion}/1M)
                    </option>
                  ))}
                </select>
              </label>

              <div className="stage-knob-container" style={{ border: 'none', padding: 0, background: 'none' }}>
                <label className="stage-knob-label-row">
                  <span>Users per year</span>
                </label>
                <div className="stage-knob-control-row">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={annualUsers}
                    onChange={(event) =>
                      setAnnualUsers(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                    }
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="preset-chips">
                  {[
                    { label: '1k', value: 1000 },
                    { label: '10k', value: 10000 },
                    { label: '100k', value: 100000 },
                    { label: '1M', value: 1000000 },
                  ].map((p) => (
                    <button
                      type="button"
                      key={p.label}
                      className={`preset-chip${annualUsers === p.value ? ' active' : ''}`}
                      onClick={() => setAnnualUsers(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="stage-knob-container" style={{ border: 'none', padding: 0, background: 'none' }}>
                <label className="stage-knob-label-row">
                  <span>API success rate (%)</span>
                </label>
                <div className="stage-knob-control-row">
                  <input
                    type="range"
                    className="stage-knob-slider"
                    min={0}
                    max={100}
                    step={0.1}
                    value={apiSuccessRatePercent}
                    onChange={(event) =>
                      setApiSuccessRatePercent(clamp(Number(event.target.value) || 0, 0, 100))
                    }
                  />
                  <span className="stage-knob-number-wrapper">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={apiSuccessRatePercent}
                      onChange={(event) =>
                        setApiSuccessRatePercent(clamp(Number(event.target.value) || 0, 0, 100))
                      }
                    />
                    <span className="stage-knob-suffix">%</span>
                  </span>
                </div>
                <div className="preset-chips">
                  {[
                    { label: '90%', value: 90 },
                    { label: '95%', value: 95 },
                    { label: '99% (Typical)', value: 99 },
                    { label: '99.9%', value: 99.9 },
                    { label: '100%', value: 100 },
                  ].map((p) => (
                    <button
                      type="button"
                      key={p.label}
                      className={`preset-chip${apiSuccessRatePercent === p.value ? ' active' : ''}`}
                      onClick={() => setApiSuccessRatePercent(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="stage-knob-container" style={{ border: 'none', padding: 0, background: 'none' }}>
                <label className="stage-knob-label-row">
                  <span>Max API attempts per call</span>
                </label>
                <div className="stage-knob-control-row">
                  <input
                    type="range"
                    className="stage-knob-slider"
                    min={1}
                    max={5}
                    step={1}
                    value={apiMaxAttempts}
                    onChange={(event) =>
                      setApiMaxAttempts(Math.max(1, Math.floor(Number(event.target.value) || 1)))
                    }
                  />
                  <span className="stage-knob-number-wrapper">
                    <input
                      type="number"
                      min={1}
                      max={5}
                      step={1}
                      value={apiMaxAttempts}
                      onChange={(event) =>
                        setApiMaxAttempts(Math.max(1, Math.floor(Number(event.target.value) || 1)))
                      }
                    />
                  </span>
                </div>
                <div className="preset-chips">
                  {[
                    { label: '1 (None)', value: 1 },
                    { label: '2', value: 2 },
                    { label: '3 (Typical)', value: 3 },
                    { label: '5', value: 5 },
                  ].map((p) => (
                    <button
                      type="button"
                      key={p.label}
                      className={`preset-chip${apiMaxAttempts === p.value ? ' active' : ''}`}
                      onClick={() => setApiMaxAttempts(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="muted small">
              Transport-level failures (timeouts, 5xx, rate limits) get retried, adding
              ~{decimalFormatter.format((apiInputOverhead - 1) * 100)}% to input tokens.
              Counted on input only — failed calls rarely bill for output. Set success to
              100% to disable.
            </p>
          </section>

          {/* Section 2: Engagement Distribution */}
          <section className="card">
            <div className="card-header">
              <svg className="card-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              <h2>2) Engagement distribution</h2>
            </div>
            <div className="distribution-grid">
              {ENGAGEMENT_DISTRIBUTIONS.map((distribution) => (
                <button
                  type="button"
                  key={distribution.id}
                  className={`distribution-card ${
                    distribution.id === selectedDistribution.id ? 'selected' : ''
                  }`}
                  onClick={() => setSelectedDistributionId(distribution.id)}
                  aria-pressed={distribution.id === selectedDistribution.id}
                >
                  <span className="distribution-card-name">{distribution.name}</span>
                  <DistributionSparkline segments={distribution.segments} />
                </button>
              ))}
            </div>
            <p className="muted small dist-legend">
              Bar width = share of users · height = engagement (√-scaled) · area ≈ share of tokens.
            </p>

            <div className="distribution-info">
              <p className="distribution-summary">{selectedDistribution.summary}</p>
              <p className="muted small">{selectedDistribution.details}</p>
              <p className="muted small">
                Weighted engagement multiplier:{' '}
                <strong className="text-highlight">{decimalFormatter.format(budgetResult.averageMultiplier)}x</strong>
              </p>
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Segment</th>
                    <th>User share</th>
                    <th>Multiplier</th>
                    <th>Users / year</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetResult.segments.map((segment) => (
                    <tr key={segment.segmentId}>
                      <td>
                        <strong>{segment.segmentLabel}</strong>
                        <div className="muted small">{segment.description}</div>
                      </td>
                      <td>{percentFormatter.format(segment.share)}</td>
                      <td>{decimalFormatter.format(segment.multiplier)}x</td>
                      <td>{tokenFormatter.format(segment.users)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3: Workflows */}
          <section className="card">
            <div className="card-header">
              <svg className="card-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h2>3) Conversation workflow definitions</h2>
            </div>
            <p className="muted small header-description">
              Define each flow as trigger → gate → answer → judge (with retries).
            </p>

            <div className="workloads">
              {flows.map((flow, index) => {
                const stages = flow.stages
                const feedback = flowFeedback[flow.id]
                const isCollapsed = !!collapsedFlows[flow.id]
                const derived = deriveFlow(flow, apiInputOverhead)

                return (
                  <article key={flow.id} className={`workload-row ${isCollapsed ? 'collapsed' : ''}`}>
                    <div className="workload-row-header" onClick={() => toggleCollapseFlow(flow.id)}>
                      <div className="row-header-title">
                        <svg 
                          className={`collapse-chevron ${isCollapsed ? '' : 'rotated'}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                        <h3>Flow {index + 1}: <span className="label-text">{flow.label || 'Untitled Flow'}</span></h3>
                      </div>
                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="button-primary small-button"
                          onClick={() => void estimateFlowFromSamples(flow.id)}
                        >
                          Estimate workflow
                        </button>
                        <button
                          type="button"
                          className="button-danger icon-only"
                          onClick={() => removeFlow(flow.id)}
                          disabled={flows.length <= 1}
                          title="Remove Flow"
                        >
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{width: '16px', height: '16px'}}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="workload-row-content">
                        {feedback ? (
                          <p className={`feedback ${feedback.kind === 'error' ? 'error' : 'success'}`}>
                            {feedback.message}
                          </p>
                        ) : null}

                        {/* Preset starter + live pipeline preview */}
                        <div className="template-section">
                          <label className="template-select">
                            <span className="template-select-title">Flow preset</span>
                            <select
                              value={flow.presetId}
                              onChange={(event) => {
                                const value = event.target.value
                                if (value !== 'custom') {
                                  applyPreset(flow.id, value as FlowPresetId)
                                }
                              }}
                            >
                              {flow.presetId === 'custom' ? (
                                <option value="custom">Custom (edited)</option>
                              ) : null}
                              {FLOW_PRESETS.map((preset) => (
                                <option key={preset.id} value={preset.id}>
                                  {preset.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="template-minimap" aria-hidden="true">
                            {stages.length === 0 ? (
                              <span className="minimap-empty">No stages yet — add one below</span>
                            ) : (
                              stages.map((stage, stageIndex) => (
                                <Fragment key={`${flow.id}-mini-${stage.id}`}>
                                  <div className="minimap-node">
                                    <svg className="minimap-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={getStageDef(stage.kind).iconPath} />
                                    </svg>
                                    <span>{getStageDef(stage.kind).name}</span>
                                  </div>
                                  {stageIndex < stages.length - 1 ? (
                                    <span className="minimap-arrow">→</span>
                                  ) : null}
                                </Fragment>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="grid two">
                          <label>
                            Flow label
                            <input
                              type="text"
                              value={flow.label}
                              onChange={(event) =>
                                handleFlowLabelChange(flow.id, event.target.value)
                              }
                            />
                          </label>
                          <label>
                            Conversations per user
                            <div className="frequency-controls">
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={flow.conversationFrequencyValue}
                                onChange={(event) =>
                                  handleFlowFrequencyValueChange(
                                    flow.id,
                                    Number(event.target.value),
                                  )
                                }
                              />
                              <select
                                value={flow.conversationFrequencyUnit}
                                onChange={(event) =>
                                  handleFlowFrequencyUnitChange(
                                    flow.id,
                                    event.target.value as FrequencyUnit,
                                  )
                                }
                              >
                                {FREQUENCY_UNITS.map((unit) => (
                                  <option key={unit.id} value={unit.id}>
                                    per {unit.label.toLowerCase()}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </label>

                          <div className="frequency-presets-container">
                            <span className="frequency-label">Quick presets</span>
                            <div className="preset-chips">
                              {[
                                { label: '1/day', val: 1, unit: 'day' as FrequencyUnit },
                                { label: '5/week', val: 5, unit: 'week' as FrequencyUnit },
                                { label: '1/week', val: 1, unit: 'week' as FrequencyUnit },
                                { label: '10/month', val: 10, unit: 'month' as FrequencyUnit },
                                { label: '1/month', val: 1, unit: 'month' as FrequencyUnit },
                                { label: '1/year', val: 1, unit: 'year' as FrequencyUnit },
                              ].map((p) => {
                                const isActive =
                                  flow.conversationFrequencyValue === p.val &&
                                  flow.conversationFrequencyUnit === p.unit
                                return (
                                  <button
                                    type="button"
                                    key={p.label}
                                    className={`preset-chip${isActive ? ' active' : ''}`}
                                    onClick={() => {
                                      handleFlowFrequencyValueChange(flow.id, p.val)
                                      handleFlowFrequencyUnitChange(flow.id, p.unit)
                                    }}
                                  >
                                    {p.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>

                        <p className="muted small info-banner">
                          Compose the flow from stages below — add, remove, or reorder them.
                          The shared user message is the conversation input every gate /
                          answer / judge call sees. Prompt fields want the template
                          scaffolding only (the user message and draft answer are counted
                          separately). Rates recompute the estimate live.
                        </p>

                        {/* Shared conversation input */}
                        <div className="sample-block shared-input">
                          <label className="textarea-label">
                            <span>Shared user message</span>
                            <span className="badge">
                              {parseSampleTextEntries(flow.userMessageSamplesText).length} parsed
                            </span>
                          </label>
                          <textarea
                            rows={3}
                            value={flow.userMessageSamplesText}
                            onChange={(event) =>
                              handleUserMessageChange(flow.id, event.target.value)
                            }
                            placeholder="Paste one user message per line, or JSON transcripts."
                          />
                          <div className="file-upload-wrapper">
                            <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            <input
                              type="file"
                              accept=".txt,.md,.json,.csv,.log,text/plain,application/json"
                              onChange={(event) =>
                                void loadFileInto(flow.id, event, (contents) =>
                                  handleUserMessageChange(flow.id, contents),
                                )
                              }
                            />
                          </div>
                        </div>

                        {/* Editable vertical stage stack */}
                        <div className="pipeline-vertical">
                          {stages.map((stage, stageIndex) => {
                            const def = getStageDef(stage.kind)
                            return (
                              <div className="stage-step" key={stage.id}>
                                <div className="stage-block">
                                  <div className="stage-block-head">
                                    <svg className="stage-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={def.iconPath} />
                                    </svg>
                                    <div className="stage-title">
                                      <span className="stage-name">{def.name}</span>
                                      <span className="stage-caption">{def.caption}</span>
                                    </div>
                                    <div className="stage-controls">
                                      <button
                                        type="button"
                                        className="stage-ctrl-btn"
                                        title="Move up"
                                        disabled={stageIndex === 0}
                                        onClick={() => moveStage(flow.id, stage.id, -1)}
                                      >
                                        ↑
                                      </button>
                                      <button
                                        type="button"
                                        className="stage-ctrl-btn"
                                        title="Move down"
                                        disabled={stageIndex === stages.length - 1}
                                        onClick={() => moveStage(flow.id, stage.id, 1)}
                                      >
                                        ↓
                                      </button>
                                      <button
                                        type="button"
                                        className="stage-ctrl-btn danger"
                                        title="Remove stage"
                                        onClick={() => removeStage(flow.id, stage.id)}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>

                                  {def.knobs.length > 0 ? (
                                    <div className="stage-knobs">
                                      {def.knobs.map((knob) => {
                                        const value = stage[knob.field] ?? 0
                                        const maxVal = knob.max ?? (knob.field === 'maxAnswerAttempts' ? 10 : 100)
                                        
                                        // Define presets
                                        let presets: { label: string; value: number }[] = []
                                        if (knob.field === 'engageRatePercent') {
                                          presets = [
                                            { label: '10%', value: 10 },
                                            { label: '25%', value: 25 },
                                            { label: '50%', value: 50 },
                                            { label: '75%', value: 75 },
                                            { label: '100%', value: 100 },
                                          ]
                                        } else if (knob.field === 'judgePassRatePercent') {
                                          presets = [
                                            { label: '50% (Hard)', value: 50 },
                                            { label: '80% (Avg)', value: 80 },
                                            { label: '90%', value: 90 },
                                            { label: '95% (Easy)', value: 95 },
                                            { label: '99%', value: 99 },
                                          ]
                                        } else if (knob.field === 'maxAnswerAttempts') {
                                          presets = [
                                            { label: '1 (None)', value: 1 },
                                            { label: '2', value: 2 },
                                            { label: '3 (Typical)', value: 3 },
                                            { label: '5', value: 5 },
                                          ]
                                        }

                                        return (
                                          <div className="stage-knob-container" key={knob.field}>
                                            <div className="stage-knob-label-row">
                                              <span>{knob.label}</span>
                                            </div>
                                            <div className="stage-knob-control-row">
                                              <input
                                                type="range"
                                                className="stage-knob-slider"
                                                min={knob.min}
                                                max={maxVal}
                                                step={knob.step}
                                                value={value}
                                                onChange={(event) =>
                                                  handleStageKnobChange(
                                                    flow.id,
                                                    stage.id,
                                                    knob.field,
                                                    Number(event.target.value),
                                                  )
                                                }
                                              />
                                              <span className="stage-knob-number-wrapper">
                                                <input
                                                  type="number"
                                                  min={knob.min}
                                                  max={maxVal}
                                                  step={knob.step}
                                                  value={value}
                                                  onChange={(event) =>
                                                    handleStageKnobChange(
                                                      flow.id,
                                                      stage.id,
                                                      knob.field,
                                                      Number(event.target.value),
                                                    )
                                                  }
                                                />
                                                {knob.suffix ? (
                                                  <span className="stage-knob-suffix">{knob.suffix}</span>
                                                ) : null}
                                              </span>
                                            </div>

                                            {presets.length > 0 ? (
                                              <div className="preset-chips">
                                                {presets.map((p) => (
                                                  <button
                                                    type="button"
                                                    key={p.label}
                                                    className={`preset-chip${value === p.value ? ' active' : ''}`}
                                                    onClick={() =>
                                                      handleStageKnobChange(
                                                        flow.id,
                                                        stage.id,
                                                        knob.field,
                                                        p.value,
                                                      )
                                                    }
                                                  >
                                                    {p.label}
                                                  </button>
                                                ))}
                                              </div>
                                            ) : null}

                                            {knob.field === 'engageRatePercent' ? (
                                              <div className="knob-math-feedback">
                                                Downstream volume: Scales following stages to <strong>{value}%</strong> of conversations.
                                              </div>
                                            ) : null}

                                            {knob.field === 'judgePassRatePercent' ? (
                                              <div className="knob-math-feedback">
                                                Expected runs: <strong>{expectedAttemptsWithCap(
                                                  clamp(value, 0, 100) / 100,
                                                  Math.max(1, Math.floor(stage.maxAnswerAttempts || 1))
                                                ).toFixed(2)}x</strong> drafts & judgements.
                                              </div>
                                            ) : null}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ) : null}

                                  <div className="stage-fields">
                                    {def.slots.map((slotDef) => {
                                      const fieldValue = stage.samples[slotDef.key] ?? ''
                                      const entryCount = parseSampleTextEntries(fieldValue).length
                                      const optionalLabel = slotDef.optional ? ' (optional)' : ''
                                      return (
                                        <div className="sample-block" key={`${stage.id}-${slotDef.key}`}>
                                          <label className="textarea-label">
                                            <span>{slotDef.label}{optionalLabel}</span>
                                            <span className="badge">{entryCount} parsed</span>
                                          </label>
                                          <textarea
                                            rows={3}
                                            value={fieldValue}
                                            onChange={(event) =>
                                              handleStageSampleChange(
                                                flow.id,
                                                stage.id,
                                                slotDef.key,
                                                event.target.value,
                                              )
                                            }
                                            placeholder={slotDef.placeholder}
                                          />
                                          <div className="file-upload-wrapper">
                                            <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                            </svg>
                                            <input
                                              type="file"
                                              accept=".txt,.md,.json,.csv,.log,text/plain,application/json"
                                              onChange={(event) =>
                                                void loadFileInto(flow.id, event, (contents) =>
                                                  handleStageSampleChange(
                                                    flow.id,
                                                    stage.id,
                                                    slotDef.key,
                                                    contents,
                                                  ),
                                                )
                                              }
                                            />
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                                {stageIndex < stages.length - 1 ? (
                                  <div className="stage-arrow" aria-hidden="true">▼</div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>

                        {/* Component palette */}
                        <div className="stage-palette">
                          <span className="stage-palette-label">Add stage:</span>
                          {STAGE_KINDS.map((kind) => (
                            <button
                              type="button"
                              key={kind}
                              className="stage-palette-btn"
                              onClick={() => addStage(flow.id, kind)}
                            >
                              <svg className="palette-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={getStageDef(kind).iconPath} />
                              </svg>
                              {getStageDef(kind).name}
                            </button>
                          ))}
                        </div>

                        <div className="flow-card-footer">
                          <span className="muted small font-semibold">
                            ≈ {formatTokens(derived.expectedInputTokensPerConversation)} in /{' '}
                            {formatTokens(derived.expectedOutputTokensPerConversation)} out tokens per conversation
                          </span>
                          <span className="muted small">
                            Calls / conversation{' '}
                            <strong>{decimalFormatter.format(derived.totalCallsPerConversation)}</strong>{' '}
                            | Reaching the end{' '}
                            <strong>{percentFormatter.format(derived.finalReachProbability)}</strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>

            <div className="add-flow-controls">
              <label>
                New flow preset
                <select
                  value={newFlowPresetId}
                  onChange={(event) =>
                    setNewFlowPresetId(event.target.value as FlowPresetId)
                  }
                >
                  {FLOW_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="add-row-button button-primary"
                onClick={addFlow}
              >
                Add conversation flow
              </button>
            </div>
          </section>
        </div>

        {/* Right sticky side panel: Estimation outputs */}
        <div className="dashboard-sidebar">
          <section className="card results-card glassmorphic">
            <div className="card-header">
              <svg className="card-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{color: 'var(--primary)'}}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2>4) Live annual estimates</h2>
            </div>
            
            <div className="results-grid">
              <div className="metric">
                <h3>Input cost</h3>
                <p className="metric-cost">{currencyFormatter.format(budgetResult.costSummary.inputCost)}</p>
                <small className="muted">{formatTokens(budgetResult.tokenSummary.inputTokens)} tokens</small>
              </div>
              <div className="metric">
                <h3>Output cost</h3>
                <p className="metric-cost">{currencyFormatter.format(budgetResult.costSummary.outputCost)}</p>
                <small className="muted">{formatTokens(budgetResult.tokenSummary.outputTokens)} tokens</small>
              </div>
              <div className="metric total glow-border">
                <h3>Total budget</h3>
                <p className="metric-cost highlight">{currencyFormatter.format(budgetResult.costSummary.totalCost)}</p>
                <small className="muted font-bold">{formatTokens(budgetResult.tokenSummary.totalTokens)} total tokens</small>
              </div>
            </div>

            <div className="cost-distribution-bar">
              {budgetResult.costSummary.totalCost > 0 ? (
                <>
                  <div 
                    className="cost-bar-segment input-seg" 
                    style={{ width: `${(budgetResult.costSummary.inputCost / budgetResult.costSummary.totalCost) * 100}%` }}
                    title={`Input cost: ${percentFormatter.format(budgetResult.costSummary.inputCost / budgetResult.costSummary.totalCost)}`}
                  />
                  <div 
                    className="cost-bar-segment output-seg" 
                    style={{ width: `${(budgetResult.costSummary.outputCost / budgetResult.costSummary.totalCost) * 100}%` }}
                    title={`Output cost: ${percentFormatter.format(budgetResult.costSummary.outputCost / budgetResult.costSummary.totalCost)}`}
                  />
                </>
              ) : (
                <div className="cost-bar-empty" />
              )}
            </div>
            <div className="cost-distribution-legend">
              <span className="legend-item"><span className="legend-dot input-dot"></span> Input</span>
              <span className="legend-item"><span className="legend-dot output-dot"></span> Output</span>
            </div>

            <div className="table-wrapper condensed">
              <table>
                <thead>
                  <tr>
                    <th>Segment</th>
                    <th>Tokens</th>
                    <th>Annual cost</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetResult.segments.map((segment) => (
                    <tr key={segment.segmentId}>
                      <td>{segment.segmentLabel}</td>
                      <td>{formatTokens(segment.tokenSummary.totalTokens)}</td>
                      <td className="font-semibold">{currencyFormatter.format(segment.costSummary.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="leadership-report">
              <h3>Leadership summary</h3>
              <p className="small">
                Assumes a <strong>{selectedDistribution.name}</strong> distribution ({distributionBreakdown}) with a weighted engagement multiplier of <strong>{decimalFormatter.format(budgetResult.averageMultiplier)}x</strong>.
              </p>
              <p className="small">
                Users will generate approximately <strong>{decimalFormatter.format(annualConversationsPerUser)}</strong> conversations per year (~<strong>{decimalFormatter.format(annualConversationsPerUser / 12)}</strong>/mo or ~<strong>{decimalFormatter.format(annualConversationsPerUser / 52)}</strong>/wk).
              </p>
              <p className="muted small font-semibold">
                By flow: {flows.map((flow) => flowCadenceSummary(flow)).join('; ')}.
              </p>
            </div>

            <div className="sidebar-foot-meta">
              <p className="muted small">
                Baseline/user: {formatTokens(budgetResult.basePerUserTokenSummary.inputTokens)} in + {formatTokens(budgetResult.basePerUserTokenSummary.outputTokens)} out
              </p>
              <p className="muted small">
                Pricing source:{' '}
                <a href={selectedModel.source} target="_blank" rel="noreferrer">
                  Azure Docs
                </a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

export default App
