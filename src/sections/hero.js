import { HERO, BRAND } from '../data/content.js'
import { iconDive } from './svg.js'

export function renderHero() {
  return `
<section class="sx-hero" id="top">
  <div class="sx-hero__scrim" aria-hidden="true"></div>

  <div class="sx-hero__inner wrap">
    <p class="sx-hero__kicker">${HERO.kicker}</p>
    <h1 class="sx-hero__title">${HERO.headline}</h1>
    <p class="sx-hero__sub">${HERO.sub}</p>

    <div class="sx-hero__ctas">
      <a class="btn" href="${HERO.ctaPrimary.href}">${HERO.ctaPrimary.label}</a>
      <a class="btn btn--ghost" href="${HERO.ctaSecondary.href}">${HERO.ctaSecondary.label}</a>
    </div>

    <p class="sx-hero__meta">
      <span>${BRAND.area}</span>
      <span class="sx-hero__dot" aria-hidden="true">&bull;</span>
      <span>${BRAND.hours}</span>
    </p>
  </div>

  <p class="sx-hero__hint">
    <span>${HERO.scrollHint}</span>
    <span class="sx-hero__arrow">${iconDive()}</span>
  </p>
</section>

<div class="sx-band" aria-hidden="true">
  <div class="sx-sentinel" id="sx-stick-sentinel"></div>
</div>`
}
