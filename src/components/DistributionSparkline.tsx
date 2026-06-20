import type { EngagementSegment } from '../lib/types'

// A mini distribution histogram: each segment is a bar whose width is the user
// share and whose height is the engagement multiplier (sqrt-scaled so the big
// outliers don't flatten the rest). Bar area ≈ that segment's share of tokens.
const SPARK_W = 240
const SPARK_H = 88
const SPARK_PAD = { top: 10, right: 8, bottom: 8, left: 8 }

export const DistributionSparkline = ({
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
