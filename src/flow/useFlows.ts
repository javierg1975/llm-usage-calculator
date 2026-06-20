import { useState, type ChangeEvent } from 'react'
import type { StageKind } from '../lib/conversationWorkflow'
import type { FrequencyUnit } from '../lib/frequency'
import { summarizeSampleText } from '../lib/sampleText'
import { getStageDef, type StageKnobField } from './stageCatalog'
import {
  clamp,
  createFlowFromPreset,
  getPreset,
  makeStage,
  type ConversationFlowDraft,
  type FlowFeedback,
  type FlowPresetId,
  type FlowStageDraft,
} from './flowModel'

// Callbacks the flow/stage UI needs. Bundled so a flow card takes one `actions`
// prop instead of a dozen handlers.
export type FlowActions = {
  addFlow: (presetId: FlowPresetId) => void
  removeFlow: (flowId: string) => void
  toggleCollapseFlow: (flowId: string) => void
  handleFlowLabelChange: (flowId: string, label: string) => void
  handleFlowFrequencyValueChange: (flowId: string, value: number) => void
  handleFlowFrequencyUnitChange: (flowId: string, value: FrequencyUnit) => void
  handleUserMessageChange: (flowId: string, value: string) => void
  handleStageKnobChange: (
    flowId: string,
    stageId: string,
    field: StageKnobField,
    value: number,
  ) => void
  handleStageSampleChange: (
    flowId: string,
    stageId: string,
    slotKey: string,
    value: string,
  ) => void
  applyPreset: (flowId: string, presetId: FlowPresetId) => void
  addStage: (flowId: string, kind: StageKind) => void
  removeStage: (flowId: string, stageId: string) => void
  moveStage: (flowId: string, stageId: string, direction: -1 | 1) => void
  estimateFlowFromSamples: (flowId: string) => Promise<void>
  loadFileInto: (
    flowId: string,
    event: ChangeEvent<HTMLInputElement>,
    apply: (contents: string) => void,
  ) => Promise<void>
}

export type UseFlows = FlowActions & {
  flows: ConversationFlowDraft[]
  flowFeedback: Record<string, FlowFeedback | undefined>
  collapsedFlows: Record<string, boolean>
}

export const useFlows = (): UseFlows => {
  const [flows, setFlows] = useState<ConversationFlowDraft[]>([
    createFlowFromPreset('user-first'),
  ])
  const [flowFeedback, setFlowFeedback] = useState<
    Record<string, FlowFeedback | undefined>
  >({})
  const [collapsedFlows, setCollapsedFlows] = useState<Record<string, boolean>>({})

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
      const { countTokens } = await import('../lib/tokenization')
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

  const addFlow = (presetId: FlowPresetId): void => {
    const preset = getPreset(presetId)
    setFlows((currentFlows) => [
      ...currentFlows,
      createFlowFromPreset(presetId, `${preset.name} ${currentFlows.length + 1}`),
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

  const toggleCollapseFlow = (flowId: string): void => {
    setCollapsedFlows((prev) => ({ ...prev, [flowId]: !prev[flowId] }))
  }

  return {
    flows,
    flowFeedback,
    collapsedFlows,
    addFlow,
    removeFlow,
    toggleCollapseFlow,
    handleFlowLabelChange,
    handleFlowFrequencyValueChange,
    handleFlowFrequencyUnitChange,
    handleUserMessageChange,
    handleStageKnobChange,
    handleStageSampleChange,
    applyPreset,
    addStage,
    removeStage,
    moveStage,
    estimateFlowFromSamples,
    loadFileInto,
  }
}
