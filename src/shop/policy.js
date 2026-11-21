/**
 * Shipping terms. SHOP_POLICY.shipping is the single source of truth and is
 * always shown to the customer verbatim; these two numbers are parsed straight
 * out of that sentence so editing the sentence changes the maths with it.
 * The fallbacks only matter if the wording stops naming figures at all.
 */
import { SHOP_POLICY } from '../data/supplies.js'

function centsFrom(re, fallbackCents) {
  const m = re.exec(SHOP_POLICY.shipping || '')
  if (!m) return fallbackCents
  const n = Number(String(m[1]).replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : fallbackCents
}

/** "Flat $9 statewide shipping" -> 900 */
export const SHIP_FLAT_CENTS = centsFrom(/flat\s*\$\s*([\d,.]+)/i, 900)

/** "or free over $125" -> 12500 */
export const SHIP_FREE_OVER_CENTS = centsFrom(/free\s*(?:over|above|from|on orders over)\s*\$\s*([\d,.]+)/i, 12500)

/**
 * Shipping for a given goods subtotal.
 * An empty cart ships for nothing. At or above the free threshold it is free —
 * "over $125" is read in the customer's favour at exactly $125 rather than
 * charging $9 for being a cent short.
 */
export function shippingCentsFor(subtotalCents) {
  if (!subtotalCents) return 0
  return subtotalCents >= SHIP_FREE_OVER_CENTS ? 0 : SHIP_FLAT_CENTS
}
