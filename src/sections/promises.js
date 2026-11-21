import { PROMISES } from '../data/content.js'
import { icon } from './svg.js'

export function renderPromises() {
  const cards = PROMISES.map((p, i) => `
    <li class="sx-promise card reveal" style="--sx-i:${i}">
      <span class="sx-promise__medal sx-promise__mark">${icon(p.icon, { size: 40, className: 'sx-ico sx-promise__ico' })}</span>
      <h3 class="sx-promise__title">${p.title}</h3>
      <p class="sx-promise__body">${p.body}</p>
    </li>`).join('')

  return `
<section class="sx-section sx-promises" id="promises" aria-labelledby="sx-promises-h">
  <div class="wrap">
    <div class="sx-section__head reveal">
      <p class="eyebrow">What you actually get</p>
      <h2 class="sx-h2" id="sx-promises-h">Four promises, and nothing I cannot back up</h2>
      <p class="sx-section__lede">
        No testimonials on this page, because the business is new and I will not
        invent them. These are the four things I will put my name to today.
      </p>
    </div>
    <ul class="sx-promises__grid">${cards}</ul>
  </div>
</section>`
}
