import type { AnnualBudgetResult } from '../lib/calculator'
import type { ModelPricing, EngagementDistribution } from '../lib/types'
import {
  currencyFormatter,
  decimalFormatter,
  formatTokens,
  percentFormatter,
} from '../format'
import { flowCadenceSummary, type ConversationFlowDraft } from '../flow/flowModel'

type ResultsPanelProps = {
  budgetResult: AnnualBudgetResult
  selectedModel: ModelPricing
  selectedDistribution: EngagementDistribution
  distributionBreakdown: string
  annualConversationsPerUser: number
  flows: ConversationFlowDraft[]
}

export const ResultsPanel = ({
  budgetResult,
  selectedModel,
  selectedDistribution,
  distributionBreakdown,
  annualConversationsPerUser,
  flows,
}: ResultsPanelProps) => {
  const { costSummary, tokenSummary } = budgetResult
  const inputShare =
    costSummary.totalCost > 0 ? costSummary.inputCost / costSummary.totalCost : 0
  const outputShare =
    costSummary.totalCost > 0 ? costSummary.outputCost / costSummary.totalCost : 0

  return (
    <section className="card results-card glassmorphic">
      <div className="card-header">
        <svg className="card-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--primary)' }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2>4) Live annual estimates</h2>
      </div>

      <div className="results-grid">
        <div className="metric">
          <h3>Input cost</h3>
          <p className="metric-cost">{currencyFormatter.format(costSummary.inputCost)}</p>
          <small className="muted">{formatTokens(tokenSummary.inputTokens)} tokens</small>
        </div>
        <div className="metric">
          <h3>Output cost</h3>
          <p className="metric-cost">{currencyFormatter.format(costSummary.outputCost)}</p>
          <small className="muted">{formatTokens(tokenSummary.outputTokens)} tokens</small>
        </div>
        <div className="metric total glow-border">
          <h3>Total budget</h3>
          <p className="metric-cost highlight">{currencyFormatter.format(costSummary.totalCost)}</p>
          <small className="muted font-bold">{formatTokens(tokenSummary.totalTokens)} total tokens</small>
        </div>
      </div>

      <div className="cost-distribution-bar">
        {costSummary.totalCost > 0 ? (
          <>
            <div
              className="cost-bar-segment input-seg"
              style={{ width: `${inputShare * 100}%` }}
              title={`Input cost: ${percentFormatter.format(inputShare)}`}
            />
            <div
              className="cost-bar-segment output-seg"
              style={{ width: `${outputShare * 100}%` }}
              title={`Output cost: ${percentFormatter.format(outputShare)}`}
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
  )
}
