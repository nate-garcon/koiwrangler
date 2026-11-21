/**
 * Cart model. Pure data + maths, no DOM — index.js renders whatever this says.
 *
 * Totals:
 *   line      SUPPLIES[].price (dollars, integer in the data) -> cents * qty
 *   subtotal  sum of lines
 *   shipping  policy.js, parsed from SHOP_POLICY.shipping
 *   total     subtotal + shipping
 * Dropped off on a scheduled visit instead, shipping is nothing — that is
 * SHOP_POLICY.pickup, and the UI says so rather than quietly charging it.
 */
import { SUPPLIES } from '../data/supplies.js'
import { toCents, fmtCents } from './money.js'
import { shippingCentsFor, SHIP_FREE_OVER_CENTS, SHIP_FLAT_CENTS } from './policy.js'
import { loadCart, saveCart, clearCart } from './storage.js'

export const MAX_QTY = 99

export const supplyById = (id) => SUPPLIES.find((s) => s.id === id) || null

function clampQty(n) {
  const q = Math.floor(Number(n))
  if (!Number.isFinite(q)) return 1
  return Math.max(1, Math.min(MAX_QTY, q))
}

export function createCart(onChange) {
  /** @type {{id:string, qty:number}[]} */
  let items = loadCart()
    .map((it) => (it && supplyById(it.id) ? { id: it.id, qty: clampQty(it.qty) } : null))
    .filter(Boolean)
  // de-duplicate anything a stale draft may have doubled up
  const seen = new Map()
  for (const it of items) seen.set(it.id, clampQty((seen.get(it.id) || 0) + it.qty))
  items = [...seen].map(([id, qty]) => ({ id, qty }))

  function changed() {
    saveCart(items)
    onChange?.(api)
  }

  const api = {
    get items() {
      return items.map((i) => ({ ...i }))
    },

    count() {
      return items.reduce((n, i) => n + i.qty, 0)
    },

    qtyOf(id) {
      return items.find((i) => i.id === id)?.qty || 0
    },

    add(id, qty = 1) {
      if (!supplyById(id)) return
      const existing = items.find((i) => i.id === id)
      if (existing) existing.qty = clampQty(existing.qty + clampQty(qty))
      else items.push({ id, qty: clampQty(qty) })
      changed()
    },

    setQty(id, qty) {
      const existing = items.find((i) => i.id === id)
      if (!existing) return
      const q = Math.floor(Number(qty))
      if (Number.isFinite(q) && q <= 0) return api.remove(id)
      existing.qty = clampQty(q)
      changed()
    },

    remove(id) {
      items = items.filter((i) => i.id !== id)
      changed()
    },

    clear() {
      items = []
      clearCart()
      onChange?.(api)
    },

    /** Line items, in the order SUPPLIES declares them. */
    lines() {
      return SUPPLIES.filter((s) => items.some((i) => i.id === s.id)).map((s) => {
        const qty = api.qtyOf(s.id)
        const unitCents = toCents(s.price)
        return {
          id: s.id,
          name: s.name,
          size: s.size,
          emoji: s.emoji,
          icon: s.icon,
          qty,
          unitCents,
          lineCents: unitCents * qty,
        }
      })
    },

    totals() {
      const lines = api.lines()
      const subtotalCents = lines.reduce((n, l) => n + l.lineCents, 0)
      const shippingCents = shippingCentsFor(subtotalCents)
      const toFreeCents = Math.max(0, SHIP_FREE_OVER_CENTS - subtotalCents)
      return {
        lines,
        subtotalCents,
        shippingCents,
        totalCents: subtotalCents + shippingCents,
        freeShipping: subtotalCents > 0 && shippingCents === 0,
        toFreeCents,
        flatCents: SHIP_FLAT_CENTS,
        freeOverCents: SHIP_FREE_OVER_CENTS,
      }
    },

    /** Plain-text list, used for the booking notes and the email body. */
    text({ withTotals = true, withShipping = false } = {}) {
      const t = api.totals()
      if (!t.lines.length) return ''
      const rows = t.lines.map(
        (l) => `${l.qty} x ${l.name} (${l.size}) — ${fmtCents(l.lineCents)}`
      )
      if (!withTotals) return rows.join('\n')
      rows.push(`Subtotal: ${fmtCents(t.subtotalCents)}`)
      if (withShipping) {
        rows.push(
          `Shipping: ${
            t.freeShipping ? fmtCents(0) + ' (free over ' + fmtCents(t.freeOverCents) + ')' : fmtCents(t.shippingCents)
          }`
        )
        rows.push(`Total: ${fmtCents(t.totalCents)}`)
      }
      return rows.join('\n')
    },
  }

  return api
}
