/**
 * Money helpers for the shop. Same rule as the booking side: integer cents
 * everywhere, dollars only at the edges, formatUSD does the formatting so the
 * two widgets cannot drift apart visually.
 */
import { formatUSD } from '../data/services.js'

export function toCents(dollars) {
  const n = Number(dollars)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function fmtCents(cents) {
  if (cents == null || !Number.isFinite(cents)) return formatUSD(null)
  if (cents % 100 === 0) return formatUSD(cents / 100)
  return '$' + (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
