type TokenCounter = (text: string) => number

type StructuredValue = null | boolean | number | string | StructuredValue[] | {
  [key: string]: StructuredValue
}

const normalize = (value: string): string => value.trim()

const nonEmpty = (value: string): boolean => value.length > 0

const splitByLines = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map(normalize)
    .filter(nonEmpty)

const extractFromStructuredValue = (value: StructuredValue): string[] => {
  if (typeof value === 'string') {
    const normalized = normalize(value)
    return normalized.length > 0 ? [normalized] : []
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return []
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractFromStructuredValue(entry))
  }

  const prioritizedKeys = [
    'content',
    'text',
    'prompt',
    'message',
    'response',
    'prompts',
    'messages',
    'responses',
    'input',
    'output',
  ]
  const ignoredKeys = new Set([
    'role',
    'name',
    'id',
    'created_at',
    'timestamp',
    'tool_call_id',
    'metadata',
  ])
  const entries: string[] = []
  const usedKeys = new Set<string>()

  for (const key of prioritizedKeys) {
    if (Object.hasOwn(value, key)) {
      usedKeys.add(key)
      entries.push(...extractFromStructuredValue(value[key]))
    }
  }
  for (const [key, nested] of Object.entries(value)) {
    if (!usedKeys.has(key) && !ignoredKeys.has(key)) {
      entries.push(...extractFromStructuredValue(nested))
    }
  }

  return entries
}

export const parseSampleTextEntries = (raw: string): string[] => {
  const normalizedRaw = raw.trim()
  if (normalizedRaw.length === 0) {
    return []
  }

  try {
    const parsed = JSON.parse(normalizedRaw) as StructuredValue
    const structuredEntries = extractFromStructuredValue(parsed)
    if (structuredEntries.length > 0) {
      return structuredEntries
    }
  } catch {
    // Not JSON; fallback to newline parsing below.
  }

  return splitByLines(normalizedRaw)
}

export type SampleMessageStats = {
  entries: string[]
  count: number
  totalTokens: number
  averageTokens: number
}

export const summarizeSampleText = (
  raw: string,
  countTokens: TokenCounter,
): SampleMessageStats => {
  const entries = parseSampleTextEntries(raw)
  const totalTokens = entries.reduce((sum, entry) => sum + countTokens(entry), 0)
  return {
    entries,
    count: entries.length,
    totalTokens,
    averageTokens: entries.length > 0 ? totalTokens / entries.length : 0,
  }
}

export type DerivedWorkloadMetrics = {
  promptsPerConversation: number
  averagePromptTokens: number
  userMessagesPerConversation: number
  averageUserMessageTokens: number
  llmResponsesPerConversation: number
  averageLlmResponseTokens: number
}

export const deriveMetricsFromSamples = (
  promptsText: string,
  userMessagesText: string,
  llmResponsesText: string,
  countTokens: TokenCounter,
): DerivedWorkloadMetrics => {
  const promptStats = summarizeSampleText(promptsText, countTokens)
  const userMessageStats = summarizeSampleText(userMessagesText, countTokens)
  const llmResponseStats = summarizeSampleText(llmResponsesText, countTokens)

  const hasAnySamples =
    promptStats.count > 0 || userMessageStats.count > 0 || llmResponseStats.count > 0
  if (!hasAnySamples) {
    throw new Error(
      'No sample text found. Paste or upload at least one prompt, user message, or LLM response.',
    )
  }

  return {
    promptsPerConversation: promptStats.count,
    averagePromptTokens: promptStats.averageTokens,
    userMessagesPerConversation: userMessageStats.count,
    averageUserMessageTokens: userMessageStats.averageTokens,
    llmResponsesPerConversation: llmResponseStats.count,
    averageLlmResponseTokens: llmResponseStats.averageTokens,
  }
}
