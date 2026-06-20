import { AZURE_DATA_ZONE_MODELS } from '../lib/models'
import { decimalFormatter } from '../format'
import { clamp } from '../flow/flowModel'

type CoreAssumptionsCardProps = {
  modelId: string
  onModelChange: (modelId: string) => void
  annualUsers: number
  onAnnualUsersChange: (value: number) => void
  apiSuccessRatePercent: number
  onApiSuccessRateChange: (value: number) => void
  apiMaxAttempts: number
  onApiMaxAttemptsChange: (value: number) => void
  apiInputOverhead: number
}

const USER_PRESETS = [
  { label: '1k', value: 1000 },
  { label: '10k', value: 10000 },
  { label: '100k', value: 100000 },
  { label: '1M', value: 1000000 },
]

const API_SUCCESS_PRESETS = [
  { label: '90%', value: 90 },
  { label: '95%', value: 95 },
  { label: '99% (Typical)', value: 99 },
  { label: '99.9%', value: 99.9 },
  { label: '100%', value: 100 },
]

const API_ATTEMPT_PRESETS = [
  { label: '1 (None)', value: 1 },
  { label: '2', value: 2 },
  { label: '3 (Typical)', value: 3 },
  { label: '5', value: 5 },
]

export const CoreAssumptionsCard = ({
  modelId,
  onModelChange,
  annualUsers,
  onAnnualUsersChange,
  apiSuccessRatePercent,
  onApiSuccessRateChange,
  apiMaxAttempts,
  onApiMaxAttemptsChange,
  apiInputOverhead,
}: CoreAssumptionsCardProps) => (
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
        <select value={modelId} onChange={(event) => onModelChange(event.target.value)}>
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
              onAnnualUsersChange(Math.max(0, Math.floor(Number(event.target.value) || 0)))
            }
            style={{ width: '100%' }}
          />
        </div>
        <div className="preset-chips">
          {USER_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.label}
              className={`preset-chip${annualUsers === preset.value ? ' active' : ''}`}
              onClick={() => onAnnualUsersChange(preset.value)}
            >
              {preset.label}
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
              onApiSuccessRateChange(clamp(Number(event.target.value) || 0, 0, 100))
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
                onApiSuccessRateChange(clamp(Number(event.target.value) || 0, 0, 100))
              }
            />
            <span className="stage-knob-suffix">%</span>
          </span>
        </div>
        <div className="preset-chips">
          {API_SUCCESS_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.label}
              className={`preset-chip${apiSuccessRatePercent === preset.value ? ' active' : ''}`}
              onClick={() => onApiSuccessRateChange(preset.value)}
            >
              {preset.label}
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
              onApiMaxAttemptsChange(Math.max(1, Math.floor(Number(event.target.value) || 1)))
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
                onApiMaxAttemptsChange(Math.max(1, Math.floor(Number(event.target.value) || 1)))
              }
            />
          </span>
        </div>
        <div className="preset-chips">
          {API_ATTEMPT_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.label}
              className={`preset-chip${apiMaxAttempts === preset.value ? ' active' : ''}`}
              onClick={() => onApiMaxAttemptsChange(preset.value)}
            >
              {preset.label}
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
)
