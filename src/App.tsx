import { useMemo, useState } from 'react'
import './App.css'
import { calculateAnnualBudget, type AnnualBudgetResult } from './lib/calculator'
import { toAnnualFrequency } from './lib/frequency'
import { ENGAGEMENT_DISTRIBUTIONS } from './lib/distributions'
import { AZURE_DATA_ZONE_MODELS } from './lib/models'
import { decimalFormatter, percentFormatter } from './format'
import { apiInputOverheadFrom, toWorkload } from './flow/flowModel'
import { useFlows } from './flow/useFlows'
import { CoreAssumptionsCard } from './components/CoreAssumptionsCard'
import { EngagementDistributionCard } from './components/EngagementDistributionCard'
import { WorkflowDefinitionsCard } from './components/WorkflowDefinitionsCard'
import { ResultsPanel } from './components/ResultsPanel'

function App() {
  const [selectedModelId, setSelectedModelId] = useState(AZURE_DATA_ZONE_MODELS[0].id)
  const [selectedDistributionId, setSelectedDistributionId] = useState(
    ENGAGEMENT_DISTRIBUTIONS[0].id,
  )
  const [annualUsers, setAnnualUsers] = useState(10000)
  // Global transport-level API reliability — applied to input tokens across all flows.
  const [apiSuccessRatePercent, setApiSuccessRatePercent] = useState(99)
  const [apiMaxAttempts, setApiMaxAttempts] = useState(3)

  const flowsApi = useFlows()
  const { flows, flowFeedback, collapsedFlows } = flowsApi

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
          sum +
          toAnnualFrequency(flow.conversationFrequencyValue, flow.conversationFrequencyUnit),
        0,
      ),
    [flows],
  )

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
          <CoreAssumptionsCard
            modelId={selectedModelId}
            onModelChange={setSelectedModelId}
            annualUsers={annualUsers}
            onAnnualUsersChange={setAnnualUsers}
            apiSuccessRatePercent={apiSuccessRatePercent}
            onApiSuccessRateChange={setApiSuccessRatePercent}
            apiMaxAttempts={apiMaxAttempts}
            onApiMaxAttemptsChange={setApiMaxAttempts}
            apiInputOverhead={apiInputOverhead}
          />

          <EngagementDistributionCard
            selectedDistribution={selectedDistribution}
            onSelect={setSelectedDistributionId}
            segments={budgetResult.segments}
            averageMultiplier={budgetResult.averageMultiplier}
          />

          <WorkflowDefinitionsCard
            flows={flows}
            collapsedFlows={collapsedFlows}
            flowFeedback={flowFeedback}
            apiInputOverhead={apiInputOverhead}
            actions={flowsApi}
          />
        </div>

        <div className="dashboard-sidebar">
          <ResultsPanel
            budgetResult={budgetResult}
            selectedModel={selectedModel}
            selectedDistribution={selectedDistribution}
            distributionBreakdown={distributionBreakdown}
            annualConversationsPerUser={annualConversationsPerUser}
            flows={flows}
          />
        </div>
      </div>
    </main>
  )
}

export default App
