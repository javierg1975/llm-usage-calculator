import { Fragment } from 'react'
import { FREQUENCY_UNITS, type FrequencyUnit } from '../lib/frequency'
import { parseSampleTextEntries } from '../lib/sampleText'
import { decimalFormatter, formatTokens, percentFormatter } from '../format'
import { getStageDef, STAGE_KINDS } from '../flow/stageCatalog'
import {
  deriveFlow,
  FLOW_PRESETS,
  type ConversationFlowDraft,
  type FlowFeedback,
  type FlowPresetId,
} from '../flow/flowModel'
import type { FlowActions } from '../flow/useFlows'
import { StageBlock } from './StageBlock'

const FREQUENCY_PRESETS: { label: string; val: number; unit: FrequencyUnit }[] = [
  { label: '1/day', val: 1, unit: 'day' },
  { label: '5/week', val: 5, unit: 'week' },
  { label: '1/week', val: 1, unit: 'week' },
  { label: '10/month', val: 10, unit: 'month' },
  { label: '1/month', val: 1, unit: 'month' },
  { label: '1/year', val: 1, unit: 'year' },
]

type FlowCardProps = {
  flow: ConversationFlowDraft
  index: number
  flowsCount: number
  isCollapsed: boolean
  feedback?: FlowFeedback
  apiInputOverhead: number
  actions: FlowActions
}

export const FlowCard = ({
  flow,
  index,
  flowsCount,
  isCollapsed,
  feedback,
  apiInputOverhead,
  actions,
}: FlowCardProps) => {
  const stages = flow.stages
  const derived = deriveFlow(flow, apiInputOverhead)

  return (
    <article className={`workload-row ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="workload-row-header" onClick={() => actions.toggleCollapseFlow(flow.id)}>
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
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="button-primary small-button"
            onClick={() => void actions.estimateFlowFromSamples(flow.id)}
          >
            Estimate workflow
          </button>
          <button
            type="button"
            className="button-danger icon-only"
            onClick={() => actions.removeFlow(flow.id)}
            disabled={flowsCount <= 1}
            title="Remove Flow"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '16px', height: '16px' }}>
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
                    actions.applyPreset(flow.id, value as FlowPresetId)
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
                onChange={(event) => actions.handleFlowLabelChange(flow.id, event.target.value)}
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
                    actions.handleFlowFrequencyValueChange(flow.id, Number(event.target.value))
                  }
                />
                <select
                  value={flow.conversationFrequencyUnit}
                  onChange={(event) =>
                    actions.handleFlowFrequencyUnitChange(
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
                {FREQUENCY_PRESETS.map((preset) => {
                  const isActive =
                    flow.conversationFrequencyValue === preset.val &&
                    flow.conversationFrequencyUnit === preset.unit
                  return (
                    <button
                      type="button"
                      key={preset.label}
                      className={`preset-chip${isActive ? ' active' : ''}`}
                      onClick={() => {
                        actions.handleFlowFrequencyValueChange(flow.id, preset.val)
                        actions.handleFlowFrequencyUnitChange(flow.id, preset.unit)
                      }}
                    >
                      {preset.label}
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
              onChange={(event) => actions.handleUserMessageChange(flow.id, event.target.value)}
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
                  void actions.loadFileInto(flow.id, event, (contents) =>
                    actions.handleUserMessageChange(flow.id, contents),
                  )
                }
              />
            </div>
          </div>

          {/* Editable vertical stage stack */}
          <div className="pipeline-vertical">
            {stages.map((stage, stageIndex) => (
              <StageBlock
                key={stage.id}
                flowId={flow.id}
                stage={stage}
                index={stageIndex}
                total={stages.length}
                actions={actions}
              />
            ))}
          </div>

          {/* Component palette */}
          <div className="stage-palette">
            <span className="stage-palette-label">Add stage:</span>
            {STAGE_KINDS.map((kind) => (
              <button
                type="button"
                key={kind}
                className="stage-palette-btn"
                onClick={() => actions.addStage(flow.id, kind)}
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
}
