/**
 * App entry + SCROLL STORY DIRECTOR.
 *
 * Owns no UI. It wires the page together and drives the narrative described in
 * src/story.js: dusk -> dive -> murk -> clean -> return -> dawn. Every scroll
 * frame it resolves where the viewer is in that story and publishes it to
 *   - the 3D pond, via pond.setStory(state)
 *   - CSS, via custom properties and <html data-chapter="...">
 */
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/sections.css'
import './styles/booking.css'

import { renderSections } from './sections/index.js'
import { initPond } from './three/index.js'
import { initBooking } from './booking/index.js'
import { initShop } from './shop/index.js'
import { resolveRanges, clamp01 } from './story.js'

const root = document.documentElement
const main = document.getElementById('main')

// 1. Content first, so the page is readable even if WebGL dies.
renderSections(main)

// 2. Interactive widgets mount into placeholders that sections/ guarantees exist.
const bookingMount = document.getElementById('booking-mount')
if (bookingMount) initBooking(bookingMount)

const shopMount = document.getElementById('shop-mount')
if (shopMount) initShop(shopMount)

// 3. The pond. Fails soft: no WebGL -> the CSS gradient in base.css stays put.
let pond = null
try {
  pond = initPond({ canvas: document.getElementById('pond-canvas') })
  root.classList.add('has-pond')
  // Dev/QA handle. The camera eases toward its scroll target over seconds, so
  // the screenshot harness needs to WAIT for it to converge rather than
  // guessing at a fixed delay — otherwise every frame it captures is a beat
  // behind the position it asked for.
  window.__pond = pond
} catch (err) {
  console.warn('[pond] 3D disabled:', err)
  root.classList.add('no-pond')
}

// ---------------------------------------------------------------------------
// The story director
// ---------------------------------------------------------------------------
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

let ranges = []
let lastY = window.scrollY
let lastChapter = null
let queued = false
// Scroll velocity, smoothed. The koi react to how hard you are scrolling, so
// this has to be a continuous signal rather than a per-event spike.
let velocity = 0
let lastT = performance.now()

/** Recompute chapter scroll ranges from live layout. Cheap; call on resize. */
function measure() {
  ranges = resolveRanges()
  update()
}

function update() {
  const max = Math.max(1, root.scrollHeight - window.innerHeight)
  const y = window.scrollY
  const t = clamp01(y / max)

  const direction = y === lastY ? 0 : y > lastY ? 1 : -1

  // px/second, normalised against viewport height so a flick feels the same
  // on a phone as on a desktop, then smoothed so it decays instead of snapping.
  const now = performance.now()
  const dtMs = Math.max(16, now - lastT)
  lastT = now
  const instant = ((y - lastY) / dtMs) * 1000 / Math.max(1, window.innerHeight)
  velocity += (instant - velocity) * 0.25
  if (Math.abs(velocity) < 0.001) velocity = 0
  lastY = y

  // Which chapter owns this scroll position? Ranges can overlap slightly at the
  // seams (sections share screen space), so the LAST match wins — that keeps
  // the story moving forward rather than snapping back at a boundary.
  let active = ranges[0]
  for (const r of ranges) if (t >= r.start) active = r
  const span = Math.max(0.0001, active.end - active.start)
  const chapterT = clamp01((t - active.start) / span)

  // The surface crossing lives inside the 'dive' chapter. Expose it separately
  // because sections.css and the header already key off --dive.
  const dive = ranges.find((r) => r.id === 'dive')
  const diveT = dive ? clamp01((t - dive.start) / Math.max(0.0001, dive.end - dive.start)) : 0

  root.style.setProperty('--story-t', t.toFixed(4))
  root.style.setProperty('--chapter-t', chapterT.toFixed(4))
  root.style.setProperty('--dive', diveT.toFixed(4))
  if (active.id !== lastChapter) {
    root.dataset.chapter = active.id
    lastChapter = active.id
  }

  const state = {
    t,
    chapter: active.id,
    chapterT,
    index: ranges.indexOf(active),
    direction,
    velocity,                                   // signed, ~-3..3 viewports/sec
    speed: Math.min(1, Math.abs(velocity) / 1.8), // 0..1, for easy mapping
    reducedMotion: reducedMotion.matches,
  }

  root.style.setProperty('--scroll-speed', state.speed.toFixed(3))
  root.style.setProperty('--scroll-dir', String(direction))

  // setStory is the real interface; setScrollProgress stays for compatibility.
  pond?.setStory?.(state)
  pond?.setScrollProgress?.(diveT)
}

function onScroll() {
  if (queued) return
  queued = true
  requestAnimationFrame(() => {
    queued = false
    update()
  })
}

let idleFrame = 0
function decay() {
  if (Math.abs(velocity) > 0.001) {
    velocity *= 0.86
    update()
    idleFrame = requestAnimationFrame(decay)
  } else if (velocity !== 0) {
    velocity = 0
    update()
  }
}

addEventListener('scroll', () => {
  cancelAnimationFrame(idleFrame)
  onScroll()
  idleFrame = requestAnimationFrame(decay)
}, { passive: true })
addEventListener('resize', () => {
  clearTimeout(measure._t)
  measure._t = setTimeout(measure, 150)
})
reducedMotion.addEventListener?.('change', update)

measure()
// Sections reveal and fonts swap after first paint, which changes page height —
// remeasure once things have settled rather than trusting the first layout.
addEventListener('load', () => setTimeout(measure, 100))
if (document.fonts?.ready) document.fonts.ready.then(() => setTimeout(measure, 50))

// ---------------------------------------------------------------------------
// Loading bar
// ---------------------------------------------------------------------------
const loader = document.getElementById('pond-loading')
const clearLoader = () => loader?.remove()
pond?.ready?.then?.(clearLoader)?.catch?.(clearLoader)
// Belt and braces: if the 3D never resolves `ready` (or there is no pond at
// all) the bar must not sit at the top of the page forever.
setTimeout(clearLoader, 8000)
