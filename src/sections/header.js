import { BRAND } from '../data/content.js'
import { markKoiLasso, iconMenu } from './svg.js'

export const NAV = [
  { label: 'Services', href: '#services' },
  { label: 'Shop', href: '#shop' },
  { label: 'About', href: '#about' },
  { label: 'FAQ', href: '#faq' },
]

const navLinks = (cls) =>
  NAV.map((n) => `<a class="${cls}" href="${n.href}">${n.label}</a>`).join('')

export function renderHeader() {
  const [lineA, lineB] = BRAND.nameStacked
  return `
<header class="sx-header" id="sx-header">
  <div class="sx-header__inner wrap">

    <a class="sx-wordmark" href="#top" aria-label="${BRAND.name} — home">
      ${markKoiLasso('sx-wordmark__mark')}
      <span class="sx-wordmark__text">
        <span class="sx-wordmark__a">${lineA}</span>
        <span class="sx-wordmark__b">${lineB}</span>
      </span>
    </a>

    <nav class="sx-nav" aria-label="Main">
      ${navLinks('sx-nav__link')}
    </nav>

    <div class="sx-header__actions">
      <a class="sx-tel" href="${BRAND.phoneHref}">
        <span class="sx-tel__label">Call</span>
        <span class="sx-tel__num">${BRAND.phone}</span>
      </a>
      <a class="btn btn--sm sx-header__book" href="#book">Book online</a>
    </div>

    <details class="sx-menu" id="sx-menu">
      <summary class="sx-menu__btn">
        ${iconMenu()}<span class="sx-menu__btn-text">Menu</span>
      </summary>
      <div class="sx-menu__panel">
        <nav class="sx-menu__nav" aria-label="Menu">
          ${navLinks('sx-menu__link')}
          <a class="sx-menu__link" href="#book">Book online</a>
        </nav>
        <a class="sx-menu__tel" href="${BRAND.phoneHref}">${BRAND.phone}</a>
        <p class="sx-menu__hours">${BRAND.hours}</p>
      </div>
    </details>

  </div>
</header>`
}

/** Collapses the mobile menu after a jump, and on Escape / outside click. */
export function wireHeader() {
  const menu = document.getElementById('sx-menu')
  if (!menu) return
  const close = () => { menu.open = false }

  menu.querySelector('.sx-menu__panel')?.addEventListener('click', (e) => {
    if (e.target.closest('a')) close()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) {
      close()
      menu.querySelector('summary')?.focus()
    }
  })
  document.addEventListener('click', (e) => {
    if (menu.open && !menu.contains(e.target)) close()
  })
}
