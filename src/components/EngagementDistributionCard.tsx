import type { AnnualBudgetResult } from '../lib/calculator'
import { ENGAGEMENT_DISTRIBUTIONS } from '../lib/distributions'
import type { EngagementDistribution } from '../lib/types'
import { decimalFormatter, percentFormatter, tokenFormatter } from '../format'
import { DistributionSparkline } from './DistributionSparkline'

type EngagementDistributionCardProps = {
  selectedDistribution: EngagementDistribution
  onSelect: (distributionId: string) => void
  segments: AnnualBudgetResult['segments']
  averageMultiplier: number
}

export const EngagementDistributionCard = ({
  selectedDistribution,
  onSelect,
  segments,
  averageMultiplier,
}: EngagementDistributionCardProps) => (
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
          onClick={() => onSelect(distribution.id)}
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
        <strong className="text-highlight">{decimalFormatter.format(averageMultiplier)}x</strong>
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
          {segments.map((segment) => (
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
)
