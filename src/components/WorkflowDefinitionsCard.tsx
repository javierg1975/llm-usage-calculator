import { useState } from 'react'
import {
  FLOW_PRESETS,
  type ConversationFlowDraft,
  type FlowFeedback,
  type FlowPresetId,
} from '../flow/flowModel'
import type { FlowActions } from '../flow/useFlows'
import { FlowCard } from './FlowCard'

type WorkflowDefinitionsCardProps = {
  flows: ConversationFlowDraft[]
  collapsedFlows: Record<string, boolean>
  flowFeedback: Record<string, FlowFeedback | undefined>
  apiInputOverhead: number
  actions: FlowActions
}

export const WorkflowDefinitionsCard = ({
  flows,
  collapsedFlows,
  flowFeedback,
  apiInputOverhead,
  actions,
}: WorkflowDefinitionsCardProps) => {
  const [newFlowPresetId, setNewFlowPresetId] = useState<FlowPresetId>('user-first')

  return (
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
        {flows.map((flow, index) => (
          <FlowCard
            key={flow.id}
            flow={flow}
            index={index}
            flowsCount={flows.length}
            isCollapsed={!!collapsedFlows[flow.id]}
            feedback={flowFeedback[flow.id]}
            apiInputOverhead={apiInputOverhead}
            actions={actions}
          />
        ))}
      </div>

      <div className="add-flow-controls">
        <label>
          New flow preset
          <select
            value={newFlowPresetId}
            onChange={(event) => setNewFlowPresetId(event.target.value as FlowPresetId)}
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
          onClick={() => actions.addFlow(newFlowPresetId)}
        >
          Add conversation flow
        </button>
      </div>
    </section>
  )
}
