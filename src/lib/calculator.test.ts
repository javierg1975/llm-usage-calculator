import { describe, expect, it } from 'vitest'
import {
  allocateUsersAcrossSegments,
  calculateAnnualBudget,
  calculateBaseTokensPerUser,
} from './calculator'
import { ENGAGEMENT_DISTRIBUTIONS } from './distributions'
import type {
  EngagementDistribution,
  ModelPricing,
  WorkloadRowInput,
} from './types'

const testModel: ModelPricing = {
  id: 'test-model',
  name: 'Test Model',
  inputCostPerMillion: 2,
  outputCostPerMillion: 8,
  source: 'https://example.com',
}

const testDistribution: EngagementDistribution = {
  id: 'test-distribution',
  name: 'Test Distribution',
  summary: 'For unit tests',
  details: 'For unit tests',
  segments: [
    {
      id: 'a-segment',
      label: 'Segment A',
      share: 0.5,
      multiplier: 0.5,
      description: 'A',
    },
    {
      id: 'b-segment',
      label: 'Segment B',
      share: 0.3,
      multiplier: 1.2,
      description: 'B',
    },
    {
      id: 'c-segment',
      label: 'Segment C',
      share: 0.2,
      multiplier: 3,
      description: 'C',
    },
  ],
}

const baselineWorkload: WorkloadRowInput = {
  id: 'row-1',
  label: 'Core',
  promptsPerConversation: 1,
  averagePromptTokens: 100,
  userMessagesPerConversation: 2,
  averageUserMessageTokens: 50,
  llmResponsesPerConversation: 2,
  averageLlmResponseTokens: 120,
  conversationsPerUserPerYear: 10,
}

describe('allocateUsersAcrossSegments', () => {
  it('distributes users by share and preserves total users', () => {
    const allocations = allocateUsersAcrossSegments(100, testDistribution)
    expect(allocations.map((item) => item.users)).toEqual([50, 30, 20])
    expect(allocations.reduce((sum, item) => sum + item.users, 0)).toBe(100)
  })

  it('uses largest remainder allocation for non-even splits', () => {
    const allocations = allocateUsersAcrossSegments(7, testDistribution)
    expect(allocations.map((item) => item.users)).toEqual([4, 2, 1])
  })

  it('allocates small populations without dropping users', () => {
    const allocations = allocateUsersAcrossSegments(1, testDistribution)
    expect(allocations.map((item) => item.users)).toEqual([1, 0, 0])
  })

  it('returns zero users for each segment when annualUsers is zero', () => {
    const allocations = allocateUsersAcrossSegments(0, testDistribution)
    expect(allocations.map((item) => item.users)).toEqual([0, 0, 0])
  })

  it('throws when annualUsers is not an integer', () => {
    expect(() => allocateUsersAcrossSegments(100.5, testDistribution)).toThrow(
      'annualUsers must be an integer',
    )
  })

  it('throws when distribution shares do not sum to 1', () => {
    const invalidDistribution: EngagementDistribution = {
      ...testDistribution,
      id: 'bad-share-sum',
      segments: [
        { ...testDistribution.segments[0], share: 0.4 },
        { ...testDistribution.segments[1], share: 0.3 },
        { ...testDistribution.segments[2], share: 0.2 },
      ],
    }
    expect(() => allocateUsersAcrossSegments(50, invalidDistribution)).toThrow(
      'distribution shares must sum to 1',
    )
  })

  it('throws when a segment share is negative', () => {
    const invalidDistribution: EngagementDistribution = {
      ...testDistribution,
      id: 'negative-share',
      segments: [
        { ...testDistribution.segments[0], share: -0.1 },
        { ...testDistribution.segments[1], share: 0.7 },
        { ...testDistribution.segments[2], share: 0.4 },
      ],
    }
    expect(() => allocateUsersAcrossSegments(50, invalidDistribution)).toThrow(
      'must be a non-negative finite number',
    )
  })

  it('throws when a distribution has no segments', () => {
    const invalidDistribution: EngagementDistribution = {
      ...testDistribution,
      id: 'no-segments',
      segments: [],
    }
    expect(() => allocateUsersAcrossSegments(50, invalidDistribution)).toThrow(
      'distribution must have at least one segment',
    )
  })
})

describe('calculateBaseTokensPerUser', () => {
  it('calculates input and output tokens for one workload', () => {
    const result = calculateBaseTokensPerUser([baselineWorkload])
    expect(result.inputTokens).toBe(2000)
    expect(result.outputTokens).toBe(2400)
    expect(result.totalTokens).toBe(4400)
  })

  it('sums multiple workloads', () => {
    const secondWorkload: WorkloadRowInput = {
      ...baselineWorkload,
      id: 'row-2',
      promptsPerConversation: 2,
      averagePromptTokens: 40,
      userMessagesPerConversation: 3,
      averageUserMessageTokens: 30,
      llmResponsesPerConversation: 3,
      averageLlmResponseTokens: 80,
      conversationsPerUserPerYear: 5,
    }
    const result = calculateBaseTokensPerUser([baselineWorkload, secondWorkload])
    expect(result.inputTokens).toBe(2000 + 850)
    expect(result.outputTokens).toBe(2400 + 1200)
    expect(result.totalTokens).toBe(6450)
  })

  it('returns zero tokens for an empty workload list', () => {
    const result = calculateBaseTokensPerUser([])
    expect(result).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })
  })

  it('throws for negative workload values', () => {
    const invalid: WorkloadRowInput = {
      ...baselineWorkload,
      averagePromptTokens: -1,
    }
    expect(() => calculateBaseTokensPerUser([invalid])).toThrow(
      'must be a non-negative finite number',
    )
  })
})

describe('calculateAnnualBudget', () => {
  it('computes annual budget with expected totals', () => {
    const result = calculateAnnualBudget({
      annualUsers: 100,
      model: testModel,
      distribution: testDistribution,
      workloads: [baselineWorkload],
    })

    expect(result.basePerUserTokenSummary.inputTokens).toBe(2000)
    expect(result.basePerUserTokenSummary.outputTokens).toBe(2400)

    expect(result.tokenSummary.inputTokens).toBe(242000)
    expect(result.tokenSummary.outputTokens).toBe(290400)
    expect(result.tokenSummary.totalTokens).toBe(532400)

    expect(result.costSummary.inputCost).toBeCloseTo(0.484, 8)
    expect(result.costSummary.outputCost).toBeCloseTo(2.3232, 8)
    expect(result.costSummary.totalCost).toBeCloseTo(2.8072, 8)
  })

  it('returns zero cost when annualUsers is zero', () => {
    const result = calculateAnnualBudget({
      annualUsers: 0,
      model: testModel,
      distribution: testDistribution,
      workloads: [baselineWorkload],
    })
    expect(result.tokenSummary.totalTokens).toBe(0)
    expect(result.costSummary.totalCost).toBe(0)
    expect(result.segments.every((segment) => segment.users === 0)).toBe(true)
  })

  it('returns zero cost when all workload usage is zero', () => {
    const zeroWorkload: WorkloadRowInput = {
      ...baselineWorkload,
      promptsPerConversation: 0,
      averagePromptTokens: 0,
      userMessagesPerConversation: 0,
      averageUserMessageTokens: 0,
      llmResponsesPerConversation: 0,
      averageLlmResponseTokens: 0,
      conversationsPerUserPerYear: 0,
    }
    const result = calculateAnnualBudget({
      annualUsers: 1000,
      model: testModel,
      distribution: testDistribution,
      workloads: [zeroWorkload],
    })
    expect(result.costSummary.totalCost).toBe(0)
    expect(result.tokenSummary.totalTokens).toBe(0)
  })

  it('throws when model has negative pricing', () => {
    const invalidModel: ModelPricing = {
      ...testModel,
      inputCostPerMillion: -1,
    }
    expect(() =>
      calculateAnnualBudget({
        annualUsers: 100,
        model: invalidModel,
        distribution: testDistribution,
        workloads: [baselineWorkload],
      }),
    ).toThrow('must be a non-negative finite number')
  })

  it('supports decimal token averages', () => {
    const decimalWorkload: WorkloadRowInput = {
      ...baselineWorkload,
      averagePromptTokens: 100.25,
      averageUserMessageTokens: 50.5,
      averageLlmResponseTokens: 120.75,
      conversationsPerUserPerYear: 1.5,
    }

    const result = calculateAnnualBudget({
      annualUsers: 10,
      model: testModel,
      distribution: testDistribution,
      workloads: [decimalWorkload],
    })
    expect(result.tokenSummary.totalTokens).toBeGreaterThan(0)
    expect(result.costSummary.totalCost).toBeGreaterThan(0)
  })

  it('applies distribution multipliers to each segment', () => {
    const result = calculateAnnualBudget({
      annualUsers: 100,
      model: testModel,
      distribution: testDistribution,
      workloads: [baselineWorkload],
    })
    const [segmentA, segmentB, segmentC] = result.segments
    expect(segmentA.multiplier).toBe(0.5)
    expect(segmentB.multiplier).toBe(1.2)
    expect(segmentC.multiplier).toBe(3)
    expect(segmentC.costSummary.totalCost).toBeGreaterThan(
      segmentA.costSummary.totalCost,
    )
  })

  it('computes weighted average multiplier from selected distribution', () => {
    const result = calculateAnnualBudget({
      annualUsers: 100,
      model: testModel,
      distribution: testDistribution,
      workloads: [baselineWorkload],
    })
    expect(result.averageMultiplier).toBeCloseTo(1.21, 8)
  })

  it('builds results for every predefined distribution profile', () => {
    ENGAGEMENT_DISTRIBUTIONS.forEach((distribution) => {
      const result = calculateAnnualBudget({
        annualUsers: 1500,
        model: testModel,
        distribution,
        workloads: [baselineWorkload],
      })
      expect(result.segments.length).toBe(distribution.segments.length)
      expect(result.segments.reduce((sum, segment) => sum + segment.users, 0)).toBe(
        1500,
      )
      expect(result.costSummary.totalCost).toBeGreaterThanOrEqual(0)
    })
  })
})
