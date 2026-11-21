/**
 * Calendar invite for a booked visit.
 *
 * Generated in the browser — no backend, no account, no third-party calendar
 * API. The customer gets a .ics they can open in Apple Calendar, Google
 * Calendar or Outlook, and the same file is what Michael and Eddie would
 * attach if they wanted it on their own calendars.
 *
 * The event is marked TENTATIVE on purpose: submitting the form is a request,
 * not a confirmed slot, and a calendar entry that claims otherwise would be
 * the same lie the copy rules forbid everywhere else on this site.
 */
import { BRAND } from '../data/content.js'

const pad = (n) => String(n).padStart(2, '0')

/** iCalendar wants YYYYMMDDTHHMMSS, floating local time (no Z, no TZID). */
function stamp (date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
         `T${pad(date.getHours())}${pad(date.getMinutes())}00`
}

function utcStamp (date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
         `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

/** RFC 5545: escape, then fold to 75 octets with a leading space on wraps. */
const escapeText = (s) => String(s ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

function fold (line) {
  if (line.length <= 75) return line
  const out = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) { out.push(' ' + rest.slice(0, 74)); rest = rest.slice(74) }
  if (rest) out.push(' ' + rest)
  return out.join('\r\n')
}

/**
 * @param {object} o
 * @param {string} o.date      'YYYY-MM-DD'
 * @param {string} o.timePref  'morning' | 'afternoon' | 'either'
 * @param {string} o.summary   service name
 * @param {string} o.details   plain-text booking summary
 * @param {string} o.location  address
 * @returns {string|null} ics text, or null when there is no usable date
 */
export function buildIcs ({ date, timePref, summary, details, location }) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [y, m, d] = date.split('-').map(Number)

  // Arrival windows, not appointments — a pond clean is a half-day of work and
  // pretending to a 9:00 start we have not agreed would be made up.
  const startHour = timePref === 'afternoon' ? 13 : 8
  const hours = timePref === 'either' ? 8 : 4
  const start = new Date(y, m - 1, d, startHour, 0, 0)
  const end = new Date(start.getTime() + hours * 3600 * 1000)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${escapeText(BRAND.name)}//Booking//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${Math.random().toString(36).slice(2)}-${Date.now()}@koiwrangler`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(`${BRAND.name} — ${summary}`)}`,
    `DESCRIPTION:${escapeText(`${details}\n\nThis is a REQUESTED slot, not a confirmed one. ${BRAND.name} will confirm by phone (${BRAND.phone}).`)}`,
    location ? `LOCATION:${escapeText(location)}` : null,
    'STATUS:TENTATIVE',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`${BRAND.name} visit tomorrow`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Data URL for an <a download>. Kept small enough that this is safe. */
export function icsHref (ics) {
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics)
}
