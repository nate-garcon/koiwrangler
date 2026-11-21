/**
 * THE BOOKING FLOW.
 *
 * A four-step wizard in one page: all four steps live in the DOM at once and
 * are swapped with `hidden`, so nothing the customer typed is ever thrown
 * away by a re-render. index.js owns state, wiring and submission; the maths
 * is in quote.js, the rules are in validate.js, the markup is in steps.js.
 */
import { SERVICES, POND_SIZES } from '../data/services.js'
import { BRAND } from '../data/content.js'
import { shellHTML, STEPS, esc } from './steps.js'
import { computeQuote, renderQuote, priceLabel, serviceById, sizeByKey, urgentService } from './quote.js'
import {
  STEP_FIELDS,
  FIELD_STEP,
  VALIDATORS,
  validateStep,
  validateAll,
  dayAdvice,
  tomorrowISO,
} from './validate.js'
import { loadDraft, saveDraft, clearDraft } from './storage.js'
import { buildPayload, summaryRows, mailtoHref } from './summary.js'
import { hasBackend, submitBooking } from '../api.js'

const TEXT_FIELDS = ['address', 'city', 'zip', 'miles', 'date', 'name', 'phone', 'email', 'notes']
const TIME_PREFS = ['morning', 'afternoon', 'either']
const SUPPLIES_START = '--- Supplies to bring (from the shop) ---'
const SUPPLIES_END = '--- end supplies ---'

function defaults() {
  return {
    primary: '',
    addons: [],
    size: POND_SIZES.some((p) => p.key === 'md') ? 'md' : POND_SIZES[0]?.key || '',
    address: '',
    city: '',
    zip: '',
    miles: '',
    date: '',
    timePref: 'either',
    emergency: false,
    name: '',
    phone: '',
    email: '',
    notes: '',
    consent: false,
    step: 0,
  }
}

/** Never trust what came out of localStorage: validate every value against the data. */
function sanitize(raw) {
  const s = defaults()
  if (!raw || typeof raw !== 'object') return s
  if (SERVICES.some((x) => x.id === raw.primary)) s.primary = raw.primary
  if (Array.isArray(raw.addons)) {
    s.addons = raw.addons.filter((id) => SERVICES.some((x) => x.id === id)).slice(0, SERVICES.length)
  }
  if (POND_SIZES.some((p) => p.key === raw.size)) s.size = raw.size
  for (const k of TEXT_FIELDS) if (typeof raw[k] === 'string') s[k] = raw[k].slice(0, 2000)
  if (TIME_PREFS.includes(raw.timePref)) s.timePref = raw.timePref
  s.emergency = raw.emergency === true
  s.consent = raw.consent === true
  if (Number.isInteger(raw.step) && raw.step >= 0 && raw.step < STEPS.length) s.step = raw.step
  // A saved date that has since gone past would restore as an error. Drop it.
  if (s.date && s.date < tomorrowISO()) s.date = ''
  return s
}

function hasAnswers(s) {
  return Boolean(
    s.primary ||
      s.addons.length ||
      s.consent ||
      s.emergency ||
      TEXT_FIELDS.some((k) => String(s[k] || '').trim())
  )
}

export function initBooking(mount) {
  if (!mount || mount.dataset.bkReady === '1') return
  mount.dataset.bkReady = '1'
  mount.innerHTML = shellHTML()

  const $ = (sel) => mount.querySelector(sel)
  const $$ = (sel) => Array.from(mount.querySelectorAll(sel))

  const form = $('.bk-form')
  const layout = $('.bk-layout')
  const stepEls = $$('.bk-step')
  const progBtns = $$('.bk-prog__btn')
  const alertEl = $('[data-alert]')
  const sayEl = $('[data-say]')
  const backBtn = $('[data-act="back"]')
  const nextBtn = $('[data-act="next"]')
  const submitBtn = $('[data-act="submit"]')
  const doneEl = $('[data-done]')
  const restoredEl = $('[data-restored]')
  const xlNote = $('[data-xl-note]')
  const emgNote = $('[data-emg-note]')
  const emgLocked = $('[data-emg-locked]')
  const addonEmpty = $('[data-addon-empty]')
  const addonHint = $('[data-addon-hint]')
  const addonList = $('[data-addon-list]')
  const incBox = $('[data-inc]')
  const incHead = $('.bk-inc__h')
  const incList = $('[data-inc-list]')
  const dayAdviceEl = $('[data-day-advice]')
  const notesAdviceEl = $('[data-notes-advice]')
  const qBox = $('[data-q-box]')

  const qRefs = {
    lines: $('[data-q="lines"]'),
    totalWrap: $('[data-q="total-wrap"]'),
    totalLabel: $('[data-q="total-label"]'),
    totalAmount: $('[data-q="total-amount"]'),
    monthly: $('[data-q="monthly"]'),
    note: $('[data-q="note"]'),
    summaryAmount: $('[data-q="summary-amount"]'),
  }

  const stored = loadDraft()
  const state = sanitize(stored)
  const restoring = stored ? hasAnswers(state) : false
  // Remembered separately from state.emergency, which is forced true while the
  // emergency call-out IS the main job. Un-picking that job restores the choice
  // the customer actually made rather than leaving the box stuck on.
  let userWantsEmergency = state.emergency

  /* ---------- form <-> state ---------- */

  function controlsFor(field) {
    return $$(`[name="${field}"]`)
  }

  function writeToForm() {
    for (const el of controlsFor('primary')) el.checked = el.value === state.primary
    for (const el of controlsFor('addon')) el.checked = state.addons.includes(el.value)
    for (const el of controlsFor('size')) el.checked = el.value === state.size
    for (const el of controlsFor('timePref')) el.checked = el.value === state.timePref
    for (const k of TEXT_FIELDS) {
      const el = form.elements[k]
      if (el) el.value = state[k]
    }
    if (form.elements.emergency) form.elements.emergency.checked = state.emergency
    if (form.elements.consent) form.elements.consent.checked = state.consent
  }

  function syncFromForm() {
    state.primary = controlsFor('primary').find((el) => el.checked)?.value || ''
    state.addons = controlsFor('addon')
      .filter((el) => el.checked && !el.disabled)
      .map((el) => el.value)
    state.size = controlsFor('size').find((el) => el.checked)?.value || ''
    state.timePref = controlsFor('timePref').find((el) => el.checked)?.value || ''
    for (const k of TEXT_FIELDS) state[k] = form.elements[k]?.value ?? ''
    const urgent = urgentService()
    const emgBox = form.elements.emergency
    state.emergency = Boolean(emgBox?.checked) || Boolean(urgent && state.primary === urgent.id)
    state.consent = Boolean(form.elements.consent?.checked)
  }

  /* ---------- derived UI ---------- */

  function refreshPrices() {
    for (const el of $$('[data-price-for]')) {
      el.textContent = priceLabel(el.dataset.priceFor, state.size)
    }
  }

  function refreshIncludes() {
    const svc = serviceById(state.primary)
    if (!svc) {
      incBox.hidden = true
      incList.innerHTML = ''
      return
    }
    incHead.textContent = `What ${svc.name} includes`
    incList.innerHTML = svc.includes.map((i) => `<li>${esc(i)}</li>`).join('')
    incBox.hidden = false
  }

  /**
   * Add-ons only make sense once there is a main job to add them to, so the
   * list stays out of the way until then — and a job never offers itself as
   * an add-on to itself (that row is removed, not just disabled).
   */
  function refreshAddonLocks() {
    const hasPrimary = Boolean(serviceById(state.primary))
    addonEmpty.hidden = hasPrimary
    addonHint.hidden = !hasPrimary
    addonList.hidden = !hasPrimary

    for (const el of controlsFor('addon')) {
      const isPrimary = el.value === state.primary
      el.disabled = isPrimary
      if (isPrimary) el.checked = false
      const row = el.closest('.bk-row')
      if (row) row.hidden = isPrimary
    }
    state.addons = controlsFor('addon')
      .filter((el) => el.checked && !el.disabled)
      .map((el) => el.value)
  }

  function refreshEmergency() {
    const urgent = urgentService()
    const box = form.elements.emergency
    const locked = Boolean(urgent && state.primary === urgent.id)
    if (box) {
      box.checked = locked ? true : userWantsEmergency
      box.disabled = locked
      state.emergency = box.checked
    }
    if (emgLocked) emgLocked.hidden = !locked
    emgNote.hidden = !state.emergency
  }

  function refreshSizeNote() {
    const size = sizeByKey(state.size)
    xlNote.hidden = !(size && size.multiplier === null)
  }

  function refreshDayAdvice() {
    const msg = dayAdvice(state.date)
    dayAdviceEl.textContent = msg
    dayAdviceEl.hidden = !msg
  }

  function refreshAll() {
    refreshAddonLocks()
    refreshPrices()
    refreshIncludes()
    refreshEmergency()
    refreshSizeNote()
    refreshDayAdvice()
    renderQuote(qRefs, state)
  }

  /* ---------- errors ---------- */

  function setFieldError(field, msg) {
    const box = mount.querySelector(`#bk-err-${field}`)
    if (box) {
      box.textContent = msg || ''
      box.hidden = !msg
    }
    for (const el of controlsFor(field)) {
      if (msg) el.setAttribute('aria-invalid', 'true')
      else el.removeAttribute('aria-invalid')
      el.closest('.bk-field, .bk-fs, .bk-check')?.classList.toggle('has-err', Boolean(msg))
    }
  }

  function clearErrors(fields) {
    for (const f of fields) setFieldError(f, null)
  }

  function showErrors(problems) {
    for (const p of problems) setFieldError(p.field, p.msg)
  }

  function say(msg) {
    sayEl.textContent = msg || ''
  }

  function alertMsg(msg) {
    alertEl.textContent = msg || ''
    alertEl.hidden = !msg
  }

  function focusField(field) {
    const el = controlsFor(field)[0]
    if (!el) return
    el.focus({ preventScroll: false })
  }

  /* ---------- navigation ---------- */

  function ensureVisible() {
    const rect = form.getBoundingClientRect()
    if (rect.top < 0 || rect.top > window.innerHeight * 0.8) {
      // 'instant' on purpose: base.css sets scroll-behavior:smooth globally, and
      // gliding the length of this page every time you press Next is slow and
      // disorienting. A step change should just be there.
      form.scrollIntoView({ block: 'start', behavior: 'instant' })
    }
  }

  function goTo(index, opts = {}) {
    const i = Math.max(0, Math.min(STEPS.length - 1, index))
    state.step = i
    stepEls.forEach((el, n) => {
      el.hidden = n !== i
    })
    progBtns.forEach((btn, n) => {
      if (n === i) btn.setAttribute('aria-current', 'step')
      else btn.removeAttribute('aria-current')
      btn.classList.toggle('is-past', n < i)
    })
    backBtn.hidden = i === 0
    nextBtn.hidden = i === STEPS.length - 1
    submitBtn.hidden = i !== STEPS.length - 1
    if (opts.focus !== false) {
      ensureVisible()
      stepEls[i].focus({ preventScroll: true })
    }
    persist()
  }

  /** Blocks forward movement until `from` is valid. @returns true if it moved. */
  function tryAdvanceTo(target) {
    syncFromForm()
    for (let n = state.step; n < target; n++) {
      const problems = validateStep(state, n)
      if (problems.length) {
        if (n !== state.step) goTo(n, { focus: false })
        showErrors(problems)
        alertMsg(
          problems.length === 1
            ? problems[0].msg
            : `${problems.length} things on step ${n + 1} still need an answer.`
        )
        focusField(problems[0].field)
        return false
      }
      clearErrors(STEP_FIELDS[n])
    }
    alertMsg('')
    goTo(target)
    return true
  }

  /* ---------- persistence ---------- */

  let saveTimer = 0
  function persist() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      // An empty form is not a draft worth keeping — drop the key instead of
      // leaving an empty one behind (notably right after "Start fresh").
      if (hasAnswers(state)) saveDraft(state)
      else clearDraft()
    }, 250)
  }

  /* ---------- events ---------- */

  function onFormChange(event) {
    if (event.target?.name === 'emergency' && !event.target.disabled) {
      userWantsEmergency = event.target.checked === true
    }
    syncFromForm()
    refreshAll()
    const name = event.target?.name
    // Live-clear an error the moment the answer becomes valid; never add a new
    // error mid-typing (that is what blur and Next are for).
    if (name && VALIDATORS[name] && !VALIDATORS[name](state)) setFieldError(name, null)
    if (name === 'primary' || name === 'size') alertMsg('')
    persist()
  }

  form.addEventListener('input', onFormChange)
  form.addEventListener('change', onFormChange)

  form.addEventListener('focusout', (event) => {
    const name = event.target?.name
    if (!name || !VALIDATORS[name]) return
    // Radio/checkbox groups: do not nag while the user is tabbing through them.
    if (event.target.type === 'radio' || event.target.type === 'checkbox') return
    syncFromForm()
    setFieldError(name, VALIDATORS[name](state))
  })

  mount.addEventListener('click', (event) => {
    const btn = event.target.closest('button')
    if (!btn || !mount.contains(btn)) return

    const goto = btn.dataset.goto
    if (goto != null) {
      const target = Number(goto)
      if (target <= state.step) {
        alertMsg('')
        goTo(target)
      } else {
        tryAdvanceTo(target)
      }
      return
    }

    switch (btn.dataset.act) {
      case 'back':
        alertMsg('')
        goTo(state.step - 1)
        break
      case 'next':
        tryAdvanceTo(state.step + 1)
        break
      case 'dismiss-restored':
        restoredEl.hidden = true
        break
      case 'discard-draft': {
        clearDraft()
        Object.assign(state, defaults())
        userWantsEmergency = false
        writeToForm()
        clearErrors(STEP_FIELDS.flat())
        alertMsg('')
        say('Cleared. Starting fresh.')
        refreshAll()
        restoredEl.hidden = true
        goTo(0)
        break
      }
      default:
        break
    }
  })

  // Enter inside a text field should advance, not submit from step 1.
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    const t = event.target
    if (!t || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON') return
    if (state.step < STEPS.length - 1) {
      event.preventDefault()
      tryAdvanceTo(state.step + 1)
    }
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    syncFromForm()
    refreshAll()
    const problems = validateAll(state)
    clearErrors(STEP_FIELDS.flat())
    if (problems.length) {
      showErrors(problems)
      const first = problems[0]
      const step = FIELD_STEP[first.field] ?? 0
      if (step !== state.step) goTo(step, { focus: false })
      alertMsg(
        problems.length === 1
          ? first.msg
          : `${problems.length} answers are still missing — the first one is on step ${step + 1}.`
      )
      focusField(first.field)
      return
    }
    alertMsg('')
    finish()
  })

  /* ---------- submission ---------- */

  function finish() {
    const payload = buildPayload(state)

    /* ====================================================================
       The real submission. When VITE_API_BASE is set at build time this
       POSTs to the backend, which stores the booking and pings Michael and
       Eddie. With no backend configured (the static GitHub Pages build) it
       stays exactly as it was: the success panel below carries a prefilled
       mailto: and the phone number, so the booking is never lost.

       payload shape (all money in integer CENTS, USD):
         submittedAt                        ISO timestamp
         service.primary                    service id from src/data/services.js
         service.addons[]                   service ids
         pond.size | sizeLabel | gallons    POND_SIZES key + labels
         location.address | city | zip
         location.milesFromBase             number, one way
         schedule.preferredDate             'YYYY-MM-DD'
         schedule.timePreference            'morning' | 'afternoon' | 'either'
         schedule.emergency                 boolean
         contact.name | phone | email
         notes                              string (may contain a supplies list)
         acknowledgedRequoteTerms           boolean, always true on a valid submit
         quote.mode                         'fixed' | 'custom' | 'emergency'
         quote.lineItems[]                  { id, name, unit, amountCents|null }
         quote.travel                       { milesOneWay, freeRadiusMiles,
                                              billableMilesOneWay, perMile,
                                              roundTrip, amountCents }
         quote.oneOffTotalCents             null in 'custom' mode
         quote.monthlyTotalCents            null in 'custom' mode
         quote.hourlyLabour                 set only in 'emergency' mode
       ==================================================================== */
    if (hasBackend()) {
      // Deliberately not awaited before showing the success panel: the
      // customer has done their part, and the mailto fallback in that panel
      // covers us if the request fails. Never strand them on a spinner.
      submitBooking(payload).catch((err) => {
        console.warn('[booking] backend submit failed, mailto fallback stands:', err.message)
      })
    } else {
      console.info('[booking] no backend configured; mailto fallback is the path:', payload)
    }

    const q = computeQuote(state)
    const rows = summaryRows(state)
    const mailto = mailtoHref(state)

    doneEl.innerHTML = `
      <p class="eyebrow">Booking request ready</p>
      <h3 class="bk-done__h">Thanks, ${esc(state.name.trim().split(/\s+/)[0] || 'friend')} — here is exactly what you asked for.</h3>
      <dl class="bk-done__dl">
        ${rows
          .map(
            (r) =>
              `<div class="bk-done__row"><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`
          )
          .join('')}
      </dl>
      <div class="bk-done__next">
        <h4>What happens next — and the honest bit</h4>
        <p>This website has no mailbox of its own yet, so it cannot send this for me. Your summary is above and ready to go; the last step is yours, and it takes ten seconds:</p>
        <ol class="bk-done__list">
          <li><strong>Send it</strong> with the email button below — everything above is already filled in, you just press send.</li>
          <li><strong>Or call me</strong> on ${esc(BRAND.phone)} and read it off the screen.</li>
          <li>I reply to confirm the day and the time window. ${
            q.mode === 'custom'
              ? 'Because of the pond size, that reply arranges a look at it and a written quote — no number is agreed before I have seen it.'
              : q.mode === 'emergency'
                ? 'For an emergency I come same or next day, and you get the running total before I start.'
                : 'Nothing is booked, and nothing is owed, until I have confirmed it with you.'
          }</li>
        </ol>
        <div class="bk-done__acts">
          <a class="btn" href="${esc(mailto)}">Email this booking to ${esc(BRAND.email)}</a>
          <a class="btn btn--brass" href="${esc(BRAND.phoneHref)}">Call ${esc(BRAND.phone)}</a>
        </div>
        <p class="bk-fine">${esc(BRAND.hours)}. If the email button does nothing, your device has no mail app set up — call or copy the summary above instead.</p>
      </div>`

    layout.hidden = true
    restoredEl.hidden = true
    doneEl.hidden = false
    clearDraft()
    doneEl.focus({ preventScroll: true })
    doneEl.scrollIntoView({ block: 'start', behavior: 'instant' })
  }

  /* ---------- shop -> booking bridge (decoupled via a DOM event) ---------- */

  document.addEventListener('kw:cart-to-booking', (event) => {
    const detail = event.detail || {}
    const block = typeof detail.text === 'string' && detail.text.trim() ? detail.text.trim() : ''
    if (!block) return
    const notes = form.elements.notes
    if (!notes) return
    const wrapped = `${SUPPLIES_START}\n${block}\n${SUPPLIES_END}`
    const existing = notes.value
    const startAt = existing.indexOf(SUPPLIES_START)
    const endAt = existing.indexOf(SUPPLIES_END)
    if (startAt !== -1 && endAt !== -1 && endAt > startAt) {
      // Replace a previous list rather than stacking duplicates.
      notes.value = (
        existing.slice(0, startAt) +
        wrapped +
        existing.slice(endAt + SUPPLIES_END.length)
      ).trim()
    } else {
      notes.value = existing.trim() ? `${existing.trim()}\n\n${wrapped}` : wrapped
    }
    syncFromForm()
    refreshAll()
    persist()
    notesAdviceEl.textContent = 'Your supplies list was added here. Edit or delete it like any other note.'
    notesAdviceEl.hidden = false
    say('Supplies added to the notes in step 4, Your details. Free drop-off on the visit.')
  })

  /* ---------- quote panel: always open on desktop, collapsible on mobile ---------- */

  const wide = window.matchMedia('(min-width: 62rem)')
  function syncQuoteBox(isWide) {
    if (isWide) qBox.open = true
  }
  syncQuoteBox(wide.matches)
  if (!wide.matches) qBox.open = false
  qBox.addEventListener('toggle', () => syncQuoteBox(wide.matches))
  const onWideChange = (event) => {
    qBox.open = event.matches
  }
  if (typeof wide.addEventListener === 'function') wide.addEventListener('change', onWideChange)

  /* ---------- boot ---------- */

  writeToForm()
  syncFromForm()
  refreshAll()
  goTo(state.step, { focus: false })
  if (restoring) {
    restoredEl.hidden = false
    say('We kept your answers from last time.')
  }
}
