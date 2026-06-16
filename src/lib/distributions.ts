import type { EngagementDistribution } from './types'

export const ENGAGEMENT_DISTRIBUTIONS: EngagementDistribution[] = [
  {
    id: 'mostly-quiet',
    name: 'Mostly quiet users',
    summary: 'Most users are infrequent; only a small minority are very active.',
    details:
      'Good for productivity tools where many users ask occasional questions and a few power users drive the majority of traffic.',
    segments: [
      {
        id: 'rare',
        label: 'Rare users',
        share: 0.65,
        multiplier: 0.2,
        description: 'Log in occasionally and ask very few questions.',
      },
      {
        id: 'light',
        label: 'Light users',
        share: 0.25,
        multiplier: 0.8,
        description: 'Use the assistant sporadically with short conversations.',
      },
      {
        id: 'active',
        label: 'Active users',
        share: 0.08,
        multiplier: 2,
        description: 'Use the assistant weekly and sustain longer chats.',
      },
      {
        id: 'power',
        label: 'Power users',
        share: 0.02,
        multiplier: 6,
        description: 'Heavy daily usage with long, multi-turn sessions.',
      },
    ],
  },
  {
    id: 'balanced-mix',
    name: 'Balanced mixed usage',
    summary: 'A broad mix of light, medium, and heavy users.',
    details:
      'Useful when adoption is steady and engagement is spread across teams rather than dominated by a tiny group.',
    segments: [
      {
        id: 'light',
        label: 'Light users',
        share: 0.5,
        multiplier: 0.4,
        description: 'Use short chats and low message volume.',
      },
      {
        id: 'standard',
        label: 'Standard users',
        share: 0.35,
        multiplier: 1,
        description: 'Follow the baseline workload assumptions.',
      },
      {
        id: 'heavy',
        label: 'Heavy users',
        share: 0.12,
        multiplier: 2.5,
        description: 'Multi-turn interactions are common.',
      },
      {
        id: 'power',
        label: 'Power users',
        share: 0.03,
        multiplier: 6,
        description: 'Very chatty users that contribute outsized load.',
      },
    ],
  },
  {
    id: 'power-user-heavy',
    name: 'Power-user heavy',
    summary:
      'A substantial share of users are high-engagement, with frequent long chats.',
    details:
      'Appropriate for internal copilots or analyst workflows where users repeatedly iterate with the model throughout the day.',
    segments: [
      {
        id: 'light',
        label: 'Light users',
        share: 0.35,
        multiplier: 0.5,
        description: 'Light usage with short interactions.',
      },
      {
        id: 'standard',
        label: 'Standard users',
        share: 0.4,
        multiplier: 1.5,
        description: 'Regular users with above-baseline usage.',
      },
      {
        id: 'heavy',
        label: 'Heavy users',
        share: 0.2,
        multiplier: 4,
        description: 'Frequent users with dense multi-turn sessions.',
      },
      {
        id: 'power',
        label: 'Power users',
        share: 0.05,
        multiplier: 10,
        description: 'Intensive daily users that dominate token volume.',
      },
    ],
  },
  {
    id: 'chatty-long-tail',
    name: 'Chatty long tail',
    summary:
      'Many users are light, but a long tail of very chatty users drives token demand.',
    details:
      'Suitable for customer-facing assistants where a minority of users engage in prolonged troubleshooting or research sessions.',
    segments: [
      {
        id: 'light',
        label: 'Light users',
        share: 0.7,
        multiplier: 0.3,
        description: 'Occasional questions and short chats.',
      },
      {
        id: 'regular',
        label: 'Regular users',
        share: 0.2,
        multiplier: 2,
        description: 'Consistent usage with medium conversation depth.',
      },
      {
        id: 'heavy',
        label: 'Heavy users',
        share: 0.08,
        multiplier: 8,
        description: 'Frequent, long conversations and deep follow-ups.',
      },
      {
        id: 'extreme',
        label: 'Extreme users',
        share: 0.02,
        multiplier: 25,
        description: 'Very high-volume users that strongly affect spend.',
      },
    ],
  },
]
