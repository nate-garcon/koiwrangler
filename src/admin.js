/**
 * Admin page — bookings and orders for Michael and Eddie.
 *
 * Auth is deliberately thin: Google sign-in gives us a verified email, the
 * server checks it against ADMIN_EMAILS and sets a signed, HttpOnly cookie.
 * There are no passwords here to leak and no user table to maintain.
 *
 * This page is useless without a backend, and says so rather than appearing
 * broken — the static GitHub Pages build has no API to talk to.
 */
import './styles/fonts.css'
import './styles/tokens.css'
import './admin.css'
import { hasBackend, apiBase, get } from './api.js'

const root = document.getElementById('admin')
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const money = (cents) =>
  cents == null ? '—' : '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })

const when = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function shell (inner) {
  root.innerHTML = `
    <header class="ad-head">
      <h1>The Koi Wrangler <span>admin</span></h1>
      <div id="ad-who"></div>
    </header>
    ${inner}`
}

function noBackend () {
  shell(`
    <section class="ad-card ad-empty">
      <h2>No backend connected</h2>
      <p>This page needs the API to show bookings and orders. The published
         site is static, so there is nothing for it to read yet.</p>
      <p>Deploy <code>server/index.js</code>, then rebuild the site with
         <code>VITE_API_BASE</code> pointing at it:</p>
      <pre>VITE_API_BASE=https://koiwrangler.fly.dev npm run build</pre>
      <p class="ad-muted">Until then, bookings arrive by email through the
         booking form's fallback, and nothing is lost.</p>
    </section>`)
}

function signIn (reason) {
  shell(`
    <section class="ad-card ad-empty">
      <h2>${reason === 'forbidden' ? 'Not on the list' : 'Sign in'}</h2>
      <p>${reason === 'forbidden'
        ? 'That Google account is not an admin for this site. Add it to ADMIN_EMAILS on the server.'
        : 'Admin access is limited to Michael and Eddie.'}</p>
      <a class="ad-btn" href="${esc(apiBase())}/auth/google">Continue with Google</a>
    </section>`)
}

function table (title, rows, columns, emptyText) {
  if (!rows.length) {
    return `<section class="ad-card"><h2>${esc(title)}</h2><p class="ad-muted">${esc(emptyText)}</p></section>`
  }
  return `
    <section class="ad-card">
      <h2>${esc(title)} <span class="ad-count">${rows.length}</span></h2>
      <div class="ad-scroll">
        <table class="ad-table">
          <thead><tr>${columns.map((c) => `<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map((r) => `<tr>${columns.map((c) => `<td>${c.cell(r)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`
}

async function main () {
  if (!hasBackend()) return noBackend()

  let me
  try {
    me = await get('/api/admin/me')
  } catch {
    return noBackend()
  }
  if (!me.signedIn) return signIn()
  if (!me.admin) return signIn('forbidden')

  const [bookings, orders] = await Promise.all([
    get('/api/admin/bookings').catch(() => ({ rows: [] })),
    get('/api/admin/orders').catch(() => ({ rows: [] })),
  ])

  shell(
    table('Bookings', bookings.rows, [
      { label: 'When', cell: (r) => esc(when(r.at)) },
      { label: 'Who', cell: (r) => `${esc(r.contact?.name || '—')}<br><span class="ad-muted">${esc(r.contact?.phone || r.contact?.email || '')}</span>` },
      { label: 'Job', cell: (r) => `${esc(r.service?.primary || '—')}${r.service?.addons?.length ? `<br><span class="ad-muted">+ ${esc(r.service.addons.join(', '))}</span>` : ''}` },
      { label: 'Pond', cell: (r) => esc(r.pond?.sizeLabel || r.pond?.size || '—') },
      { label: 'Date', cell: (r) => esc(r.schedule?.preferredDate || '—') + (r.schedule?.emergency ? ' <strong class="ad-urgent">urgent</strong>' : '') },
      { label: 'Quote', cell: (r) => r.quote?.mode === 'custom' ? 'Custom' : esc(money(r.quote?.oneOffTotalCents)) },
    ], 'Nothing booked yet.') +
    table('Orders', orders.rows, [
      { label: 'When', cell: (r) => esc(when(r.at)) },
      { label: 'Status', cell: (r) => r.kind === 'paid' ? '<strong class="ad-paid">paid</strong>' : esc(r.kind) },
      { label: 'Customer', cell: (r) => esc(r.name || r.email || '—') },
      { label: 'Total', cell: (r) => esc(money(r.amountTotal)) },
    ], 'No orders yet.')
  )

  document.getElementById('ad-who').innerHTML =
    `<span class="ad-muted">${esc(me.email)}</span>
     <button type="button" class="ad-btn ad-btn--quiet" id="ad-out">Sign out</button>`
  document.getElementById('ad-out').addEventListener('click', async () => {
    await fetch(`${apiBase()}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
    location.reload()
  })
}

main().catch((err) => {
  console.error(err)
  root.innerHTML = `<section class="ad-card ad-empty"><h2>Something went wrong</h2><p>${esc(err.message)}</p></section>`
})
