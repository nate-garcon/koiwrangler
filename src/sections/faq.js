import { FAQ } from '../data/content.js'
import { iconChevron } from './svg.js'

export function renderFaq() {
  const items = FAQ.map((item, i) => `
    <li class="sx-faq__item reveal" style="--sx-i:${i}">
      <details class="sx-faq__d">
        <summary class="sx-faq__q">
          <span class="sx-faq__qtext">${item.q}</span>
          <span class="sx-faq__icon" aria-hidden="true">${iconChevron()}</span>
        </summary>
        <div class="sx-faq__a"><p>${item.a}</p></div>
      </details>
    </li>`).join('')

  return `
<section class="sx-section sx-faq" id="faq" aria-labelledby="sx-faq-h">
  <div class="wrap">
    <div class="sx-section__head reveal">
      <p class="eyebrow">Straight answers</p>
      <h2 class="sx-h2" id="sx-faq-h">Questions, including the awkward ones</h2>
    </div>
    <ul class="sx-faq__list">${items}</ul>
  </div>
</section>`
}
