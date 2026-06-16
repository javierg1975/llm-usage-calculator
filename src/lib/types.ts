export type ModelPricing = {
  id: string
  name: string
  inputCostPerMillion: number
  outputCostPerMillion: number
  source: string
}

export type EngagementSegment = {
  id: string
  label: string
  share: number
  multiplier: number
  description: string
}

export type EngagementDistribution = {
  id: string
  name: string
  summary: string
  details: string
  segments: EngagementSegment[]
}

export type WorkloadRowInput = {
  id: string
  label: string
  promptsPerConversation: number
  averagePromptTokens: number
  userMessagesPerConversation: number
  averageUserMessageTokens: number
  llmResponsesPerConversation: number
  averageLlmResponseTokens: number
  conversationsPerUserPerYear: number
}
