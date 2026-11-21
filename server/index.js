/**
 * The Koi Wrangler — backend.
 *
 * Deliberately dependency-free: Node 22+ has fetch, crypto and a decent http
 * server, and Stripe/Google are both plain REST. Fewer moving parts to audit,
 * nothing to keep patched, and it cold-starts fast on a small free instance.
 *
 * Endpoints
 *   POST /api/checkout          cart -> Stripe Checkout Session (promo codes on)
 *   POST /api/booking           booking payload -> store + notify Michael/Eddie
 *   GET  /auth/google           start Google sign-in
 *   GET  /auth/google/callback  finish it, set a signed session cookie
 *   POST /auth/logout           clear the session
 *   GET  /api/admin/me          who am I (and am I allowed in)
 *   GET  /api/admin/bookings    bookings, newest first        [admin only]
 *   GET  /api/admin/orders      paid orders, newest first     [admin only]
 *   POST /api/stripe/webhook    Stripe -> mark orders paid, notify
 *
 * Every secret comes from the environment. See .env.example.
 */
import { createServer } from 'node:http'
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { appendFile, readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

import { SUPPLIES, SHOP_POLICY } from '../src/data/supplies.js'

const PORT = Number(process.env.PORT || 8787)
const ORIGIN = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${PORT}`
const SITE = process.env.SITE_ORIGIN || 'http://127.0.0.1:5173'
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || ''
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''
const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const SESSION_SECRET = process.env.SESSION_SECRET || ''
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
const NOTIFY_WEBHOOK = process.env.NOTIFY_WEBHOOK_URL || ''

const configured = {
  stripe: !!STRIPE_SECRET,
  google: !!(GOOGLE_ID && GOOGLE_SECRET && SESSION_SECRET),
  notify: !!NOTIFY_WEBHOOK,
}

/* ------------------------------- helpers ------------------------------- */
const json = (res, code, body, headers = {}) => {
  const payload = JSON.stringify(body)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...cors(),
    ...headers,
  })
  res.end(payload)
}

const cors = () => ({
  'access-control-allow-origin': SITE,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  vary: 'Origin',
})

async function readJson (req, limitBytes = 64 * 1024) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > limitBytes) throw new Error('payload too large')
    chunks.push(c)
  }
  const raw = Buffer.concat(chunks)
  return { raw, body: raw.length ? JSON.parse(raw.toString('utf8')) : {} }
}

/** HMAC-signed, tamper-evident session cookie. No session store needed. */
function sign (value) {
  const mac = createHmac('sha256', SESSION_SECRET).update(value).digest('base64url')
  return `${value}.${mac}`
}
function verify (signed) {
  if (!signed || !SESSION_SECRET) return null
  const i = signed.lastIndexOf('.')
  if (i < 1) return null
  const value = signed.slice(0, i)
  const given = Buffer.from(signed.slice(i + 1))
  const want = Buffer.from(createHmac('sha256', SESSION_SECRET).update(value).digest('base64url'))
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null
  try {
    const session = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (session.exp && Date.now() > session.exp) return null
    return session
  } catch { return null }
}
const cookies = (req) => Object.fromEntries(
  (req.headers.cookie || '').split(';').map((c) => {
    const i = c.indexOf('=')
    return i < 0 ? [c.trim(), ''] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))]
  }).filter(([k]) => k))

const sessionOf = (req) => verify(cookies(req).kw_session)
const isAdmin = (s) => !!(s?.email && ADMIN_EMAILS.includes(s.email.toLowerCase()))

/* ------------------------------- storage ------------------------------- */
// Append-only JSONL. Small, greppable, trivially backed up, and it survives a
// restart. Swap for a real database if this ever outgrows one pond cleaner.
async function append (file, record) {
  await mkdir(DATA_DIR, { recursive: true })
  const row = { id: randomUUID(), at: new Date().toISOString(), ...record }
  await appendFile(path.join(DATA_DIR, file), JSON.stringify(row) + '\n', 'utf8')
  return row
}
async function readAll (file, limit = 200) {
  const p = path.join(DATA_DIR, file)
  if (!existsSync(p)) return []
  const text = await readFile(p, 'utf8')
  return text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } })
    .filter(Boolean).reverse().slice(0, limit)
}

/** Ping Michael and Eddie. Any webhook that accepts JSON: Slack, ntfy, Discord. */
async function notify (text) {
  if (!NOTIFY_WEBHOOK) { console.info('[notify]', text); return }
  try {
    await fetch(NOTIFY_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, content: text, message: text }),
    })
  } catch (err) { console.warn('[notify] failed:', err.message) }
}

/* -------------------------------- Stripe -------------------------------- */
async function stripe (endpoint, form) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${STRIPE_SECRET}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: form,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `stripe ${res.status}`)
  return data
}

/**
 * Build a Checkout Session from the cart.
 *
 * SECURITY: prices are looked up from src/data/supplies.js on the server. The
 * client sends ids and quantities only — never an amount. Anything else would
 * let a visitor set their own prices.
 */
async function createCheckout (cart) {
  const items = []
  let subtotalCents = 0
  for (const line of cart.items || []) {
    const product = SUPPLIES.find((s) => s.id === line.id)
    if (!product) continue
    const qty = Math.max(1, Math.min(99, Number(line.qty) || 1))
    const unit = Math.round(product.price * 100)
    subtotalCents += unit * qty
    items.push({ product, qty, unit })
  }
  if (!items.length) throw new Error('cart is empty')

  const form = new URLSearchParams()
  form.set('mode', 'payment')
  form.set('success_url', `${SITE}/?order=success&session_id={CHECKOUT_SESSION_ID}`)
  form.set('cancel_url', `${SITE}/?order=cancelled`)
  // Stripe's own promotion codes — no bespoke discount logic to get wrong.
  form.set('allow_promotion_codes', 'true')
  form.set('billing_address_collection', 'auto')
  form.set('phone_number_collection[enabled]', 'true')

  items.forEach(({ product, qty, unit }, i) => {
    form.set(`line_items[${i}][quantity]`, String(qty))
    form.set(`line_items[${i}][price_data][currency]`, 'usd')
    form.set(`line_items[${i}][price_data][unit_amount]`, String(unit))
    form.set(`line_items[${i}][price_data][product_data][name]`, product.name)
    form.set(`line_items[${i}][price_data][product_data][description]`, `${product.size} — ${product.blurb}`)
  })

  // Shipping follows SHOP_POLICY so the site and the checkout cannot disagree.
  const freeOver = Number((SHOP_POLICY.shipping.match(/free over \$(\d+)/i) || [])[1] || 125) * 100
  const flat = Number((SHOP_POLICY.shipping.match(/\$(\d+)\s*(?:flat)?\s*statewide/i) || [])[1] || 9) * 100
  const shipping = subtotalCents >= freeOver ? 0 : flat
  form.set('shipping_options[0][shipping_rate_data][type]', 'fixed_amount')
  form.set('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(shipping))
  form.set('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'usd')
  form.set('shipping_options[0][shipping_rate_data][display_name]',
    shipping === 0 ? 'Free statewide shipping' : 'Statewide shipping')

  return stripe('checkout/sessions', form)
}

/** Verify Stripe's signature so nobody can forge a "paid" event. */
function stripeSignatureValid (raw, header) {
  if (!STRIPE_WEBHOOK_SECRET || !header) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')))
  if (!parts.t || !parts.v1) return false
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false // replay window
  const want = createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(`${parts.t}.${raw.toString('utf8')}`).digest('hex')
  const a = Buffer.from(parts.v1); const b = Buffer.from(want)
  return a.length === b.length && timingSafeEqual(a, b)
}

/* -------------------------------- routes -------------------------------- */
const server = createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN)
  const { pathname } = url

  if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end() }

  try {
    if (pathname === '/health') {
      return json(res, 200, { ok: true, configured })
    }

    /* ---- shop ---- */
    if (pathname === '/api/checkout' && req.method === 'POST') {
      if (!configured.stripe) {
        return json(res, 503, { error: 'stripe_not_configured', hint: 'Set STRIPE_SECRET_KEY' })
      }
      const { body } = await readJson(req)
      const session = await createCheckout(body)
      await append('orders.jsonl', {
        kind: 'checkout_started',
        stripeSessionId: session.id,
        amountTotal: session.amount_total,
        items: (body.items || []).map((i) => ({ id: i.id, qty: i.qty })),
      })
      return json(res, 200, { url: session.url, id: session.id })
    }

    if (pathname === '/api/stripe/webhook' && req.method === 'POST') {
      const { raw, body } = await readJson(req, 1024 * 1024)
      if (!stripeSignatureValid(raw, req.headers['stripe-signature'])) {
        return json(res, 400, { error: 'bad_signature' })
      }
      if (body.type === 'checkout.session.completed') {
        const s = body.data.object
        await append('orders.jsonl', {
          kind: 'paid',
          stripeSessionId: s.id,
          amountTotal: s.amount_total,
          email: s.customer_details?.email || null,
          name: s.customer_details?.name || null,
          phone: s.customer_details?.phone || null,
        })
        await notify(`Koi Wrangler: order paid — $${((s.amount_total || 0) / 100).toFixed(2)} from ${s.customer_details?.email || 'unknown'}`)
      }
      return json(res, 200, { received: true })
    }

    /* ---- booking ---- */
    if (pathname === '/api/booking' && req.method === 'POST') {
      const { body } = await readJson(req)
      if (!body?.contact?.email && !body?.contact?.phone) {
        return json(res, 400, { error: 'contact_required' })
      }
      const row = await append('bookings.jsonl', { kind: 'booking', ...body })
      const q = body.quote || {}
      await notify(
        `Koi Wrangler booking — ${body.contact?.name || 'someone'} (${body.contact?.phone || body.contact?.email})\n` +
        `${body.service?.primary || '?'} · ${body.pond?.size || '?'} · ${body.schedule?.date || 'no date'}\n` +
        `${q.mode === 'custom' ? 'Custom quote' : '$' + (((q.oneOffTotalCents || 0) / 100).toFixed(2))}`
      )
      return json(res, 200, { ok: true, id: row.id })
    }

    /* ---- auth ---- */
    if (pathname === '/auth/google') {
      if (!configured.google) return json(res, 503, { error: 'google_not_configured' })
      const state = sign(Buffer.from(JSON.stringify({ n: randomUUID(), exp: Date.now() + 6e5 })).toString('base64url'))
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      auth.searchParams.set('client_id', GOOGLE_ID)
      auth.searchParams.set('redirect_uri', `${ORIGIN}/auth/google/callback`)
      auth.searchParams.set('response_type', 'code')
      auth.searchParams.set('scope', 'openid email profile')
      auth.searchParams.set('state', state)
      res.writeHead(302, {
        location: auth.toString(),
        'set-cookie': `kw_state=${encodeURIComponent(state)}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax${ORIGIN.startsWith('https') ? '; Secure' : ''}`,
      })
      return res.end()
    }

    if (pathname === '/auth/google/callback') {
      if (!configured.google) return json(res, 503, { error: 'google_not_configured' })
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      if (!code || !state || state !== cookies(req).kw_state || !verify(state)) {
        return json(res, 400, { error: 'bad_state' })
      }
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_ID,
          client_secret: GOOGLE_SECRET,
          redirect_uri: `${ORIGIN}/auth/google/callback`,
          grant_type: 'authorization_code',
        }),
      })
      const tok = await tokenRes.json()
      if (!tokenRes.ok) return json(res, 401, { error: 'token_exchange_failed', detail: tok?.error })

      // The id_token is signed by Google and we just received it over TLS
      // directly from their token endpoint, so reading the claims is safe here.
      const claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString('utf8'))
      if (!claims.email_verified) return json(res, 403, { error: 'email_not_verified' })

      const session = Buffer.from(JSON.stringify({
        email: claims.email, name: claims.name, picture: claims.picture,
        exp: Date.now() + 7 * 24 * 3600 * 1000,
      })).toString('base64url')

      res.writeHead(302, {
        location: `${SITE}/admin.html`,
        'set-cookie': [
          `kw_session=${encodeURIComponent(sign(session))}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax${ORIGIN.startsWith('https') ? '; Secure' : ''}`,
          'kw_state=; Path=/; Max-Age=0',
        ],
      })
      return res.end()
    }

    if (pathname === '/auth/logout' && req.method === 'POST') {
      res.writeHead(200, { ...cors(), 'set-cookie': 'kw_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax' })
      return res.end('{"ok":true}')
    }

    /* ---- admin ---- */
    if (pathname === '/api/admin/me') {
      const s = sessionOf(req)
      return json(res, 200, { signedIn: !!s, admin: isAdmin(s), email: s?.email || null, name: s?.name || null, configured })
    }

    if (pathname.startsWith('/api/admin/')) {
      if (!isAdmin(sessionOf(req))) return json(res, 403, { error: 'forbidden' })
      if (pathname === '/api/admin/bookings') return json(res, 200, { rows: await readAll('bookings.jsonl') })
      if (pathname === '/api/admin/orders') return json(res, 200, { rows: await readAll('orders.jsonl') })
    }

    return json(res, 404, { error: 'not_found' })
  } catch (err) {
    console.error('[server]', err)
    return json(res, 500, { error: 'server_error', message: err.message })
  }
})

server.listen(PORT, () => {
  console.log(`[koiwrangler] listening on ${ORIGIN}`)
  console.log('[koiwrangler] configured:', configured)
  if (!configured.stripe) console.log('  · Stripe off — /api/checkout returns 503 until STRIPE_SECRET_KEY is set')
  if (!configured.google) console.log('  · Google sign-in off — set GOOGLE_CLIENT_ID/SECRET and SESSION_SECRET')
  if (!configured.notify) console.log('  · Notifications log to stdout — set NOTIFY_WEBHOOK_URL to ping Michael/Eddie')
})
