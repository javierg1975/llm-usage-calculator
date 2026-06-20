import type { StageKind } from '../lib/conversationWorkflow'

// --- Stage component palette ----------------------------------------------
// Each stage kind declares its rate knobs and sample slots. Slot keys match the
// names the engine's combineFlowStages reads (gatePrompt, draftAnswer, …).

export type StageKnobField =
  | 'engageRatePercent'
  | 'judgePassRatePercent'
  | 'maxAnswerAttempts'

export type StageKnobDef = {
  field: StageKnobField
  label: string
  suffix?: string
  min: number
  max?: number
  step: number
}

export type StageSlotDef = {
  key: string
  label: string
  placeholder: string
  optional?: boolean
}

export type StageDef = {
  kind: StageKind
  name: string
  caption: string
  iconPath: string
  knobs: StageKnobDef[]
  slots: StageSlotDef[]
  // Seed averages so a freshly added stage yields a sensible estimate before
  // any samples are pasted. Overwritten by "Estimate workflow".
  defaultAverages: Record<string, number>
}

const ENGAGE_KNOB: StageKnobDef = {
  field: 'engageRatePercent',
  label: 'Engage rate after gate',
  suffix: '%',
  min: 0,
  max: 100,
  step: 0.1,
}
const PASS_KNOB: StageKnobDef = {
  field: 'judgePassRatePercent',
  label: 'Judge pass rate per attempt',
  suffix: '%',
  min: 0,
  max: 100,
  step: 0.1,
}
const ATTEMPTS_KNOB: StageKnobDef = {
  field: 'maxAnswerAttempts',
  label: 'Max answer attempts',
  min: 1,
  step: 1,
}

export const STAGE_DEFS: Record<StageKind, StageDef> = {
  opening: {
    kind: 'opening',
    name: 'Opening',
    caption: 'Assistant sends the first message',
    iconPath:
      'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
    knobs: [],
    slots: [
      {
        key: 'openingPrompt',
        label: 'Opening prompt (template)',
        placeholder: 'Prompt used to generate the initial outbound message.',
      },
      {
        key: 'openingMessage',
        label: 'Opening message',
        placeholder: 'Initial outbound message sample(s) sent before the user replies.',
      },
    ],
    defaultAverages: { openingPrompt: 300, openingMessage: 90 },
  },
  gate: {
    kind: 'gate',
    name: 'Gate',
    caption: 'Decide whether to engage (scales everything downstream)',
    iconPath:
      'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z',
    knobs: [ENGAGE_KNOB],
    slots: [
      {
        key: 'gatePrompt',
        label: 'Gate prompt (template only)',
        placeholder:
          'Prompt scaffolding that decides whether to engage. Leave out the user message — it is counted separately.',
      },
      {
        key: 'gateDecision',
        label: 'Gate decision output',
        placeholder: 'Optional examples like yes/no or classifier JSON.',
        optional: true,
      },
    ],
    defaultAverages: { gatePrompt: 220, gateDecision: 8 },
  },
  answerJudge: {
    kind: 'answerJudge',
    name: 'Answer → Judge',
    caption: 'Draft an answer, judge it, retry until it passes',
    iconPath:
      'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
    knobs: [PASS_KNOB, ATTEMPTS_KNOB],
    slots: [
      {
        key: 'answerPrompt',
        label: 'Answer prompt (template only)',
        placeholder:
          'Prompt scaffolding used to answer. Leave out the user message — it is counted separately.',
      },
      {
        key: 'draftAnswer',
        label: 'Draft LLM answer',
        placeholder: 'Candidate answers from the model.',
      },
      {
        key: 'judgePrompt',
        label: 'Judge prompt (template only)',
        placeholder:
          'LLM-as-a-judge scaffolding. Leave out the answer/message — they are counted separately.',
      },
      {
        key: 'judgeDecision',
        label: 'Judge decision output',
        placeholder: 'Optional pass/fail outputs or score JSON.',
        optional: true,
      },
    ],
    defaultAverages: {
      answerPrompt: 520,
      draftAnswer: 260,
      judgePrompt: 340,
      judgeDecision: 14,
    },
  },
  call: {
    kind: 'call',
    name: 'LLM call',
    caption: 'A generic single call (prompt → response)',
    iconPath:
      'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    knobs: [],
    slots: [
      {
        key: 'callPrompt',
        label: 'Prompt (template only)',
        placeholder:
          'Prompt scaffolding for this call. Leave out the user message — it is counted separately.',
      },
      {
        key: 'callResponse',
        label: 'Response output',
        placeholder: 'Sample model responses for this call.',
      },
    ],
    defaultAverages: { callPrompt: 300, callResponse: 200 },
  },
}

export const STAGE_KINDS: StageKind[] = ['opening', 'gate', 'answerJudge', 'call']

export const getStageDef = (kind: StageKind): StageDef => STAGE_DEFS[kind]
