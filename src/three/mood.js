import { CHAPTERS, blendMood, smootherstep, clamp01 } from '../story.js'

/**
 * mood.js — turns `setStory({ index, chapterT })` into one continuous bundle
 * of numbers the renderer can read.
 *
 * WHY MIDPOINT KEYFRAMES
 * ----------------------
 * Each chapter's `mood` in story.js is the look that chapter is *about*, not
 * the look at its first pixel. If we blended CHAPTERS[i] -> CHAPTERS[i+1]
 * straight across chapter i, then the moment the services section appeared the
 * pond would already be cleaning itself — and by the time the gallery arrived
 * there would be nothing left to show.
 *
 * So the keyframes are pinned to chapter MIDPOINTS: position s = index +
 * chapterT, keyframe i sits at s = i + 0.5. Each chapter therefore arrives at
 * its own mood halfway through itself and spends the rest of its span handing
 * over to the next one. That is continuous across every boundary (no jumps)
 * and it puts each beat where the copy is.
 *
 * Per-leg easing then shapes *when* inside a leg the change happens:
 *   dive -> murk   front-loaded: get filthy fast, then hold it while they read
 *                  the service list and its prices.
 *   murk -> clean  back-loaded: the filth persists through the services copy
 *                  and the water visibly clears across the gallery. This is
 *                  the beat where scrolling performs the service being sold.
 */

/**
 * Staging that story.js does not (and should not) know about: where the koi
 * are, how much algae is on the rocks, whether silt is actively settling.
 * Keyed by chapter id and blended on exactly the same track as `mood`.
 */
const STAGING = {
  dusk: { koiPresence: 0.45, spread: 1.00, depth: 0.00, pace: 0.75, koiLight: 0.025, algae: 0.00, settle: 0 },
  dive: { koiPresence: 0.50, spread: 1.10, depth: -0.20, pace: 0.85, koiLight: 0.040, algae: 0.30, settle: 0 },
  murk: { koiPresence: 0.18, spread: 1.80, depth: -1.10, pace: 0.50, koiLight: 0.020, algae: 1.00, settle: 0 },
  clean: { koiPresence: 0.48, spread: 1.25, depth: -0.40, pace: 0.95, koiLight: 0.075, algae: 0.32, settle: 1 },
  return: { koiPresence: 1.00, spread: 0.85, depth: 0.35, pace: 1.20, koiLight: 0.115, algae: 0.00, settle: 1 },
  dawn: { koiPresence: 0.80, spread: 1.05, depth: 0.10, pace: 1.00, koiLight: 0.085, algae: 0.00, settle: 1 }
}

const STAGING_KEYS = Object.keys(STAGING.dusk)

/** Easing for leg i (CHAPTERS[i] -> CHAPTERS[i + 1]). */
const LEG_EASE = [
  smootherstep,                           // dusk  -> dive
  (x) => 1 - Math.pow(1 - x, 2.2),        // dive  -> murk   : filthy fast, then hold
  (x) => Math.pow(x, 2.4),                // murk  -> clean  : hold the filth, clear late
  smootherstep,                           // clean -> return
  smootherstep                            // return-> dawn
]

const stagingFor = (i) => STAGING[CHAPTERS[i].id] || STAGING.dusk

function lerpStaging (a, b, k) {
  const out = {}
  for (const key of STAGING_KEYS) out[key] = a[key] + (b[key] - a[key]) * k
  return out
}

/**
 * Sample the whole look at a story position.
 * @param {number} index 0-based chapter index
 * @param {number} chapterT 0..1 within that chapter
 */
export function sampleMood (index, chapterT) {
  const last = CHAPTERS.length - 1
  const i0 = Math.max(0, Math.min(last, Math.round(index) || 0))
  const s = i0 + clamp01(chapterT)
  const p = s - 0.5 // keyframes live at chapter midpoints

  let mood
  let staging

  if (p <= 0) {
    mood = { ...CHAPTERS[0].mood }
    staging = { ...stagingFor(0) }
  } else if (p >= last) {
    mood = { ...CHAPTERS[last].mood }
    staging = { ...stagingFor(last) }
  } else {
    const leg = Math.min(last - 1, Math.floor(p))
    const local = clamp01(p - leg)
    const eased = (LEG_EASE[leg] || smootherstep)(local)
    mood = blendMood(CHAPTERS[leg].mood, CHAPTERS[leg + 1].mood, eased)
    staging = lerpStaging(stagingFor(leg), stagingFor(leg + 1), eased)
  }

  // Derived factors the renderer wants over and over.
  // lightWarmth is 1.0 at dusk, 0.45 in the murk, 1.35 at dawn.
  const dawnFactor = clamp01((mood.lightWarmth - 1) / 0.35)
  const coldFactor = clamp01((1 - mood.lightWarmth) / 0.55)

  return { ...mood, ...staging, dawnFactor, coldFactor, storyPos: s }
}
