/**
 * RESPECTFUL HANDLING — the practical half of the nishikigoi section.
 *
 * Everything factual about the service itself is READ FROM src/data/services.js
 * (the `fish-move` entry): the four `includes` lines and the price are not
 * retyped here, so changing the data changes this section too. What this file
 * adds is the *why* behind each line, which is the part a customer is actually
 * paying for and the part the price list has no room for.
 *
 * CLAIMS CONTRACT (src/data/content.js): nothing here says Michael knows
 * anything about koi health. The argument is deliberately about equipment,
 * water and not rushing — things that are true of a careful labourer — and the
 * section ends by pointing fish-health questions somewhere else, exactly as
 * the FAQ already does.
 */
import { SERVICES, priceFor, formatUSD } from '../data/services.js'
import { icon } from './svg.js'

const MOVE = SERVICES.find((s) => s.id === 'fish-move')

/**
 * The reason behind each line of the service, matched to the data by keyword
 * rather than by position, so reordering or rewording `includes` in
 * services.js cannot silently pair the wrong reason with the wrong line. An
 * `includes` line that matches nothing simply renders without a reason.
 */
const REASONS = [
  {
    match: /knotless|net/i,
    icon: 'koi-net',
    why: 'A koi is covered in a slime coat, and that coat is the layer that '
      + 'keeps infection out. A knotted net scrapes it off in patches. The net '
      + 'is the cheapest thing on the truck and the one that does the most '
      + 'damage when it is the wrong one.',
  },
  {
    match: /tank|aerat/i,
    icon: 'air-pump',
    why: 'Pond water, not tap water, so nothing about the chemistry changes '
      + 'while the fish is out. The air stone is there because a holding tank '
      + 'is a crowded place, and crowded water runs short of oxygen long before '
      + 'it looks like it has.',
  },
  {
    match: /temperature/i,
    icon: 'thermometer',
    why: 'Fish go back into water the same temperature as the water they came '
      + 'out of. If the tank and the refilled pond disagree, the tank waits — '
      + 'that wait is part of the job, not an overrun.',
  },
  {
    match: /count/i,
    icon: 'ledger',
    why: 'Koi hide, and they are very good at it: a small one will sit in a '
      + 'skimmer basket or under a fold of liner and say nothing about it. '
      + 'Counting out and counting back in is how anyone knows for certain that '
      + 'everybody is home.',
  },
]

const reasonFor = (line) => REASONS.find((r) => r.match.test(line)) || null

export function renderHandling() {
  // Defensive: this section is an argument about a real line item. If that
  // line item is ever removed from the data, the section removes itself rather
  // than advertising something that is no longer sold.
  if (!MOVE) return ''

  const steps = (MOVE.includes || []).map((line, i) => {
    const r = reasonFor(line)
    return `
    <li class="sx-hand__step reveal" style="--sx-i:${i}">
      <span class="sx-hand__ico" aria-hidden="true">${r ? icon(r.icon, { size: 34, className: 'sx-ico sx-hand__mark' }) : ''}</span>
      <h3 class="sx-hand__what">${line}</h3>
      ${r ? `<p class="sx-hand__why">${r.why}</p>` : ''}
    </li>`
  }).join('')

  const from = formatUSD(priceFor(MOVE.id, 'sm'))

  return `
<section class="sx-section sx-hand" id="handling" aria-labelledby="sx-hand-h">
  <div class="wrap">

    <div class="sx-section__head reveal">
      <p class="eyebrow">Why the careful bit costs money</p>
      <h2 class="sx-h2" id="sx-hand-h">Fish that outlive the pond</h2>
      <p class="sx-section__lede">
        Koi routinely live twenty to fifty years, and they get handed down:
        bought by one generation, inherited by the next. The fish in your pond
        may well outlive the liner, the pump and &mdash; put plainly &mdash;
        sometimes the person who bought them. That is the whole reason the
        netting half of a clean is done slowly.
      </p>
    </div>

    <ul class="sx-hand__steps">${steps}</ul>

    <div class="sx-hand__item reveal">
      <div class="sx-hand__itemtext">
        <p class="sx-hand__itemname">${MOVE.name}</p>
        <p class="sx-hand__itemsub">
          ${MOVE.tagline} From ${from} for a small pond, ${MOVE.duration}.
        </p>
      </div>
      <a class="btn btn--sm" href="#services">See it on the price list</a>
    </div>

    <p class="sx-hand__note">
      None of this is fish medicine &mdash; it is handling: the right net, the
      right water, and not being in a hurry. If something is actually wrong
      with a fish, that is a koi vet&rsquo;s call or an experienced
      breeder&rsquo;s, and you will be told so and given a name rather than
      guessed at.
    </p>
  </div>
</section>`
}
