/**
 * THE QUOTE MATH. Every number here traces back to src/data/services.js.
 *
 * How a total is built:
 *   1. Main job      priceFor(primary, size)            -> basePrice * size.multiplier, rounded to $5 by priceFor
 *   2. Each add-on   priceFor(addon, size)              -> same rule
 *   3. Travel        max(0, miles - TRAVEL.freeRadiusMiles) * 2 (round trip) * TRAVEL.perMile
 *   4. Buckets       services with unit 'month' are kept OUT of the one-off
 *                    total and reported separately, because adding a monthly
 *                    retainer to a one-off clean would be a lie.
 *   5. One-off due   step 1 + step 2 + travel
 *
 * Three modes:
 *   'fixed'      every selected line has a price -> show the total.
 *   'custom'     the pond size bucket has multiplier === null (or any line
 *                comes back null) -> priceFor() cannot price it, so NO totals
 *                are shown at all; it becomes a site visit + written quote.
 *   'emergency'  the emergency toggle is on -> the figure is a floor, not a
 *                total, because labour is hourly (HOURLY_LABOUR).
 */
import {
  SERVICES,
  POND_SIZES,
  TRAVEL,
  HOURLY_LABOUR,
  priceFor,
  formatUSD,
} from '../data/services.js'
import { fmtCents, toCents } from './money.js'

export const serviceById = (id) => SERVICES.find((s) => s.id === id) || null
export const sizeByKey = (key) => POND_SIZES.find((p) => p.key === key) || null
/** The data marks the emergency offering with `urgent: true` — never hardcode its id. */
export const urgentService = () => SERVICES.find((s) => s.urgent) || null

export const UNIT_SUFFIX = {
  visit: 'per visit',
  month: 'per month',
  hour: 'per hour',
  flat: 'flat',
}

export function unitSuffix(unit) {
  return UNIT_SUFFIX[unit] || ''
}

/** Price label for a service card, e.g. "$426 per visit" or "Custom quote". */
export function priceLabel(serviceId, sizeKey) {
  const price = priceFor(serviceId, sizeKey)
  if (price == null) return formatUSD(null)
  const svc = serviceById(serviceId)
  const suffix = unitSuffix(svc?.unit)
  return suffix ? `${formatUSD(price)} ${suffix}` : formatUSD(price)
}

/**
 * Travel line. `miles` is the one-way distance from base the customer gave us.
 * The first TRAVEL.freeRadiusMiles are free; everything past that is charged
 * ROUND TRIP, so the billable distance is doubled.
 */
export function travelFor(miles) {
  const n = Number(String(miles ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) {
    return { given: Number.isFinite(n), miles: Number.isFinite(n) ? n : null, billable: 0, cents: 0 }
  }
  const billable = Math.max(0, n - TRAVEL.freeRadiusMiles)
  // integer cents per mile (0.65 -> 65), doubled for the return leg
  const cents = Math.round(billable * 2 * toCents(TRAVEL.perMile))
  return { given: true, miles: n, billable, cents }
}

/** Ordered, de-duplicated list of selected service ids: main job first, then
 *  add-ons in the order SERVICES declares them (stable, not click order). */
export function selectedIds(state) {
  const ids = []
  if (serviceById(state.primary)) ids.push(state.primary)
  for (const svc of SERVICES) {
    if (svc.id === state.primary) continue
    if ((state.addons || []).includes(svc.id)) ids.push(svc.id)
  }
  return ids
}

export function computeQuote(state) {
  const size = sizeByKey(state.size)
  const urgent = urgentService()
  const emergencyOn = state.emergency === true || (urgent && state.primary === urgent.id)

  const items = selectedIds(state).map((id) => {
    const svc = serviceById(id)
    const price = priceFor(id, state.size)
    return {
      id,
      name: svc.name,
      unit: svc.unit,
      isPrimary: id === state.primary,
      cents: price == null ? null : toCents(price),
    }
  })

  const travel = travelFor(state.miles)

  let oneOffCents = 0
  let monthlyCents = 0
  let unpriced = false
  for (const item of items) {
    if (item.cents == null) {
      unpriced = true
      continue
    }
    if (item.unit === 'month') monthlyCents += item.cents
    else oneOffCents += item.cents
  }
  // Travel is per visit, so it belongs with the one-off money.
  oneOffCents += travel.cents

  const sizeIsCustom = !!size && size.multiplier === null
  const mode = sizeIsCustom || unpriced ? 'custom' : emergencyOn ? 'emergency' : 'fixed'

  const monthlyNames = items.filter((i) => i.unit === 'month').map((i) => i.name)

  return {
    mode,
    size,
    items,
    travel,
    oneOffCents,
    monthlyCents,
    hasMonthly: monthlyCents > 0,
    monthlyNames,
    emergencyOn,
    urgent,
    // The emergency call-out is only part of the figure when it IS the job the
    // customer picked; otherwise we quote the normal work and spell out the
    // alternative terms rather than silently stacking a call-out fee on top.
    emergencyIsPrimary: !!urgent && state.primary === urgent.id,
    emergencyCalloutCents: urgent ? toCents(urgent.basePrice) : null,
    hourlyCents: toCents(HOURLY_LABOUR),
    totalLabel: mode === 'emergency' ? 'Starts at' : 'Due at the visit',
  }
}

/* ---------- rendering ---------- */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function travelRowLabel(travel) {
  if (!travel.given || travel.miles == null)
    return `Travel — add your distance in step 3`
  if (travel.billable <= 0)
    return `Travel — inside the first ${TRAVEL.freeRadiusMiles} free miles`
  const mi = Number(travel.billable.toFixed(2))
  return `Travel — ${mi} mi past the first ${TRAVEL.freeRadiusMiles}, round trip`
}

/**
 * Paints the quote panel. `refs` are the persistent elements created once in
 * steps.js, so the live region element itself is never replaced (replacing it
 * stops screen readers announcing).
 */
export function renderQuote(refs, state) {
  const q = computeQuote(state)
  const showMoney = q.mode !== 'custom'

  /* --- line items --- */
  const rows = []
  if (!q.items.length) {
    rows.push(
      `<li class="bk-q__row bk-q__row--empty"><span>Nothing picked yet</span><span>—</span></li>`
    )
  }
  for (const item of q.items) {
    const suffix = unitSuffix(item.unit)
    const tag = item.isPrimary ? '' : ' <span class="bk-q__add">add-on</span>'
    rows.push(
      `<li class="bk-q__row"><span class="bk-q__lbl">${esc(item.name)}${tag}` +
        (suffix ? ` <span class="bk-q__unit">${esc(suffix)}</span>` : '') +
        `</span><span class="bk-q__amt">${esc(fmtCents(item.cents))}</span></li>`
    )
  }
  rows.push(
    `<li class="bk-q__row bk-q__row--travel"><span class="bk-q__lbl">${esc(
      travelRowLabel(q.travel)
    )}</span><span class="bk-q__amt">${esc(
      q.travel.given ? fmtCents(q.travel.cents) : '—'
    )}</span></li>`
  )
  refs.lines.innerHTML = rows.join('')

  /* --- the live total block --- */
  if (showMoney) {
    refs.totalWrap.hidden = false
    refs.totalLabel.textContent = q.totalLabel
    refs.totalAmount.textContent = fmtCents(q.oneOffCents)
    if (q.hasMonthly) {
      refs.monthly.hidden = false
      refs.monthly.textContent =
        `Then ${fmtCents(q.monthlyCents)} per month for ${q.monthlyNames.join(' and ')} — ` +
        `that is an ongoing monthly figure, not a one-off, and you can stop any time.`
    } else {
      refs.monthly.hidden = true
      refs.monthly.textContent = ''
    }
  } else {
    refs.totalWrap.hidden = true
    refs.monthly.hidden = true
    refs.monthly.textContent = ''
  }

  /* --- mode note --- */
  const notes = []
  if (q.mode === 'custom') {
    const label = q.size ? q.size.label : 'that'
    const gallons = q.size ? ` (${q.size.gallons})` : ''
    notes.push(
      `<strong>No total yet, on purpose.</strong> Ponds in the ${esc(label)} bracket${esc(
        gallons
      )} are too big to price sight unseen, so this gets a site visit and a written quote instead. ` +
        `Fill the rest in and that is exactly what you will get — the figures above stay blank until I have seen it.`
    )
  }
  if (q.mode === 'emergency' || q.emergencyOn) {
    const callout = fmtCents(q.emergencyCalloutCents)
    const hourly = fmtCents(q.hourlyCents)
    if (q.emergencyIsPrimary) {
      notes.push(
        `<strong>Emergency terms.</strong> ${esc(callout)} call-out plus ${esc(
          hourly
        )} an hour on site. The figure above is where it starts, not where it ends — ` +
          `an emergency total cannot honestly be fixed in advance, so you get told the running total before I start and as I go.`
      )
    } else {
      notes.push(
        `<strong>Marked urgent.</strong> If this turns out to be an emergency call-out rather than booked work, ` +
          `it is priced ${esc(callout)} call-out plus ${esc(
            hourly
          )} an hour instead of the fixed price above, and that total cannot be fixed in advance. ` +
          `I will tell you which one it is before I start anything.`
      )
    }
  }
  refs.note.innerHTML = notes.map((n) => `<p class="bk-q__note">${n}</p>`).join('')
  refs.note.hidden = notes.length === 0

  /* --- collapsed mobile summary --- */
  refs.summaryAmount.textContent = showMoney ? fmtCents(q.oneOffCents) : formatUSD(null)

  return q
}
