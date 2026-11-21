/**
 * Backend client.
 *
 * The site is built to work with NO backend at all — it ships to GitHub Pages
 * as pure static files, and every path here degrades to the mailto: flow that
 * already exists. Set VITE_API_BASE at build time to switch the live paths on:
 *
 *   VITE_API_BASE=https://koiwrangler.fly.dev npm run build
 *
 * `probe()` asks the server what it actually has configured, so a backend
 * running without Stripe keys still reports honestly instead of failing late.
 */
const BASE = (import.meta.env?.VITE_API_BASE || '').replace(/\/$/, '')

export const hasBackend = () => !!BASE

let probed = null
export async function probe () {
  if (!BASE) return { ok: false, configured: { stripe: false, google: false, notify: false } }
  if (probed) return probed
  try {
    const res = await fetch(`${BASE}/health`, { credentials: 'include' })
    probed = res.ok ? await res.json() : { ok: false, configured: {} }
  } catch {
    probed = { ok: false, configured: {} }
  }
  return probed
}

async function post (path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data, status: res.status })
  return data
}

export async function get (path) {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data, status: res.status })
  return data
}

/** Cart -> Stripe Checkout. Sends ids and quantities ONLY; the server owns prices. */
export const startCheckout = (items) => post('/api/checkout', { items })

/** Booking -> stored and announced to Michael and Eddie. */
export const submitBooking = (payload) => post('/api/booking', payload)

export const apiBase = () => BASE
