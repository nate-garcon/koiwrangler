import { BRAND, FOOTER_QUIPS } from '../data/content.js'
import { NAV } from './header.js'
import { markKoiLasso } from './svg.js'

export function renderFooter() {
  const year = new Date().getFullYear()
  const [lineA, lineB] = BRAND.nameStacked
  // One at random per load. The site's joke is about the site, never about
  // anybody who works here.
  const quip = FOOTER_QUIPS[Math.floor(Math.random() * FOOTER_QUIPS.length)]

  return `
<footer class="sx-footer" aria-label="Site footer">
  <div class="wrap sx-footer__grid">

    <div class="sx-footer__brand">
      <span class="sx-footer__mark">${markKoiLasso('sx-footer__svg')}</span>
      <p class="sx-footer__word">
        <span>${lineA}</span><span>${lineB}</span>
      </p>
      <p class="sx-footer__tag">${BRAND.tagline}</p>
    </div>

    <div class="sx-footer__col">
      <h2 class="sx-footer__h">Get hold of me</h2>
      <ul class="sx-footer__list">
        <li><a href="${BRAND.phoneHref}">${BRAND.phone}</a></li>
        <li><a href="mailto:${BRAND.email}">${BRAND.email}</a></li>
        <li>${BRAND.hours}</li>
        <li>${BRAND.area}</li>
      </ul>
    </div>

    <div class="sx-footer__col">
      <h2 class="sx-footer__h">Pages</h2>
      <nav aria-label="Footer">
        <ul class="sx-footer__list">
          ${NAV.map((n) => `<li><a href="${n.href}">${n.label}</a></li>`).join('')}
          <li><a href="#book">Book online</a></li>
        </ul>
      </nav>
    </div>

    <div class="sx-footer__col sx-footer__note">
      <h2 class="sx-footer__h">The small print</h2>
      <p>
        The Koi Wrangler is a brand-new, one-man business. No awards, no
        certifications, no twenty-year history &mdash; just cleaning work done
        carefully and priced in the open.
      </p>
      <p>
        General liability insured. Certificate on request. I do not diagnose or
        treat sick fish; for that you want a koi vet, and I will give you names.
      </p>
    </div>

  </div>

  <div class="wrap sx-footer__base">
    <p>&copy; ${year} ${BRAND.name}</p>
    <p class="sx-footer__quip">${quip}</p>
    <p><a href="#top">Back to the top</a></p>
  </div>
</footer>`
}
