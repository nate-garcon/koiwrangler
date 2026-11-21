/**
 * Money helpers. ALL arithmetic in this feature happens in integer cents so a
 * total can never render as $1,234.5600000001. Dollars only ever appear at the
 * edges: coming in from src/data (integers) and going out through formatUSD.
 */
import { formatUSD } from '../data/services.js'

/** dollars -> integer cents */
export function toCents(dollars) {
  const n = Number(dollars)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/**
 * integer cents -> display string, matching formatUSD's style ("$1,234").
 * null => formatUSD's own "Custom quote" wording, so there is one source of truth.
 * Fractional cents (only ever possible on travel) render with 2 decimals.
 */
export function fmtCents(cents) {
  if (cents == null || !Number.isFinite(cents)) return formatUSD(null)
  if (cents % 100 === 0) return formatUSD(cents / 100)
  return '$' + (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
