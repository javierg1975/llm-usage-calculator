import { expectedAttemptsWithCap } from '../lib/conversationWorkflow'
import { parseSampleTextEntries } from '../lib/sampleText'
import { getStageDef, type StageKnobField } from '../flow/stageCatalog'
import { clamp, type FlowStageDraft } from '../flow/flowModel'
import type { FlowActions } from '../flow/useFlows'

type KnobPreset = { label: string; value: number }

const KNOB_PRESETS: Record<StageKnobField, KnobPreset[]> = {
  engageRatePercent: [
    { label: '10%', value: 10 },
    { label: '25%', value: 25 },
    { label: '50%', value: 50 },
    { label: '75%', value: 75 },
    { label: '100%', value: 100 },
  ],
  judgePassRatePercent: [
    { label: '50% (Hard)', value: 50 },
    { label: '80% (Avg)', value: 80 },
    { label: '90%', value: 90 },
    { label: '95% (Easy)', value: 95 },
    { label: '99%', value: 99 },
  ],
  maxAnswerAttempts: [
    { label: '1 (None)', value: 1 },
    { label: '2', value: 2 },
    { label: '3 (Typical)', value: 3 },
    { label: '5', value: 5 },
  ],
}

type StageBlockProps = {
  flowId: string
  stage: FlowStageDraft
  index: number
  total: number
  actions: FlowActions
}

export const StageBlock = ({ flowId, stage, index, total, actions }: StageBlockProps) => {
  const def = getStageDef(stage.kind)

  return (
    <div className="stage-step">
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
              disabled={index === 0}
              onClick={() => actions.moveStage(flowId, stage.id, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="stage-ctrl-btn"
              title="Move down"
              disabled={index === total - 1}
              onClick={() => actions.moveStage(flowId, stage.id, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="stage-ctrl-btn danger"
              title="Remove stage"
              onClick={() => actions.removeStage(flowId, stage.id)}
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
              const presets = KNOB_PRESETS[knob.field]

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
                        actions.handleStageKnobChange(
                          flowId,
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
                          actions.handleStageKnobChange(
                            flowId,
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
                      {presets.map((preset) => (
                        <button
                          type="button"
                          key={preset.label}
                          className={`preset-chip${value === preset.value ? ' active' : ''}`}
                          onClick={() =>
                            actions.handleStageKnobChange(
                              flowId,
                              stage.id,
                              knob.field,
                              preset.value,
                            )
                          }
                        >
                          {preset.label}
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
                        Math.max(1, Math.floor(stage.maxAnswerAttempts || 1)),
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
                    actions.handleStageSampleChange(
                      flowId,
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
                      void actions.loadFileInto(flowId, event, (contents) =>
                        actions.handleStageSampleChange(flowId, stage.id, slotDef.key, contents),
                      )
                    }
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {index < total - 1 ? (
        <div className="stage-arrow" aria-hidden="true">▼</div>
      ) : null}
    </div>
  )
}
