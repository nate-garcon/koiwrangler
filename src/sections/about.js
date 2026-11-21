import { ABOUT } from '../data/content.js'
import { markBrand } from './svg.js'

export function renderAbout() {
  const paras = ABOUT.body
    .map((p, i) => `<p class="sx-about__p${i === 0 ? ' sx-about__p--lead' : ''}">${p}</p>`)
    .join('')

  return `
<section class="sx-section sx-about" id="about" aria-labelledby="sx-about-h">
  <div class="wrap sx-about__grid">

    <div class="sx-about__aside reveal" aria-hidden="true">
      <span class="sx-about__brandmark">${markBrand()}</span>
      <p class="sx-about__stamp">New<br />outfit</p>
      <p class="sx-about__stampsub">One man, one truck, one honest price</p>
    </div>

    <div class="sx-about__body reveal">
      <p class="eyebrow">${ABOUT.eyebrow}</p>
      <h2 class="sx-h2" id="sx-about-h">${ABOUT.title}</h2>
      ${paras}
      <p class="sx-about__sig">${ABOUT.signature}</p>
    </div>

  </div>
</section>`
}
