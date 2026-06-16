import type {
  EngagementDistribution,
  EngagementSegment,
  ModelPricing,
  WorkloadRowInput,
} from './types'

const TOKENS_PER_MILLION = 1_000_000
const EPSILON = 0.0001

const assertNonNegativeFinite = (field: string, value: number): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number`)
  }
}

const assertDistributionIsValid = (distribution: EngagementDistribution): void => {
  if (distribution.segments.length === 0) {
    throw new Error('distribution must have at least one segment')
  }

  let shareSum = 0
  distribution.segments.forEach((segment) => {
    assertNonNegativeFinite(`${segment.label} share`, segment.share)
    assertNonNegativeFinite(`${segment.label} multiplier`, segment.multiplier)
    shareSum += segment.share
  })

  if (Math.abs(shareSum - 1) > EPSILON) {
    throw new Error('distribution shares must sum to 1')
  }
}

const assertModelIsValid = (model: ModelPricing): void => {
  assertNonNegativeFinite('inputCostPerMillion', model.inputCostPerMillion)
  assertNonNegativeFinite('outputCostPerMillion', model.outputCostPerMillion)
}

const assertWorkloadIsValid = (row: WorkloadRowInput): void => {
  assertNonNegativeFinite('promptsPerConversation', row.promptsPerConversation)
  assertNonNegativeFinite('averagePromptTokens', row.averagePromptTokens)
  assertNonNegativeFinite(
    'userMessagesPerConversation',
    row.userMessagesPerConversation,
  )
  assertNonNegativeFinite('averageUserMessageTokens', row.averageUserMessageTokens)
  assertNonNegativeFinite(
    'llmResponsesPerConversation',
    row.llmResponsesPerConversation,
  )
  assertNonNegativeFinite('averageLlmResponseTokens', row.averageLlmResponseTokens)
  assertNonNegativeFinite(
    'conversationsPerUserPerYear',
    row.conversationsPerUserPerYear,
  )
}

export type UserAllocation = {
  segment: EngagementSegment
  users: number
}

export type TokenSummary = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type CostSummary = {
  inputCost: number
  outputCost: number
  totalCost: number
}

export type SegmentBudget = {
  segmentId: string
  segmentLabel: string
  description: string
  share: number
  multiplier: number
  users: number
  tokenSummary: TokenSummary
  costSummary: CostSummary
}

export type AnnualBudgetResult = {
  annualUsers: number
  averageMultiplier: number
  modelName: string
  tokenSummary: TokenSummary
  costSummary: CostSummary
  basePerUserTokenSummary: TokenSummary
  segments: SegmentBudget[]
}

export type AnnualBudgetRequest = {
  annualUsers: number
  model: ModelPricing
  distribution: EngagementDistribution
  workloads: WorkloadRowInput[]
}

export const allocateUsersAcrossSegments = (
  annualUsers: number,
  distribution: EngagementDistribution,
): UserAllocation[] => {
  assertNonNegativeFinite('annualUsers', annualUsers)
  if (!Number.isInteger(annualUsers)) {
    throw new Error('annualUsers must be an integer')
  }
  assertDistributionIsValid(distribution)

  const rawAllocations = distribution.segments.map((segment) => ({
    segment,
    rawUsers: segment.share * annualUsers,
  }))

  const flooredAllocations = rawAllocations.map((allocation) => ({
    ...allocation,
    users: Math.floor(allocation.rawUsers),
    fractionalRemainder: allocation.rawUsers - Math.floor(allocation.rawUsers),
  }))

  let allocatedUsers = flooredAllocations.reduce(
    (sum, allocation) => sum + allocation.users,
    0,
  )
  const usersToDistribute = annualUsers - allocatedUsers

  if (usersToDistribute > 0) {
    const sortedByRemainder = [...flooredAllocations].sort((a, b) => {
      if (b.fractionalRemainder !== a.fractionalRemainder) {
        return b.fractionalRemainder - a.fractionalRemainder
      }
      return a.segment.id.localeCompare(b.segment.id)
    })

    for (let i = 0; i < usersToDistribute; i += 1) {
      sortedByRemainder[i % sortedByRemainder.length].users += 1
      allocatedUsers += 1
    }
  }

  if (allocatedUsers !== annualUsers) {
    throw new Error('unable to allocate users across segments')
  }

  return flooredAllocations.map((allocation) => ({
    segment: allocation.segment,
    users: allocation.users,
  }))
}

export const calculateBaseTokensPerUser = (
  workloads: WorkloadRowInput[],
): TokenSummary => {
  let inputTokens = 0
  let outputTokens = 0

  workloads.forEach((row) => {
    assertWorkloadIsValid(row)
    const perConversationInputTokens =
      row.promptsPerConversation * row.averagePromptTokens +
      row.userMessagesPerConversation * row.averageUserMessageTokens
    const perConversationOutputTokens =
      row.llmResponsesPerConversation * row.averageLlmResponseTokens

    inputTokens += row.conversationsPerUserPerYear * perConversationInputTokens
    outputTokens += row.conversationsPerUserPerYear * perConversationOutputTokens
  })

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  }
}

export const calculateAnnualBudget = (
  request: AnnualBudgetRequest,
): AnnualBudgetResult => {
  assertModelIsValid(request.model)
  const allocations = allocateUsersAcrossSegments(
    request.annualUsers,
    request.distribution,
  )
  const basePerUserTokenSummary = calculateBaseTokensPerUser(request.workloads)

  const segments = allocations.map((allocation) => {
    const engagementFactor = allocation.users * allocation.segment.multiplier
    const inputTokens = basePerUserTokenSummary.inputTokens * engagementFactor
    const outputTokens = basePerUserTokenSummary.outputTokens * engagementFactor
    const inputCost =
      (inputTokens / TOKENS_PER_MILLION) * request.model.inputCostPerMillion
    const outputCost =
      (outputTokens / TOKENS_PER_MILLION) * request.model.outputCostPerMillion

    return {
      segmentId: allocation.segment.id,
      segmentLabel: allocation.segment.label,
      description: allocation.segment.description,
      share: allocation.segment.share,
      multiplier: allocation.segment.multiplier,
      users: allocation.users,
      tokenSummary: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      costSummary: {
        inputCost,
        outputCost,
        totalCost: inputCost + outputCost,
      },
    }
  })

  const totalInputTokens = segments.reduce(
    (sum, segment) => sum + segment.tokenSummary.inputTokens,
    0,
  )
  const totalOutputTokens = segments.reduce(
    (sum, segment) => sum + segment.tokenSummary.outputTokens,
    0,
  )
  const totalInputCost = segments.reduce(
    (sum, segment) => sum + segment.costSummary.inputCost,
    0,
  )
  const totalOutputCost = segments.reduce(
    (sum, segment) => sum + segment.costSummary.outputCost,
    0,
  )
  const averageMultiplier = segments.reduce(
    (sum, segment) => sum + segment.share * segment.multiplier,
    0,
  )

  return {
    annualUsers: request.annualUsers,
    averageMultiplier,
    modelName: request.model.name,
    tokenSummary: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
    },
    costSummary: {
      inputCost: totalInputCost,
      outputCost: totalOutputCost,
      totalCost: totalInputCost + totalOutputCost,
    },
    basePerUserTokenSummary,
    segments,
  }
}
