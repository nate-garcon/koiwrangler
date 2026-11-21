/**
 * THE STORY SPINE — SHARED CONTRACT. Read this; do not edit it.
 *
 * The whole page is one scroll-driven narrative. Scrolling takes the viewer
 * from dusk on the surface, down through the water into a filthy pond, then
 * *cleans it* as they read the services, brings the koi back, and surfaces
 * again at dawn. The business message and the visuals are the same thing:
 *
 *   dusk -> dive -> murk ("your pond now") -> clean ("the work")
 *        -> return ("the result") -> dawn
 *
 * Each chapter is anchored to a real DOM section so the 3D beats stay in sync
 * with the copy even as section heights change. `fallback` is used only when
 * the anchor element does not exist (e.g. during a partial build).
 *
 * CONSUMERS
 * ---------
 * 3D (src/three/): implement `setStory(state)` on the object returned by
 *   initPond(). It is called on every scroll frame with:
 *     { t, chapter, chapterT, index, direction, reducedMotion }
 *   - t          0..1 across the entire document
 *   - chapter    the id string below
 *   - chapterT   0..1 within the current chapter (this is your beat clock)
 *   - index      chapter index, 0-based
 *   - direction  +1 scrolling down, -1 up, 0 idle
 *   `setScrollProgress(p)` is still called too (dive progress only) so older
 *   code keeps working — implement setStory and it takes over.
 *
 * CSS (src/styles/*.css): main.js writes these on <html> every frame:
 *     --story-t      0..1 whole document
 *     --chapter-t    0..1 within the current chapter
 *     --dive         0..1 surface crossing (1 = fully underwater)
 *   and sets  <html data-chapter="murk">  so you can write:
 *     :root[data-chapter="clean"] .sx-services { ... }
 */

export const CHAPTERS = [
  {
    id: 'dusk',
    anchor: '#top',
    fallback: [0.0, 0.1],
    title: 'Dusk on the surface',
    // Still water, warm lanterns, koi as shadows under the skin of the pond.
    mood: { fogDensity: 0.012, waterTint: 0x0e1e2e, lightWarmth: 1.0, silt: 0.0, clarity: 0.55 },
  },
  {
    id: 'dive',
    anchor: '#promises',
    fallback: [0.1, 0.24],
    title: 'Breaking the surface',
    // The money shot: camera passes through the water plane.
    mood: { fogDensity: 0.03, waterTint: 0x12303f, lightWarmth: 0.8, silt: 0.35, clarity: 0.4 },
  },
  {
    id: 'murk',
    anchor: '#services',
    fallback: [0.24, 0.42],
    title: 'This is your pond right now',
    // Worst state: green, silted, algae on the rocks, debris drifting past,
    // held while the viewer reads the service list and its prices.
    mood: { fogDensity: 0.075, waterTint: 0x1d3a26, lightWarmth: 0.45, silt: 1.0, clarity: 0.1 },
  },
  {
    id: 'clean',
    anchor: '#gallery',
    fallback: [0.42, 0.66],
    title: 'The work',
    // Across this chapter the pond CLEANS ITSELF, landing exactly on the
    // before/after gallery: silt settles and drains, algae recedes, light
    // returns. The plates say 'photo pending'; the water shows the result.
    mood: { fogDensity: 0.02, waterTint: 0x14354d, lightWarmth: 0.85, silt: 0.0, clarity: 0.9 },
  },
  {
    id: 'return',
    anchor: '#book',
    fallback: [0.66, 0.82],
    title: 'The koi come back',
    // Clear water, full school, confident movement, colour at its richest.
    mood: { fogDensity: 0.014, waterTint: 0x12405e, lightWarmth: 1.0, silt: 0.0, clarity: 1.0 },
  },
  {
    id: 'dawn',
    anchor: '#shop',
    fallback: [0.82, 1.0],
    title: 'Up into the morning',
    // Rise back through the surface into dawn light — this is what hands the
    // page over to the cream content without a hard seam.
    mood: { fogDensity: 0.008, waterTint: 0x2a5878, lightWarmth: 1.35, silt: 0.0, clarity: 1.0 },
  },
]

/**
 * Resolve chapter scroll ranges against the live DOM. Call after layout.
 *
 * Chapters are CONTIGUOUS: each one runs from its own anchor until the next
 * chapter's anchor begins, and the last runs to the end of the document. An
 * earlier version measured each chapter's span independently from its own
 * section's height, which let ranges overlap and leave gaps — the measured
 * result was that a quarter of the page was still chapter 0 and the story was
 * effectively over at 75%. Contiguous ranges guarantee the whole document is
 * covered exactly once, in order.
 */
export function resolveRanges (doc = document) {
  const max = Math.max(1, doc.documentElement.scrollHeight - window.innerHeight)
  const vh = window.innerHeight

  // Where each chapter wants to begin: when its section is approaching view.
  const starts = CHAPTERS.map((ch, i) => {
    const el = ch.anchor && doc.querySelector(ch.anchor)
    if (!el) return { i, start: ch.fallback[0], resolved: false }
    const top = el.getBoundingClientRect().top + window.scrollY
    return { i, start: clamp01((top - vh * 0.6) / max), resolved: true }
  })

  // The first chapter always owns the top of the document, and starts must
  // increase — a short section can otherwise sort behind the one before it.
  starts[0].start = 0
  for (let i = 1; i < starts.length; i++) {
    const floor = starts[i - 1].start + 0.02
    if (starts[i].start < floor) starts[i].start = floor
  }
  // If clamping pushed the tail past the end, redistribute what's left evenly.
  if (starts[starts.length - 1].start > 0.96) {
    for (let i = 1; i < starts.length; i++) starts[i].start = i / starts.length
  }

  return CHAPTERS.map((ch, i) => ({
    ...ch,
    start: starts[i].start,
    end: i === CHAPTERS.length - 1 ? 1 : starts[i + 1].start,
    resolved: starts[i].resolved
  }))
}

export const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Smootherstep — gentler than linear at both ends, good for camera easing. */
export const smootherstep = (t) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** Blend two chapter `mood` objects. Numeric fields lerp; colours lerp in RGB. */
export function blendMood(a, b, t) {
  const k = clamp01(t)
  const lerp = (x, y) => x + (y - x) * k
  const lerpHex = (x, y) => {
    const ar = (x >> 16) & 255, ag = (x >> 8) & 255, ab = x & 255
    const br = (y >> 16) & 255, bg = (y >> 8) & 255, bb = y & 255
    return (Math.round(lerp(ar, br)) << 16) | (Math.round(lerp(ag, bg)) << 8) | Math.round(lerp(ab, bb))
  }
  return {
    fogDensity: lerp(a.fogDensity, b.fogDensity),
    waterTint: lerpHex(a.waterTint, b.waterTint),
    lightWarmth: lerp(a.lightWarmth, b.lightWarmth),
    silt: lerp(a.silt, b.silt),
    clarity: lerp(a.clarity, b.clarity),
  }
}
