/**
 * Turns the finished form into (a) the payload a real backend would receive,
 * (b) a human-readable summary for the success panel, and (c) a mailto: link
 * so the customer can actually send it today, while there is no backend.
 */
import { POND_SIZES, TRAVEL, HOURLY_LABOUR, formatUSD } from '../data/services.js'
import { BRAND } from '../data/content.js'
import { fmtCents } from './money.js'
import { computeQuote, unitSuffix } from './quote.js'

const TIME_LABEL = { morning: 'Morning', afternoon: 'Afternoon', either: 'Either is fine' }

export function buildPayload(state) {
  const q = computeQuote(state)
  const size = POND_SIZES.find((p) => p.key === state.size) || null
  return {
    submittedAt: new Date().toISOString(),
    service: {
      primary: state.primary,
      addons: [...(state.addons || [])],
    },
    pond: { size: state.size, sizeLabel: size?.label || '', gallons: size?.gallons || '' },
    location: {
      address: state.address.trim(),
      city: state.city.trim(),
      zip: state.zip.trim(),
      milesFromBase: Number(state.miles),
    },
    schedule: {
      preferredDate: state.date,
      timePreference: state.timePref,
      emergency: !!state.emergency,
    },
    contact: {
      name: state.name.trim(),
      phone: state.phone.trim(),
      email: state.email.trim(),
    },
    notes: state.notes.trim(),
    acknowledgedRequoteTerms: state.consent === true,
    quote: {
      mode: q.mode, // 'fixed' | 'custom' | 'emergency'
      currency: 'USD',
      lineItems: q.items.map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        amountCents: i.cents,
      })),
      travel: {
        milesOneWay: q.travel.miles,
        freeRadiusMiles: TRAVEL.freeRadiusMiles,
        billableMilesOneWay: q.travel.billable,
        perMile: TRAVEL.perMile,
        roundTrip: true,
        amountCents: q.travel.cents,
      },
      oneOffTotalCents: q.mode === 'custom' ? null : q.oneOffCents,
      monthlyTotalCents: q.mode === 'custom' ? null : q.monthlyCents,
      hourlyLabour: q.mode === 'emergency' ? HOURLY_LABOUR : null,
    },
  }
}

/** Ordered label/value rows for the success panel and the email body. */
export function summaryRows(state) {
  const q = computeQuote(state)
  const size = POND_SIZES.find((p) => p.key === state.size) || null
  const rows = []

  const primary = q.items.find((i) => i.isPrimary)
  if (primary) {
    rows.push({
      label: 'Main job',
      value: `${primary.name} — ${fmtCents(primary.cents)}${
        primary.cents == null ? '' : ' ' + unitSuffix(primary.unit)
      }`,
    })
  }
  const addons = q.items.filter((i) => !i.isPrimary)
  if (addons.length) {
    rows.push({
      label: 'Add-ons',
      value: addons
        .map((a) => `${a.name} — ${fmtCents(a.cents)}${a.cents == null ? '' : ' ' + unitSuffix(a.unit)}`)
        .join('; '),
    })
  }
  rows.push({ label: 'Pond size', value: size ? `${size.label} (${size.gallons})` : '—' })
  rows.push({
    label: 'Address',
    value: `${state.address.trim()}, ${state.city.trim()} ${state.zip.trim()}`,
  })
  rows.push({
    label: 'Distance from base',
    value:
      q.travel.billable > 0
        ? `${Number(q.travel.miles)} mi — ${Number(q.travel.billable.toFixed(2))} mi past the first ${
            TRAVEL.freeRadiusMiles
          } free, charged round trip at ${formatUSD(TRAVEL.perMile)}/mi`
        : `${Number(q.travel.miles ?? 0)} mi — inside the first ${TRAVEL.freeRadiusMiles} free miles`,
  })
  rows.push({ label: 'Travel charge', value: fmtCents(q.travel.cents) })
  rows.push({
    label: 'Preferred date',
    value: `${state.date} (${TIME_LABEL[state.timePref] || state.timePref})`,
  })
  if (state.emergency) rows.push({ label: 'Emergency', value: 'Yes — priced on call-out plus hourly labour' })

  if (q.mode === 'custom') {
    rows.push({ label: 'Total', value: 'Custom quote — site visit first, written quote after' })
  } else {
    rows.push({ label: q.mode === 'emergency' ? 'Starts at' : 'Due at the visit', value: fmtCents(q.oneOffCents) })
    if (q.hasMonthly) rows.push({ label: 'Then monthly', value: `${fmtCents(q.monthlyCents)} per month` })
    if (q.mode === 'emergency')
      rows.push({ label: 'Plus labour', value: `${formatUSD(HOURLY_LABOUR)} an hour on site` })
  }

  rows.push({ label: 'Name', value: state.name.trim() })
  rows.push({ label: 'Phone', value: state.phone.trim() })
  rows.push({ label: 'Email', value: state.email.trim() })
  if (state.notes.trim()) rows.push({ label: 'Notes', value: state.notes.trim() })
  rows.push({
    label: 'Agreed',
    value: 'Price assumes a normal pond for its size; anything unexpected is re-quoted on the spot first.',
  })
  return rows
}

export function summaryText(state) {
  return summaryRows(state)
    .map((r) => `${r.label}: ${r.value}`)
    .join('\n')
}

export function mailtoHref(state) {
  const q = computeQuote(state)
  const primary = q.items.find((i) => i.isPrimary)
  const subject = `Booking request — ${primary ? primary.name : 'pond work'} — ${state.date}`
  const body = [
    `Hi Michael,`,
    ``,
    `I filled in the booking form on koiwrangler.com. Here is everything:`,
    ``,
    summaryText(state),
    ``,
    q.mode === 'custom'
      ? `I understand a pond this size needs a site visit and a written quote before any number is agreed.`
      : `I understand this is the price for a normal pond of this size, and anything unexpected gets re-quoted before work continues.`,
    ``,
    `Thanks,`,
    state.name.trim(),
  ].join('\n')
  return `mailto:${BRAND.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
