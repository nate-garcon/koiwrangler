/**
 * Per-field validation. Each validator takes the whole state and returns
 * either null (valid) or a real sentence explaining what to do. No "invalid
 * input" and no red-border-only errors.
 */
import { POND_SIZES, SERVICES, TRAVEL } from '../data/services.js'
import { BRAND } from '../data/content.js'

/** Local-time YYYY-MM-DD (never UTC — that shifts the date for most of the US). */
export function isoDay(date) {
  const z = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}

/** The earliest bookable day: tomorrow. Recomputed on every call so a tab left
 *  open overnight does not keep offering a date that is now in the past. */
export function tomorrowISO() {
  const t = new Date()
  t.setHours(12, 0, 0, 0) // midday avoids DST edges when we add a day
  t.setDate(t.getDate() + 1)
  return isoDay(t)
}

export function digitsOf(value) {
  return String(value == null ? '' : value).replace(/\D+/g, '')
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
// Deliberately permissive: one @, a dot in the domain, no spaces. Good enough
// to catch typos, loose enough not to reject a valid odd address.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/

const text = (v) => String(v == null ? '' : v).trim()

export const VALIDATORS = {
  primary: (s) =>
    SERVICES.some((x) => x.id === s.primary)
      ? null
      : 'Pick the main job you need — that is the one I price first.',

  size: (s) =>
    POND_SIZES.some((p) => p.key === s.size)
      ? null
      : 'Pick the closest pond size so I can price it.',

  address: (s) =>
    text(s.address).length >= 4
      ? null
      : 'I need a street address to find the pond.',

  city: (s) =>
    text(s.city).length >= 2 ? null : 'Which town or city is it in?',

  zip: (s) =>
    /^\d{5}(-\d{4})?$/.test(text(s.zip))
      ? null
      : 'A 5-digit ZIP code, like 73301.',

  miles: (s) => {
    const raw = text(s.miles)
    if (raw === '')
      return `Roughly how many miles out are you? A guess is fine — the first ${TRAVEL.freeRadiusMiles} miles are free either way.`
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return 'Miles needs to be a number, 0 or more.'
    if (n > 1000)
      return `That is a long way past the first ${TRAVEL.freeRadiusMiles} free miles — give me a call on ${BRAND.phone} and we will work it out properly.`
    return null
  },

  date: (s) => {
    const raw = text(s.date)
    if (raw === '') return 'Which day would you like? I book from tomorrow onwards.'
    if (!ISO_DATE.test(raw)) return 'Pick a date from the calendar.'
    // ISO strings compare correctly as strings, so no Date parsing needed.
    if (raw < tomorrowISO()) return 'That day has gone. The earliest I can book is tomorrow.'
    return null
  },

  timePref: (s) =>
    text(s.timePref) ? null : 'Morning, afternoon, or either — whichever suits you.',

  name: (s) => (text(s.name).length >= 2 ? null : 'What should I call you?'),

  phone: (s) => {
    const d = digitsOf(s.phone)
    if (d.length === 0) return 'A phone number, so I can text you if I am running late.'
    if (d.length < 10) return 'That looks a few digits short — 10 digits is plenty.'
    if (d.length > 15) return 'That is more digits than a phone number has.'
    return null
  },

  email: (s) => {
    const raw = text(s.email)
    if (raw === '') return 'An email address, so you get the booking summary in writing.'
    if (!EMAIL_RE.test(raw)) return 'That email is missing something — check for a typo.'
    return null
  },

  consent: (s) =>
    s.consent === true
      ? null
      : 'Please tick this so we both know where we stand if the pond is not normal for its size.',
}

/** Which fields belong to which step. Also drives "jump to the first problem". */
export const STEP_FIELDS = [
  ['primary'],
  ['size'],
  ['address', 'city', 'zip', 'miles', 'date', 'timePref'],
  ['name', 'phone', 'email', 'consent'],
]

export const FIELD_STEP = STEP_FIELDS.reduce((acc, fields, i) => {
  for (const f of fields) acc[f] = i
  return acc
}, {})

/** @returns {{field:string,msg:string}[]} in field order */
export function validateFields(state, fields) {
  const out = []
  for (const field of fields) {
    const msg = VALIDATORS[field]?.(state) || null
    if (msg) out.push({ field, msg })
  }
  return out
}

export function validateStep(state, index) {
  return validateFields(state, STEP_FIELDS[index] || [])
}

export function validateAll(state) {
  return validateFields(state, STEP_FIELDS.flat())
}

/**
 * Non-blocking advisory, not an error: BRAND.hours says Mon–Sat, so a Sunday
 * request gets a heads-up rather than a rejection (Michael may well say yes).
 */
export function dayAdvice(dateStr) {
  const raw = text(dateStr)
  if (!ISO_DATE.test(raw)) return ''
  const d = new Date(raw + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return d.getDay() === 0
    ? `Heads up: my normal hours are ${BRAND.hours}, so a Sunday needs me to confirm it is doable.`
    : ''
}
