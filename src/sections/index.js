/**
 * Page composition. Owns: markup for every section, scroll-reveal, the sticky
 * header state. Does NOT own the booking form or the shop grid — those mount
 * into #booking-mount / #shop-mount, which this module guarantees exist.
 */
import { renderHeader, wireHeader } from './header.js'
import { renderHero } from './hero.js'
import { renderPromises } from './promises.js'
import { renderServices, wireServices } from './services.js'
import { renderGallery } from './gallery.js'
import { renderAbout } from './about.js'
import { renderArea } from './area.js'
import { renderShop } from './shop.js'
import { renderBooking } from './booking.js'
import { renderFaq } from './faq.js'
import { renderFooter } from './footer.js'

export function renderSections(root) {
  if (!root) return

  root.innerHTML = [
    renderHeader(),
    renderHero(),
    // paper zone starts here
    '<div class="sx-paper">',
    renderPromises(),
    renderServices(),
    renderGallery(),
    renderAbout(),
    renderArea(),
    renderBooking(),
    renderShop(),
    renderFaq(),
    '</div>',
    renderFooter(),
  ].join('\n')

  wireHeader()
  wireServices()
  wireReveal()
  wireStickyHeader()
}

/** One IntersectionObserver for every .reveal block. CSS handles the motion,
 *  and base.css already neutralises it under prefers-reduced-motion. */
function wireReveal() {
  const blocks = document.querySelectorAll('.reveal')
  if (!blocks.length) return

  if (!('IntersectionObserver' in window)) {
    blocks.forEach((b) => b.classList.add('in'))
    return
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('in')
      io.unobserve(entry.target)
    })
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })

  blocks.forEach((b) => io.observe(b))
}

/** Header goes from transparent-over-water to solid paper once the dark
 *  transition band has passed. Sentinel, not a scroll listener — main.js
 *  already owns the scroll handler. */
function wireStickyHeader() {
  const header = document.getElementById('sx-header')
  const sentinel = document.getElementById('sx-stick-sentinel')
  if (!header || !sentinel) return

  if (!('IntersectionObserver' in window)) {
    header.classList.add('is-solid')
    return
  }

  const io = new IntersectionObserver(([entry]) => {
    // The sentinel is tall and ends where the paper zone begins, so once its
    // bottom edge is above the viewport we are reading content on paper.
    header.classList.toggle('is-solid', entry.boundingClientRect.bottom <= 0)
  }, { threshold: 0 })

  io.observe(sentinel)
}
