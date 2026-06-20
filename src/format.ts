// Shared number formatters used across the UI.
export const tokenFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})
export const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
export const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})
export const decimalFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const formatTokens = (value: number): string =>
  tokenFormatter.format(Math.round(value))
