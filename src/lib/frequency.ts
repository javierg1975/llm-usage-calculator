export type FrequencyUnit = 'day' | 'week' | 'month' | 'year'

export const FREQUENCY_UNITS: {
  id: FrequencyUnit
  label: string
  annualMultiplier: number
}[] = [
  { id: 'day', label: 'Day', annualMultiplier: 365 },
  { id: 'week', label: 'Week', annualMultiplier: 52 },
  { id: 'month', label: 'Month', annualMultiplier: 12 },
  { id: 'year', label: 'Year', annualMultiplier: 1 },
]

const getMultiplier = (unit: FrequencyUnit): number => {
  const found = FREQUENCY_UNITS.find((entry) => entry.id === unit)
  if (!found) {
    throw new Error(`Unsupported frequency unit: ${unit}`)
  }
  return found.annualMultiplier
}

export const toAnnualFrequency = (value: number, unit: FrequencyUnit): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Frequency value must be a non-negative finite number')
  }
  return value * getMultiplier(unit)
}

export const formatFrequencyPhrase = (value: number, unit: FrequencyUnit): string => {
  const normalized = Number.isFinite(value) ? value : 0
  return `${normalized} per ${unit}`
}
