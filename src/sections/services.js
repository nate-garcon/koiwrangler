import { SERVICES, POND_SIZES, TRAVEL, priceFor, formatUSD } from '../data/services.js'

const DEFAULT_SIZE = 'md'

const UNIT_LABEL = {
  visit: 'per visit',
  month: 'per month',
  hour: 'per hour',
  flat: 'call-out, then hourly',
}

function sizeControl() {
  return POND_SIZES.map((s) => `
    <label class="sx-seg__opt">
      <input class="sx-seg__input visually-hidden" type="radio" name="sx-pond-size"
             value="${s.key}" ${s.key === DEFAULT_SIZE ? 'checked' : ''} />
      <span class="sx-seg__face">
        <span class="sx-seg__label">${s.label}</span>
        <span class="sx-seg__gal">${s.gallons}</span>
      </span>
    </label>`).join('')
}

function priceBlock(svc) {
  const price = priceFor(svc.id, DEFAULT_SIZE)
  return `
  <p class="sx-svc__price">
    <span class="sx-svc__amount" data-sx-price="${svc.id}">${formatUSD(price)}</span>
    <span class="sx-svc__unit" data-sx-unit="${svc.id}" ${price == null ? 'hidden' : ''}>
      ${UNIT_LABEL[svc.unit] || svc.unit}
    </span>
  </p>
  <p class="sx-svc__pricenote" data-sx-pricenote="${svc.id}">
    ${svc.scales ? 'Price shown for the pond size selected above.' : 'Flat rate, any pond size.'}
  </p>`
}

function card(svc, i) {
  const classes = [
    'sx-svc', 'card', 'reveal',
    svc.popular ? 'sx-svc--popular' : '',
    svc.urgent ? 'sx-svc--urgent' : '',
  ].filter(Boolean).join(' ')

  return `
  <li class="${classes}" style="--sx-i:${i}">
    ${svc.popular ? '<p class="sx-svc__ribbon">Michael&rsquo;s pick</p>' : ''}
    <div class="sx-svc__head">
      <h3 class="sx-svc__name">${svc.name}</h3>
      ${svc.urgent ? '<p class="sx-svc__urgent">Urgent line</p>' : ''}
      <p class="sx-svc__tagline">${svc.tagline}</p>
    </div>

    ${priceBlock(svc)}

    <p class="sx-svc__dur">
      <span class="sx-svc__dur-key">On site</span>
      <span class="sx-svc__dur-val">${svc.duration}</span>
    </p>

    <ul class="sx-svc__includes">
      ${svc.includes.map((inc) => `<li>${inc}</li>`).join('')}
    </ul>

    <a class="btn btn--brass btn--sm sx-svc__cta" href="#book">
      Book this<span class="visually-hidden"> — ${svc.name}</span>
    </a>
  </li>`
}

export function renderServices() {
  const def = POND_SIZES.find((s) => s.key === DEFAULT_SIZE) || POND_SIZES[0]

  return `
<section class="sx-section sx-services" id="services" aria-labelledby="sx-services-h">
  <div class="wrap">
    <div class="sx-section__head reveal">
      <p class="eyebrow">Services &amp; real prices</p>
      <h2 class="sx-h2" id="sx-services-h">Pick your pond size. See the number.</h2>
      <p class="sx-section__lede">
        Every price on this page is the price I will quote you. Choose a size and
        the whole list re-figures itself.
      </p>
    </div>

    <form class="sx-sizer reveal" id="sx-sizer">
      <fieldset class="sx-sizer__set">
        <legend class="sx-sizer__legend">How big is your pond?</legend>
        <div class="sx-seg">${sizeControl()}</div>
      </fieldset>
      <p class="sx-sizer__hint">
        <strong data-sx-size-label>${def.label}</strong>
        <span data-sx-size-hint>${def.hint}</span>
      </p>
    </form>

    <ul class="sx-services__grid">
      ${SERVICES.map(card).join('')}
    </ul>

    <p class="sx-travel reveal">
      <span class="sx-travel__tag">Travel</span>
      <span>${TRAVEL.note}</span>
    </p>
  </div>
</section>`
}

/** Re-prices every card live when the pond size changes. */
export function wireServices() {
  const form = document.getElementById('sx-sizer')
  if (!form) return

  const apply = (key) => {
    const size = POND_SIZES.find((s) => s.key === key)

    SERVICES.forEach((svc) => {
      const price = priceFor(svc.id, key)
      const amount = form.ownerDocument.querySelector(`[data-sx-price="${svc.id}"]`)
      const unit = form.ownerDocument.querySelector(`[data-sx-unit="${svc.id}"]`)
      const note = form.ownerDocument.querySelector(`[data-sx-pricenote="${svc.id}"]`)
      if (amount) amount.textContent = formatUSD(price)
      if (unit) unit.hidden = price == null
      if (note && svc.scales) {
        note.textContent = price == null
          ? 'Estates and commercial ponds are quoted on site, not guessed at.'
          : 'Price shown for the pond size selected above.'
      }
    })

    const label = document.querySelector('[data-sx-size-label]')
    const hint = document.querySelector('[data-sx-size-hint]')
    if (size && label) label.textContent = size.label
    if (size && hint) hint.textContent = size.hint
  }

  form.addEventListener('change', (e) => {
    const input = e.target
    if (input && input.name === 'sx-pond-size') apply(input.value)
  })
}
