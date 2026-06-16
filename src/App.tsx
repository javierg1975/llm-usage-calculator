import { useMemo, useState, type ChangeEvent } from 'react'
import './App.css'
import {
  calculateAnnualBudget,
  type AnnualBudgetResult,
} from './lib/calculator'
import {
  estimateConversationWorkflow,
  type ConversationWorkflowInput,
} from './lib/conversationWorkflow'
import {
  FREQUENCY_UNITS,
  formatFrequencyPhrase,
  toAnnualFrequency,
  type FrequencyUnit,
} from './lib/frequency'
import { ENGAGEMENT_DISTRIBUTIONS } from './lib/distributions'
import { AZURE_DATA_ZONE_MODELS } from './lib/models'
import { parseSampleTextEntries } from './lib/sampleText'
import type { WorkloadRowInput } from './lib/types'

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

type FlowTemplateId = 'user-first' | 'assistant-first'

type FlowTemplate = {
  id: FlowTemplateId
  name: string
  description: string
  includesOpeningRoundtrip: boolean
  defaultInputTokensPerConversation: number
  defaultOutputTokensPerConversation: number
}

const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'user-first',
    name: 'User-first conversation',
    description:
      'User message arrives first, then gate → answer → judge with retries.',
    includesOpeningRoundtrip: false,
    defaultInputTokensPerConversation: 2200,
    defaultOutputTokensPerConversation: 350,
  },
  {
    id: 'assistant-first',
    name: 'Assistant-first opener',
    description:
      'LLM generates an opening message first, then user-first flow continues.',
    includesOpeningRoundtrip: true,
    defaultInputTokensPerConversation: 2500,
    defaultOutputTokensPerConversation: 450,
  },
]

const getTemplate = (templateId: FlowTemplateId): FlowTemplate =>
  FLOW_TEMPLATES.find((template) => template.id === templateId) ?? FLOW_TEMPLATES[0]

type ConversationFlowDraft = {
  id: string
  label: string
  templateId: FlowTemplateId
  conversationFrequencyValue: number
  conversationFrequencyUnit: FrequencyUnit
  engageRatePercent: number
  judgePassRatePercent: number
  maxAnswerAttempts: number
  expectedInputTokensPerConversation: number
  expectedOutputTokensPerConversation: number
  expectedOpeningCallsPerConversation: number
  expectedAttemptsWhenEngaged: number
  expectedAnswerCallsPerConversation: number
  expectedJudgeCallsPerConversation: number
  openingPromptSamplesText: string
  openingMessageSamplesText: string
  userMessageSamplesText: string
  evaluationPromptSamplesText: string
  evaluationDecisionSamplesText: string
  answerPromptSamplesText: string
  draftAnswerSamplesText: string
  judgePromptSamplesText: string
  judgeDecisionSamplesText: string
}

type EditableNumericFlowField =
  | 'conversationFrequencyValue'
  | 'engageRatePercent'
  | 'judgePassRatePercent'
  | 'maxAnswerAttempts'
  | 'expectedInputTokensPerConversation'
  | 'expectedOutputTokensPerConversation'

type TextFlowField =
  | 'openingPromptSamplesText'
  | 'openingMessageSamplesText'
  | 'userMessageSamplesText'
  | 'evaluationPromptSamplesText'
  | 'evaluationDecisionSamplesText'
  | 'answerPromptSamplesText'
  | 'draftAnswerSamplesText'
  | 'judgePromptSamplesText'
  | 'judgeDecisionSamplesText'

type SampleFieldConfig = {
  key: TextFlowField
  label: string
  placeholder: string
  optional?: boolean
}

const USER_FIRST_SAMPLE_FIELDS: SampleFieldConfig[] = [
  {
    key: 'userMessageSamplesText',
    label: '1) Sample user message',
    placeholder: 'Paste one user message per line, or JSON transcripts.',
  },
  {
    key: 'evaluationPromptSamplesText',
    label: '2) Evaluation prompt',
    placeholder: 'Prompt used to decide whether to engage.',
  },
  {
    key: 'evaluationDecisionSamplesText',
    label: '2) Gate decision output',
    placeholder: 'Optional examples like yes/no or classifier JSON.',
    optional: true,
  },
  {
    key: 'answerPromptSamplesText',
    label: '3.a) Answer prompt',
    placeholder: 'Prompt used to answer the user.',
  },
  {
    key: 'draftAnswerSamplesText',
    label: '3.a) Draft LLM answer',
    placeholder: 'Candidate answers from the model.',
  },
  {
    key: 'judgePromptSamplesText',
    label: '4) Judge prompt',
    placeholder: 'Prompt used for LLM-as-a-judge validation.',
  },
  {
    key: 'judgeDecisionSamplesText',
    label: '4) Judge decision output',
    placeholder: 'Optional pass/fail outputs or score JSON.',
    optional: true,
  },
]

const ASSISTANT_FIRST_OPENING_FIELDS: SampleFieldConfig[] = [
  {
    key: 'openingPromptSamplesText',
    label: '0) Opening prompt',
    placeholder: 'Prompt used to generate the initial outbound message.',
  },
  {
    key: 'openingMessageSamplesText',
    label: '0) Opening message',
    placeholder: 'Initial outbound message sample(s) sent before user response.',
  },
]

const getSampleFieldsForTemplate = (templateId: FlowTemplateId): SampleFieldConfig[] => {
  const template = getTemplate(templateId)
  return template.includesOpeningRoundtrip
    ? [...ASSISTANT_FIRST_OPENING_FIELDS, ...USER_FIRST_SAMPLE_FIELDS]
    : USER_FIRST_SAMPLE_FIELDS
}

type FlowFeedback = {
  kind: 'success' | 'error'
  message: string
}

let flowSequence = 1

const createFlowFromTemplate = (
  templateId: FlowTemplateId,
  label = 'Core question-answer flow',
): ConversationFlowDraft => {
  const template = getTemplate(templateId)

  return {
    id: `flow-${flowSequence += 1}`,
    label,
    templateId,
    conversationFrequencyValue: 24,
    conversationFrequencyUnit: 'year',
    engageRatePercent: 80,
    judgePassRatePercent: 85,
    maxAnswerAttempts: 3,
    expectedInputTokensPerConversation: template.defaultInputTokensPerConversation,
    expectedOutputTokensPerConversation: template.defaultOutputTokensPerConversation,
    expectedOpeningCallsPerConversation: template.includesOpeningRoundtrip ? 1 : 0,
    expectedAttemptsWhenEngaged: 1.1,
    expectedAnswerCallsPerConversation: 0.88,
    expectedJudgeCallsPerConversation: 0.88,
    openingPromptSamplesText: '',
    openingMessageSamplesText: '',
    userMessageSamplesText: '',
    evaluationPromptSamplesText: '',
    evaluationDecisionSamplesText: '',
    answerPromptSamplesText: '',
    draftAnswerSamplesText: '',
    judgePromptSamplesText: '',
    judgeDecisionSamplesText: '',
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const formatTokens = (value: number): string => tokenFormatter.format(Math.round(value))

const toWorkflowInput = (flow: ConversationFlowDraft): ConversationWorkflowInput => ({
  includeAssistantOpeningRoundtrip: getTemplate(flow.templateId).includesOpeningRoundtrip,
  openingPromptSamplesText: flow.openingPromptSamplesText,
  openingMessageSamplesText: flow.openingMessageSamplesText,
  userMessageSamplesText: flow.userMessageSamplesText,
  evaluationPromptSamplesText: flow.evaluationPromptSamplesText,
  evaluationDecisionSamplesText: flow.evaluationDecisionSamplesText,
  answerPromptSamplesText: flow.answerPromptSamplesText,
  draftAnswerSamplesText: flow.draftAnswerSamplesText,
  judgePromptSamplesText: flow.judgePromptSamplesText,
  judgeDecisionSamplesText: flow.judgeDecisionSamplesText,
  engageRate: clamp(flow.engageRatePercent, 0, 100) / 100,
  judgePassRate: clamp(flow.judgePassRatePercent, 0, 100) / 100,
  maxAnswerAttempts: Math.max(1, Math.floor(flow.maxAnswerAttempts || 1)),
})

const toWorkload = (flow: ConversationFlowDraft): WorkloadRowInput => ({
  id: flow.id,
  label: flow.label,
  promptsPerConversation: 1,
  averagePromptTokens: flow.expectedInputTokensPerConversation,
  userMessagesPerConversation: 0,
  averageUserMessageTokens: 0,
  llmResponsesPerConversation: 1,
  averageLlmResponseTokens: flow.expectedOutputTokensPerConversation,
  conversationsPerUserPerYear: toAnnualFrequency(
    flow.conversationFrequencyValue,
    flow.conversationFrequencyUnit,
  ),
})

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

function App() {
  const [selectedModelId, setSelectedModelId] = useState(
    AZURE_DATA_ZONE_MODELS[0].id,
  )
  const [selectedDistributionId, setSelectedDistributionId] = useState(
    ENGAGEMENT_DISTRIBUTIONS[0].id,
  )
  const [annualUsers, setAnnualUsers] = useState(10000)
  const [newFlowTemplateId, setNewFlowTemplateId] =
    useState<FlowTemplateId>('user-first')
  const [flows, setFlows] = useState<ConversationFlowDraft[]>([
    createFlowFromTemplate('user-first'),
  ])
  const [flowFeedback, setFlowFeedback] = useState<
    Record<string, FlowFeedback | undefined>
  >({})

  // Accordion state: track which flows are collapsed (default true/expanded)
  const [collapsedFlows, setCollapsedFlows] = useState<Record<string, boolean>>({})

  // Tab state per flow: 'rates' or 'samples'
  const [flowTabs, setFlowTabs] = useState<Record<string, 'rates' | 'samples'>>({})

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
        workloads: flows.map(toWorkload),
      }),
    [annualUsers, flows, selectedDistribution, selectedModel],
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

  const handleFlowNumberChange = (
    flowId: string,
    field: EditableNumericFlowField,
    value: number,
  ): void => {
    const normalizedValue = Number.isFinite(value) ? value : 0
    setFlows((currentFlows) =>
      currentFlows.map((flow) => {
        if (flow.id !== flowId) {
          return flow
        }
        if (field === 'engageRatePercent' || field === 'judgePassRatePercent') {
          return { ...flow, [field]: clamp(normalizedValue, 0, 100) }
        }
        if (field === 'maxAnswerAttempts') {
          return { ...flow, [field]: Math.max(1, Math.floor(normalizedValue || 1)) }
        }
        return { ...flow, [field]: Math.max(0, normalizedValue) }
      }),
    )
  }

  const handleFlowFrequencyUnitChange = (
    flowId: string,
    value: FrequencyUnit,
  ): void => {
    setFlows((currentFlows) =>
      currentFlows.map((flow) =>
        flow.id === flowId ? { ...flow, conversationFrequencyUnit: value } : flow,
      ),
    )
  }

  const handleFlowTemplateChange = (
    flowId: string,
    value: FlowTemplateId,
  ): void => {
    const template = getTemplate(value)
    setFlows((currentFlows) =>
      currentFlows.map((flow) =>
        flow.id === flowId
          ? {
              ...flow,
              templateId: value,
              expectedOpeningCallsPerConversation: template.includesOpeningRoundtrip
                ? flow.expectedOpeningCallsPerConversation || 1
                : 0,
            }
          : flow,
      ),
    )
  }

  const handleFlowLabelChange = (flowId: string, label: string): void => {
    setFlows((currentFlows) =>
      currentFlows.map((flow) => (flow.id === flowId ? { ...flow, label } : flow)),
    )
  }

  const handleFlowTextChange = (
    flowId: string,
    field: TextFlowField,
    value: string,
  ): void => {
    setFlows((currentFlows) =>
      currentFlows.map((flow) =>
        flow.id === flowId ? { ...flow, [field]: value } : flow,
      ),
    )
  }

  const estimateFlowFromSamples = async (flowId: string): Promise<void> => {
    const flow = flows.find((entry) => entry.id === flowId)
    if (!flow) {
      return
    }

    try {
      const { countTokens } = await import('./lib/tokenization')
      const estimate = estimateConversationWorkflow(toWorkflowInput(flow), countTokens)
      setFlows((currentFlows) =>
        currentFlows.map((entry) =>
          entry.id === flowId
            ? {
                ...entry,
                expectedInputTokensPerConversation:
                  estimate.expectedInputTokensPerConversation,
                expectedOutputTokensPerConversation:
                  estimate.expectedOutputTokensPerConversation,
                expectedOpeningCallsPerConversation:
                  estimate.expectedOpeningCallsPerConversation,
                expectedAttemptsWhenEngaged: estimate.expectedAttemptsWhenEngaged,
                expectedAnswerCallsPerConversation:
                  estimate.expectedAnswerCallsPerConversation,
                expectedJudgeCallsPerConversation: estimate.expectedJudgeCallsPerConversation,
              }
            : entry,
        ),
      )
      setFlowFeedback((currentFeedback) => ({
        ...currentFeedback,
        [flowId]: {
          kind: 'success',
          message:
            'Workflow estimates updated from sample text, including gating, retries, and template-specific roundtrips.',
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

  const handleFileUpload = async (
    flowId: string,
    field: TextFlowField,
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const contents = await file.text()
      handleFlowTextChange(flowId, field, contents)
      setFlowFeedback((currentFeedback) => ({
        ...currentFeedback,
        [flowId]: {
          kind: 'success',
          message: `Loaded ${file.name}. Click "Estimate workflow from samples" to apply.`,
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
    const template = getTemplate(newFlowTemplateId)
    setFlows((currentFlows) => [
      ...currentFlows,
      createFlowFromTemplate(
        newFlowTemplateId,
        `${template.name} ${currentFlows.length + 1}`,
      ),
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

  const setFlowTab = (flowId: string, tab: 'rates' | 'samples') => {
    setFlowTabs((prev) => ({
      ...prev,
      [flowId]: tab,
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

              <label>
                Users per year
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={annualUsers}
                  onChange={(event) =>
                    setAnnualUsers(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                  }
                />
              </label>
            </div>
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
            <div className="control-group">
              <label>
                Distribution profile
                <select
                  value={selectedDistribution.id}
                  onChange={(event) => setSelectedDistributionId(event.target.value)}
                >
                  {ENGAGEMENT_DISTRIBUTIONS.map((distribution) => (
                    <option key={distribution.id} value={distribution.id}>
                      {distribution.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            
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
                const template = getTemplate(flow.templateId)
                const sampleFields = getSampleFieldsForTemplate(flow.templateId)
                const feedback = flowFeedback[flow.id]
                const isCollapsed = !!collapsedFlows[flow.id]
                const activeTab = flowTabs[flow.id] || 'rates'

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

                        {/* Interactive Workflow Pipeline Diagram */}
                        <div className="workflow-pipeline">
                          <div className="pipeline-node active">
                            <svg className="node-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span className="node-name">Trigger</span>
                            <span className="node-value">{template.includesOpeningRoundtrip ? 'Assistant Opener' : 'User Msg'}</span>
                          </div>
                          
                          <div className="pipeline-connector">
                            <span className="connector-arrow">→</span>
                          </div>

                          <div className="pipeline-node">
                            <svg className="node-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                            <span className="node-name">Gate</span>
                            <span className="node-value">{flow.engageRatePercent}% engage</span>
                          </div>

                          <div className="pipeline-connector">
                            <span className="connector-arrow">→</span>
                          </div>

                          <div className="pipeline-node">
                            <svg className="node-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                            <span className="node-name">Answer</span>
                            <span className="node-value">Max {flow.maxAnswerAttempts} tries</span>
                          </div>

                          <div className="pipeline-connector">
                            <span className="connector-arrow">→</span>
                          </div>

                          <div className="pipeline-node">
                            <svg className="node-svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                            </svg>
                            <span className="node-name">Judge</span>
                            <span className="node-value">{flow.judgePassRatePercent}% pass</span>
                          </div>
                        </div>

                        <div className="flow-tab-bar">
                          <button
                            type="button"
                            className={`tab-btn ${activeTab === 'rates' ? 'active' : ''}`}
                            onClick={() => setFlowTab(flow.id, 'rates')}
                          >
                            <svg className="tab-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Rates & Cadence
                          </button>
                          <button
                            type="button"
                            className={`tab-btn ${activeTab === 'samples' ? 'active' : ''}`}
                            onClick={() => setFlowTab(flow.id, 'samples')}
                          >
                            <svg className="tab-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Token Estimation Samples
                          </button>
                        </div>

                        {activeTab === 'rates' ? (
                          <div className="grid two tab-content-anim">
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
                              Flow template
                              <select
                                value={flow.templateId}
                                onChange={(event) =>
                                  handleFlowTemplateChange(
                                    flow.id,
                                    event.target.value as FlowTemplateId,
                                  )
                                }
                              >
                                {FLOW_TEMPLATES.map((templateOption) => (
                                  <option key={templateOption.id} value={templateOption.id}>
                                    {templateOption.name}
                                  </option>
                                ))}
                              </select>
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
                                    handleFlowNumberChange(
                                      flow.id,
                                      'conversationFrequencyValue',
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

                            <label>
                              Engage rate after gate (% yes)
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                value={flow.engageRatePercent}
                                onChange={(event) =>
                                  handleFlowNumberChange(
                                    flow.id,
                                    'engageRatePercent',
                                    Number(event.target.value),
                                  )
                                }
                                className="slider-buddy"
                              />
                            </label>

                            <label>
                              Judge pass rate per attempt (%)
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                value={flow.judgePassRatePercent}
                                onChange={(event) =>
                                  handleFlowNumberChange(
                                    flow.id,
                                    'judgePassRatePercent',
                                    Number(event.target.value),
                                  )
                                }
                              />
                            </label>

                            <label>
                              Max answer attempts
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={flow.maxAnswerAttempts}
                                onChange={(event) =>
                                  handleFlowNumberChange(
                                    flow.id,
                                    'maxAnswerAttempts',
                                    Number(event.target.value),
                                  )
                                }
                              />
                            </label>

                            <label>
                              Expected input tokens / conversation
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={flow.expectedInputTokensPerConversation}
                                onChange={(event) =>
                                  handleFlowNumberChange(
                                    flow.id,
                                    'expectedInputTokensPerConversation',
                                    Number(event.target.value),
                                  )
                                }
                              />
                            </label>

                            <label>
                              Expected output tokens / conversation
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={flow.expectedOutputTokensPerConversation}
                                onChange={(event) =>
                                  handleFlowNumberChange(
                                    flow.id,
                                    'expectedOutputTokensPerConversation',
                                    Number(event.target.value),
                                  )
                                }
                              />
                            </label>
                          </div>
                        ) : (
                          <div className="tab-content-anim">
                            <p className="muted small info-banner">
                              Provide raw text or paste logs below. The tokens of your samples will be analyzed to estimate averages.
                            </p>
                            <div className="sample-grid">
                              {sampleFields.map((field) => {
                                const fieldValue = flow[field.key]
                                const entryCount = parseSampleTextEntries(fieldValue).length
                                const optionalLabel = field.optional ? ' (optional)' : ''
                                return (
                                  <div className="sample-block" key={`${flow.id}-${field.key}`}>
                                    <label className="textarea-label">
                                      <span>{field.label}{optionalLabel}</span>
                                      <span className="badge">{entryCount} parsed</span>
                                    </label>
                                    <textarea
                                      rows={4}
                                      value={fieldValue}
                                      onChange={(event) =>
                                        handleFlowTextChange(flow.id, field.key, event.target.value)
                                      }
                                      placeholder={field.placeholder}
                                    />
                                    <div className="file-upload-wrapper">
                                      <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                      </svg>
                                      <input
                                        type="file"
                                        accept=".txt,.md,.json,.csv,.log,text/plain,application/json"
                                        onChange={(event) =>
                                          void handleFileUpload(flow.id, field.key, event)
                                        }
                                      />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flow-card-footer">
                          <span className="muted small font-semibold">{template.description}</span>
                          <span className="muted small">
                            Derived calls: Opening{' '}
                            <strong>{decimalFormatter.format(flow.expectedOpeningCallsPerConversation)}</strong>{' '}
                            | Answer{' '}
                            <strong>{decimalFormatter.format(flow.expectedAnswerCallsPerConversation)}</strong>{' '}
                            | Judge{' '}
                            <strong>{decimalFormatter.format(flow.expectedJudgeCallsPerConversation)}</strong>{' '}
                            | Attempts engaged{' '}
                            <strong>{decimalFormatter.format(flow.expectedAttemptsWhenEngaged)}</strong>
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
                New flow template
                <select
                  value={newFlowTemplateId}
                  onChange={(event) =>
                    setNewFlowTemplateId(event.target.value as FlowTemplateId)
                  }
                >
                  {FLOW_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
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
