/**
 * THE SUPPLIES SHOP.
 *
 * Category tabs over a grid of SUPPLIES cards, plus a cart drawer. There is no
 * checkout: the cart's real action is "add to my next visit", which hands the
 * list to the booking widget through a CustomEvent so the two modules never
 * import each other. A mailto: order is the alternative.
 */
import { SUPPLIES, SUPPLY_CATEGORIES, SHOP_POLICY } from '../data/supplies.js'
import { BRAND } from '../data/content.js'
import { createCart, MAX_QTY, supplyById } from './cart.js'
import { fmtCents } from './money.js'
import { icon } from '../sections/svg.js'

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const TABS = [{ key: '', label: 'Everything' }, ...SUPPLY_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))]

function cardHTML(item) {
  const qtyId = `sh-qty-${item.id}`
  return `
  <article class="sh-card" data-cat="${esc(item.category)}">
    <p class="sh-card__emoji" aria-hidden="true">${icon(item.icon, { size: 40, className: "sh-ico" })}</p>
    <h3 class="sh-card__name">${esc(item.name)}</h3>
    <p class="sh-card__size">${esc(item.size)}</p>
    <p class="sh-card__blurb">${esc(item.blurb)}</p>
    <p class="sh-card__price">${esc(fmtCents(Math.round(item.price * 100)))}</p>
    <div class="sh-add">
      <div class="sh-stepper">
        <button type="button" class="sh-stepper__btn" data-act="card-dec" data-id="${esc(item.id)}"
                aria-label="One fewer ${esc(item.name)}">&minus;</button>
        <label class="visually-hidden" for="${esc(qtyId)}">Quantity of ${esc(item.name)} to add</label>
        <input class="sh-stepper__in" id="${esc(qtyId)}" type="number" inputmode="numeric"
               min="1" max="${MAX_QTY}" step="1" value="1" data-qty-for="${esc(item.id)}">
        <button type="button" class="sh-stepper__btn" data-act="card-inc" data-id="${esc(item.id)}"
                aria-label="One more ${esc(item.name)}">+</button>
      </div>
      <button type="button" class="btn btn--sm sh-addbtn" data-act="add" data-id="${esc(item.id)}">
        Add<span class="visually-hidden"> ${esc(item.name)} to cart</span>
      </button>
    </div>
    <p class="sh-card__in-cart" data-in-cart="${esc(item.id)}" hidden></p>
  </article>`
}

function shellHTML() {
  return `
  <div class="sh">
    <div class="sh-bar">
      <div class="sh-tabs" role="tablist" aria-label="Filter supplies by category">
        ${TABS.map(
          (t, i) => `
        <button type="button" class="sh-tab" role="tab" id="sh-tab-${i}" data-cat="${esc(t.key)}"
                aria-controls="sh-grid" aria-selected="${i === 0 ? 'true' : 'false'}"
                tabindex="${i === 0 ? '0' : '-1'}">${esc(t.label)}</button>`
        ).join('')}
      </div>
      <button type="button" class="btn btn--brass btn--sm sh-cartbtn" data-act="open-cart"
              aria-expanded="false" aria-controls="sh-cart">
        <span aria-hidden="true">🧺</span> Cart
        <span class="sh-badge" data-badge aria-hidden="true">0</span>
        <span class="visually-hidden" data-badge-sr>, empty</span>
      </button>
    </div>

    <p class="sh-say" data-say role="status" aria-live="polite"></p>

    <p class="sh-policy">
      <strong>${esc(SHOP_POLICY.shipping)}</strong>
      ${esc(SHOP_POLICY.pickup)}
      <span class="sh-policy__note">${esc(SHOP_POLICY.note)}</span>
    </p>

    <div class="sh-grid" id="sh-grid" role="tabpanel" aria-labelledby="sh-tab-0" tabindex="0" data-grid>
      ${SUPPLIES.map(cardHTML).join('')}
    </div>

    <div class="sh-scrim" data-scrim hidden></div>
    <div class="sh-drawer" id="sh-cart" role="dialog" aria-modal="true" aria-labelledby="sh-cart-h" hidden>
      <div class="sh-drawer__head">
        <h3 class="sh-drawer__h" id="sh-cart-h">Your supplies</h3>
        <button type="button" class="sh-drawer__x" data-act="close-cart" aria-label="Close the cart">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="sh-drawer__body" data-cart-body></div>
      <div class="sh-drawer__foot" data-cart-foot></div>
    </div>
  </div>`
}

export function initShop(mount) {
  if (!mount || mount.dataset.shReady === '1') return
  mount.dataset.shReady = '1'
  mount.innerHTML = shellHTML()

  const $ = (sel) => mount.querySelector(sel)
  const $$ = (sel) => Array.from(mount.querySelectorAll(sel))

  const grid = $('[data-grid]')
  const tabs = $$('.sh-tab')
  const badge = $('[data-badge]')
  const badgeSr = $('[data-badge-sr]')
  const cartBtn = $('[data-act="open-cart"]')
  const drawer = $('.sh-drawer')
  const scrim = $('[data-scrim]')
  const body = $('[data-cart-body]')
  const foot = $('[data-cart-foot]')
  const sayEl = $('[data-say]')

  /* The cart is a modal, so it is moved out to <body>. Any ancestor with a
     transform (the site's .reveal animation, for one) would otherwise become
     the containing block and position:fixed would stop meaning "the viewport". */
  const portal = document.createElement('div')
  portal.className = 'sh-portal'
  portal.appendChild(scrim)
  portal.appendChild(drawer)
  document.body.appendChild(portal)

  let lastFocus = null
  const say = (msg) => {
    sayEl.textContent = msg || ''
  }

  const cart = createCart(() => render())

  /* ---------- rendering ---------- */

  function render() {
    const t = cart.totals()
    const count = cart.count()

    badge.textContent = String(count)
    badge.classList.toggle('is-empty', count === 0)
    badgeSr.textContent = count === 0 ? ', empty' : `, ${count} item${count === 1 ? '' : 's'}`

    for (const el of $$('[data-in-cart]')) {
      const qty = cart.qtyOf(el.dataset.inCart)
      el.textContent = qty ? `${qty} in your cart` : ''
      el.hidden = !qty
    }

    if (!t.lines.length) {
      body.innerHTML = `
        <p class="sh-cart__empty">Nothing in here yet. Add what you need above — I will either bring it on the visit or post it.</p>`
      foot.innerHTML = `<p class="sh-cart__note">${esc(SHOP_POLICY.note)}</p>`
      return
    }

    body.innerHTML = `
      <ul class="sh-cart__list">
        ${t.lines
          .map(
            (l) => `
        <li class="sh-cart__row">
          <span class="sh-cart__emoji" aria-hidden="true">${icon(l.icon, { size: 28, className: "sh-ico" })}</span>
          <span class="sh-cart__meta">
            <span class="sh-cart__name">${esc(l.name)}</span>
            <span class="sh-cart__sub">${esc(l.size)} · ${esc(fmtCents(l.unitCents))} each</span>
          </span>
          <span class="sh-stepper sh-stepper--cart">
            <button type="button" class="sh-stepper__btn" data-act="dec" data-id="${esc(l.id)}"
                    aria-label="One fewer ${esc(l.name)}">&minus;</button>
            <label class="visually-hidden" for="sh-cqty-${esc(l.id)}">Quantity of ${esc(l.name)}</label>
            <input class="sh-stepper__in" id="sh-cqty-${esc(l.id)}" type="number" inputmode="numeric"
                   min="1" max="${MAX_QTY}" step="1" value="${l.qty}" data-act="set" data-id="${esc(l.id)}">
            <button type="button" class="sh-stepper__btn" data-act="inc" data-id="${esc(l.id)}"
                    aria-label="One more ${esc(l.name)}">+</button>
          </span>
          <span class="sh-cart__amt">${esc(fmtCents(l.lineCents))}</span>
          <button type="button" class="sh-cart__rm" data-act="remove" data-id="${esc(l.id)}">
            Remove<span class="visually-hidden"> ${esc(l.name)}</span>
          </button>
        </li>`
          )
          .join('')}
      </ul>`

    const shipLabel = t.freeShipping
      ? `Shipping — free over ${fmtCents(t.freeOverCents)}`
      : `Shipping — flat, statewide`
    const toFree = !t.freeShipping && t.toFreeCents > 0
      ? `<p class="sh-cart__hint">${esc(fmtCents(t.toFreeCents))} more and the shipping is free. Or add it to a booked visit and there is no shipping at all.</p>`
      : ''

    foot.innerHTML = `
      <dl class="sh-cart__totals" role="status" aria-live="polite" aria-atomic="true">
        <div class="sh-cart__trow"><dt>Supplies</dt><dd>${esc(fmtCents(t.subtotalCents))}</dd></div>
        <div class="sh-cart__trow"><dt>${esc(shipLabel)}</dt><dd>${esc(fmtCents(t.shippingCents))}</dd></div>
        <div class="sh-cart__trow sh-cart__trow--total"><dt>Total if posted</dt><dd>${esc(fmtCents(t.totalCents))}</dd></div>
      </dl>
      ${toFree}
      <div class="sh-cart__acts">
        <button type="button" class="btn sh-cart__primary" data-act="to-booking">Add to my next visit</button>
        <a class="btn btn--brass btn--sm" data-act="mailto" href="${esc(orderMailto())}">Email the order instead</a>
        <button type="button" class="btn btn--sm sh-btn--quiet" data-act="clear">Empty the cart</button>
      </div>
      <p class="sh-cart__note">
        ${esc(SHOP_POLICY.pickup)} Nothing is charged on this website — I invoice the supplies with the visit, or reply with how to pay before posting anything.
      </p>
      <p class="sh-cart__note">${esc(SHOP_POLICY.note)}</p>`
  }

  function orderMailto() {
    const t = cart.totals()
    const subject = `Supplies order — ${cart.count()} item${cart.count() === 1 ? '' : 's'}`
    const lines = [
      'Hi Michael,',
      '',
      'I would like these supplies:',
      '',
      cart.text({ withTotals: true, withShipping: true }),
      '',
      `Drop-off on a visit or posted — whichever is easier. (${SHOP_POLICY.pickup})`,
      '',
      'Thanks,',
    ]
    return `mailto:${BRAND.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      lines.join('\n')
    )}`
  }

  /* ---------- tabs ---------- */

  function selectTab(index, { focus = false, announce = true } = {}) {
    const i = Math.max(0, Math.min(tabs.length - 1, index))
    tabs.forEach((tab, n) => {
      const on = n === i
      tab.setAttribute('aria-selected', on ? 'true' : 'false')
      tab.tabIndex = on ? 0 : -1
      tab.classList.toggle('is-on', on)
    })
    grid.setAttribute('aria-labelledby', tabs[i].id)
    const cat = tabs[i].dataset.cat
    let shown = 0
    for (const card of $$('.sh-card')) {
      const on = !cat || card.dataset.cat === cat
      card.hidden = !on
      if (on) shown++
    }
    if (announce) say(`${shown} item${shown === 1 ? '' : 's'} shown: ${tabs[i].textContent.trim()}.`)
    if (focus) tabs[i].focus()
  }

  /** Clicks and changes can come from the grid (in the mount) or the drawer (in the portal). */
  const roots = [mount, portal]

  mount.addEventListener('keydown', (event) => {
    const tab = event.target.closest?.('.sh-tab')
    if (!tab) return
    const i = tabs.indexOf(tab)
    const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }
    if (!(event.key in keys)) return
    event.preventDefault()
    const next = (keys[event.key] + tabs.length) % tabs.length
    selectTab(next, { focus: true })
  })

  /* ---------- drawer ---------- */

  function focusables() {
    return Array.from(drawer.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    )
  }

  function openCart() {
    if (!drawer.hidden) return
    lastFocus = document.activeElement
    drawer.hidden = false
    scrim.hidden = false
    cartBtn.setAttribute('aria-expanded', 'true')
    document.documentElement.classList.add('sh-cart-open')
    const first = focusables()[0]
    ;(first || drawer).focus({ preventScroll: true })
  }

  function closeCart({ restore = true } = {}) {
    if (drawer.hidden) return
    drawer.hidden = true
    scrim.hidden = true
    cartBtn.setAttribute('aria-expanded', 'false')
    document.documentElement.classList.remove('sh-cart-open')
    if (restore) {
      const target = lastFocus && document.contains(lastFocus) ? lastFocus : cartBtn
      target.focus({ preventScroll: true })
    }
  }

  // Escape closes; Tab is trapped inside while it is open.
  document.addEventListener('keydown', (event) => {
    if (drawer.hidden) return
    if (event.key === 'Escape') {
      event.preventDefault()
      closeCart()
      return
    }
    if (event.key !== 'Tab') return
    const items = focusables()
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (!drawer.contains(active)) {
      event.preventDefault()
      first.focus()
      return
    }
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  })

  scrim.addEventListener('click', () => closeCart())

  /* ---------- clicks ---------- */

  function cardQtyInput(id) {
    return mount.querySelector(`[data-qty-for="${CSS.escape ? CSS.escape(id) : id}"]`)
  }

  function cardQty(id) {
    const input = cardQtyInput(id)
    const n = Math.floor(Number(input?.value))
    return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_QTY) : 1
  }

  function onClick(event) {
    const el = event.target.closest('[data-act]')
    if (!el) return
    const id = el.dataset.id
    switch (el.dataset.act) {
      case 'open-cart':
        openCart()
        break
      case 'close-cart':
        closeCart()
        break
      case 'card-inc':
      case 'card-dec': {
        const input = cardQtyInput(id)
        if (!input) break
        const delta = el.dataset.act === 'card-inc' ? 1 : -1
        const next = Math.max(1, Math.min(MAX_QTY, cardQty(id) + delta))
        input.value = String(next)
        break
      }
      case 'add': {
        const qty = cardQty(id)
        cart.add(id, qty)
        const item = supplyById(id)
        const input = cardQtyInput(id)
        if (input) input.value = '1'
        say(`${qty} × ${item ? item.name : 'item'} added. ${cart.count()} in the cart.`)
        break
      }
      case 'inc':
        cart.setQty(id, cart.qtyOf(id) + 1)
        break
      case 'dec':
        cart.setQty(id, cart.qtyOf(id) - 1)
        break
      case 'remove': {
        const item = supplyById(id)
        cart.remove(id)
        say(`${item ? item.name : 'Item'} removed.`)
        break
      }
      case 'clear':
        cart.clear()
        say('Cart emptied.')
        break
      case 'to-booking': {
        const detail = {
          items: cart.lines(),
          subtotalCents: cart.totals().subtotalCents,
          text: cart.text({ withTotals: true, withShipping: false }),
        }
        // Decoupled hand-off: the booking module listens for this, nobody imports anybody.
        document.dispatchEvent(new CustomEvent('kw:cart-to-booking', { detail }))
        // Focus goes back to the cart button (preventScroll), then the page
        // moves to the booking form — so keyboard focus is never dumped on body.
        closeCart()
        const book = document.getElementById('book')
        if (book) book.scrollIntoView({ block: 'start' })
        say('Added to your booking notes. Free drop-off on the visit.')
        break
      }
      default:
        break
    }
  }

  function onChangeEvent(event) {
    const el = event.target
    if (el.dataset?.act === 'set') cart.setQty(el.dataset.id, el.value)
  }

  for (const root of roots) {
    root.addEventListener('click', onClick)
    root.addEventListener('change', onChangeEvent)
  }

  // Tab click selection (keyboard arrows handled above).
  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tabs.indexOf(tab)))
  }

  selectTab(0, { announce: false })
  render()
}
