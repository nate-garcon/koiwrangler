/**
 * All of the booking markup, built once. Steps are swapped in place with the
 * `hidden` attribute rather than re-rendered, so focus and typed values are
 * never lost. Only derived text (prices, errors, the quote panel) is updated
 * afterwards by index.js.
 *
 * Nothing in here invents copy about expertise or urgency: service names,
 * prices, sizes and travel terms all come from src/data.
 */
import { SERVICES, POND_SIZES, TRAVEL, HOURLY_LABOUR, formatUSD } from '../data/services.js'
import { BRAND } from '../data/content.js'
import { priceLabel, unitSuffix, urgentService } from './quote.js'
import { tomorrowISO } from './validate.js'

export const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]))

export const STEPS = [
  { key: 'needs', nav: 'Pond needs', title: 'What does your pond need?' },
  { key: 'size', nav: 'Pond size', title: 'How big is the pond?' },
  { key: 'when', nav: 'Where & when', title: 'Where is it, and when suits you?' },
  { key: 'you', nav: 'Your details', title: 'Your details' },
]

const req = '<span class="bk-req">required</span>'

function err(field) {
  return `<p class="bk-err" id="bk-err-${field}" hidden></p>`
}

/* ---------- step 1 ---------- */

/** The main job: a full card, because this is the decision being made. */
function serviceCard(svc) {
  const id = `bk-primary-${svc.id}`
  return `
    <div class="bk-card">
      <input class="bk-card__in" type="radio" name="primary" id="${esc(id)}" value="${esc(svc.id)}"
             aria-describedby="bk-err-primary">
      <label class="bk-card__lbl" for="${esc(id)}">
        <span class="bk-card__top">
          <span class="bk-card__name">${esc(svc.name)}</span>
          <span class="bk-card__price" data-price-for="${esc(svc.id)}">${esc(priceLabel(svc.id, 'md'))}</span>
        </span>
        <span class="bk-card__tag">${esc(svc.tagline)}</span>
        <span class="bk-card__meta">${esc(svc.duration)}${svc.unit === 'month' ? ' · month to month, no contract' : ''}</span>
      </label>
    </div>`
}

/**
 * An add-on is a modifier on a decision already made, so it gets one quiet
 * row — never a second copy of the card above it. Name and live price only;
 * the full description for the same service is already on screen.
 */
function addonRow(svc) {
  const id = `bk-addon-${svc.id}`
  return `
    <div class="bk-row" data-addon-row="${esc(svc.id)}">
      <input class="bk-row__in" type="checkbox" name="addon" id="${esc(id)}" value="${esc(svc.id)}"
             aria-describedby="bk-hint-addon">
      <label class="bk-row__lbl" for="${esc(id)}">
        <span class="bk-row__name">${esc(svc.name)}</span>
        <span class="bk-row__price" data-price-for="${esc(svc.id)}">${esc(priceLabel(svc.id, 'md'))}</span>
      </label>
    </div>`
}

function stepNeeds() {
  // The emergency call-out is priced on its own terms, so it is a main job
  // only — it never appears in the add-on list.
  const addonable = SERVICES.filter((s) => !s.urgent)
  return `
    <fieldset class="bk-fs">
      <legend>Pick the main job ${req}</legend>
      ${err('primary')}
      <div class="bk-cards">${SERVICES.map((s) => serviceCard(s)).join('')}</div>
    </fieldset>

    <div class="bk-inc" data-inc hidden>
      <h4 class="bk-inc__h">What that includes</h4>
      <ul class="bk-inc__list" data-inc-list></ul>
    </div>

    <fieldset class="bk-fs bk-fs--addons">
      <legend>Add anything else <span class="bk-opt">optional</span></legend>
      <p class="bk-rows__empty" data-addon-empty>Pick a main job first and I will show you what can be added to it.</p>
      <p class="bk-hint" id="bk-hint-addon" data-addon-hint hidden>Same prices as above, nothing is pre-ticked, and you can add them on the day instead.</p>
      <div class="bk-rows" data-addon-list hidden>${addonable.map((s) => addonRow(s)).join('')}</div>
    </fieldset>`
}

/* ---------- step 2 ---------- */

function stepSize() {
  const custom = POND_SIZES.find((p) => p.multiplier === null)
  return `
    <fieldset class="bk-fs">
      <legend>How big is the pond? ${req}</legend>
      <p class="bk-hint" id="bk-hint-size">Water volume, roughly — nobody expects you to have measured it. If you are between two, pick the bigger one; I would rather plan for a long day than rush yours.</p>
      ${err('size')}
      <div class="bk-seg bk-seg--sizes">
        ${POND_SIZES.map(
          (p) => `
        <div class="bk-seg__item">
          <input class="bk-seg__in" type="radio" name="size" id="bk-size-${esc(p.key)}" value="${esc(p.key)}"
                 aria-describedby="bk-hint-size bk-err-size">
          <label class="bk-seg__lbl" for="bk-size-${esc(p.key)}">
            <span class="bk-seg__name">${esc(p.label)}</span>
            <span class="bk-seg__gal">${esc(p.gallons)}</span>
            <span class="bk-seg__hint">${esc(p.hint)}</span>
          </label>
        </div>`
        ).join('')}
      </div>
    </fieldset>
    <div class="bk-flag bk-flag--custom" data-xl-note hidden role="status">
      <strong>${esc(custom ? custom.label : 'That size')} means a site visit and a written quote.</strong>
      <span>A pond of ${esc(custom ? custom.gallons : 'that size')} is too big for me to put a number on from a web form, so I am not going to pretend otherwise. The price panel stays blank, you still fill the rest in, and I come and look before anyone commits to anything.</span>
    </div>`
}

/* ---------- step 3 ---------- */

function stepWhen() {
  const em = urgentService()
  const emTerms = em
    ? `${esc(formatUSD(em.basePrice))} call-out, then ${esc(formatUSD(HOURLY_LABOUR))} an hour labour`
    : ''
  return `
    <div class="bk-grid">
      <div class="bk-field bk-field--wide">
        <label for="bk-f-address">Street address ${req}</label>
        ${err('address')}
        <input id="bk-f-address" name="address" type="text" autocomplete="street-address"
               aria-describedby="bk-err-address" enterkeyhint="next">
      </div>
      <div class="bk-field">
        <label for="bk-f-city">Town or city ${req}</label>
        ${err('city')}
        <input id="bk-f-city" name="city" type="text" autocomplete="address-level2" aria-describedby="bk-err-city">
      </div>
      <div class="bk-field">
        <label for="bk-f-zip">ZIP ${req}</label>
        ${err('zip')}
        <input id="bk-f-zip" name="zip" type="text" inputmode="numeric" autocomplete="postal-code"
               maxlength="10" aria-describedby="bk-err-zip">
      </div>
      <div class="bk-field bk-field--wide">
        <label for="bk-f-miles">Roughly how many miles from my base? ${req}</label>
        <p class="bk-hint" id="bk-hint-miles">${esc(TRAVEL.note)} Your best guess is fine — the exact mileage is confirmed before I drive out.</p>
        ${err('miles')}
        <input id="bk-f-miles" name="miles" type="number" min="0" max="1000" step="1"
               inputmode="numeric" aria-describedby="bk-hint-miles bk-err-miles">
      </div>
      <div class="bk-field">
        <label for="bk-f-date">Preferred date ${req}</label>
        <p class="bk-hint" id="bk-hint-date">Earliest is tomorrow. ${esc(BRAND.hours)}.</p>
        ${err('date')}
        <input id="bk-f-date" name="date" type="date" min="${esc(tomorrowISO())}"
               aria-describedby="bk-hint-date bk-err-date">
        <p class="bk-advice" data-day-advice hidden></p>
      </div>
      <fieldset class="bk-fs bk-fs--inline">
        <legend>Time of day ${req}</legend>
        ${err('timePref')}
        <div class="bk-seg bk-seg--time">
          ${[
            { v: 'morning', l: 'Morning' },
            { v: 'afternoon', l: 'Afternoon' },
            { v: 'either', l: 'Either is fine' },
          ]
            .map(
              (o) => `
          <div class="bk-seg__item">
            <input class="bk-seg__in" type="radio" name="timePref" id="bk-time-${o.v}" value="${o.v}"
                   aria-describedby="bk-err-timePref">
            <label class="bk-seg__lbl bk-seg__lbl--sm" for="bk-time-${o.v}"><span class="bk-seg__name">${o.l}</span></label>
          </div>`
            )
            .join('')}
        </div>
        <p class="bk-hint">A preference, not a promise — I confirm the actual slot when I reply.</p>
      </fieldset>
    </div>

    <div class="bk-check bk-check--emg">
      <input type="checkbox" id="bk-f-emergency" name="emergency" aria-describedby="bk-hint-emergency">
      <label for="bk-f-emergency">Is this an emergency? (green water overnight, dead pump, overflow)</label>
      <p class="bk-hint" id="bk-hint-emergency">Ticking this changes how it is priced, so it is worth reading what appears.</p>
    </div>
    <div class="bk-flag bk-flag--emg" data-emg-note hidden role="status">
      ${em ? `<strong>${esc(em.name)}: ${emTerms}.</strong>` : ''}
      <span>An emergency total cannot be fixed in advance and I will not pretend it can — the time it takes depends on what I find. You get told the running total before I start and again as I go, and you can stop me at any point.</span>
      ${em ? `<ul class="bk-flag__list">${em.includes.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
      <p class="bk-flag__p" data-emg-locked hidden>You picked the call-out as the main job, so this stays ticked.</p>
    </div>`
}

/* ---------- step 4 ---------- */

function stepYou() {
  return `
    <div class="bk-grid">
      <div class="bk-field">
        <label for="bk-f-name">Your name ${req}</label>
        ${err('name')}
        <input id="bk-f-name" name="name" type="text" autocomplete="name" aria-describedby="bk-err-name">
      </div>
      <div class="bk-field">
        <label for="bk-f-phone">Phone ${req}</label>
        <p class="bk-hint" id="bk-hint-phone">Any format. This is how you get a text if I am running late.</p>
        ${err('phone')}
        <input id="bk-f-phone" name="phone" type="tel" autocomplete="tel" aria-describedby="bk-hint-phone bk-err-phone">
      </div>
      <div class="bk-field bk-field--wide">
        <label for="bk-f-email">Email ${req}</label>
        ${err('email')}
        <input id="bk-f-email" name="email" type="email" autocomplete="email" spellcheck="false" aria-describedby="bk-err-email">
      </div>
      <div class="bk-field bk-field--wide">
        <label for="bk-f-notes">Anything I should know? <span class="bk-opt">optional</span></label>
        <p class="bk-hint" id="bk-hint-notes">Gate codes, a dog, how deep the muck is, how many fish. Supplies added from the shop land here too.</p>
        <textarea id="bk-f-notes" name="notes" rows="4" aria-describedby="bk-hint-notes"></textarea>
        <p class="bk-advice" data-notes-advice hidden></p>
      </div>
    </div>

    <div class="bk-check bk-check--consent">
      <input type="checkbox" id="bk-f-consent" name="consent" aria-describedby="bk-err-consent">
      <label for="bk-f-consent">I understand the price above assumes a normal pond for its size, and that anything genuinely unexpected — a cracked liner, a dead pump, years of leaf mulch — gets re-quoted on the spot and agreed with me before any extra work happens. ${req}</label>
      ${err('consent')}
    </div>`
}

/* ---------- shell ---------- */

export function shellHTML() {
  const bodies = [stepNeeds(), stepSize(), stepWhen(), stepYou()]
  return `
  <div class="bk">
    <div class="bk-restored card" data-restored hidden>
      <p class="bk-restored__p">We kept your answers from last time, so you do not have to type them again.</p>
      <div class="bk-restored__acts">
        <button type="button" class="btn btn--sm bk-btn--quiet" data-act="discard-draft">Start fresh</button>
        <button type="button" class="btn btn--sm bk-btn--quiet" data-act="dismiss-restored">Got it</button>
      </div>
    </div>

    <div class="bk-layout">
      <form class="bk-form" novalidate autocomplete="on">
        <ol class="bk-prog" data-prog aria-label="Booking progress">
          ${STEPS.map(
            (s, i) => `
          <li class="bk-prog__i">
            <button type="button" class="bk-prog__btn" data-goto="${i}">
              <span class="bk-prog__n" aria-hidden="true">${i + 1}</span>
              <span class="bk-prog__t">${esc(s.nav)}</span>
              <span class="visually-hidden"> — step ${i + 1} of ${STEPS.length}</span>
            </button>
          </li>`
          ).join('')}
        </ol>

        <p class="bk-alert" data-alert role="alert" hidden></p>
        <p class="bk-say" data-say role="status" aria-live="polite"></p>

        ${STEPS.map(
          (s, i) => `
        <section class="bk-step" role="group" data-step="${i}" tabindex="-1" aria-labelledby="bk-h-${i}" ${i === 0 ? '' : 'hidden'}>
          <p class="eyebrow bk-step__eyebrow">Step ${i + 1} of ${STEPS.length}</p>
          <h3 class="bk-step__h" id="bk-h-${i}">${esc(s.title)}</h3>
          ${bodies[i]}
        </section>`
        ).join('')}

        <div class="bk-nav">
          <button type="button" class="btn btn--sm bk-btn--quiet" data-act="back" hidden>Back</button>
          <button type="button" class="btn btn--brass" data-act="next">Next</button>
          <button type="submit" class="btn btn--koi bk-submit" data-act="submit" hidden>Request this booking</button>
        </div>
        <p class="bk-fine">No payment now, and nothing is charged through this website. Submitting sends me the details — I confirm the slot with you.</p>
      </form>

      <aside class="bk-quote" aria-label="Your running quote">
        <details class="bk-q" data-q-box open>
          <summary class="bk-q__sum" data-q-summary>
            <span class="bk-q__sum-l">Your quote</span>
            <span class="bk-q__sum-amt" data-q="summary-amount"></span>
          </summary>
          <div class="bk-q__body">
            <h3 class="bk-q__h">Your quote</h3>
            <ul class="bk-q__lines" data-q="lines"></ul>
            <div class="bk-q__total" data-q="total-wrap" role="status" aria-live="polite" aria-atomic="true">
              <span class="bk-q__total-l" data-q="total-label"></span>
              <strong class="bk-q__total-amt" data-q="total-amount"></strong>
              <p class="bk-q__monthly" data-q="monthly" hidden></p>
            </div>
            <div data-q="note" hidden></div>
            <p class="bk-q__fine">Prices assume a normal pond for its size. Anything genuinely unexpected gets re-quoted on the spot before work carries on — that is the whole deal, and it is the box you tick in step 4.</p>
          </div>
        </details>
      </aside>
    </div>

    <div class="bk-done card" data-done hidden tabindex="-1"></div>
  </div>`
}
