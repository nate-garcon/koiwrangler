/**
 * quality.js — device tiering for the night-pond hero.
 *
 * One job: look at the device once at boot and hand back a plain settings
 * object that every other module reads. Nothing here touches three.js, so it
 * is trivially testable and trivially tweakable by a human later.
 *
 * Tiers
 *   low  — phones, tablets in portrait, anything with <= 4 logical cores
 *   mid  — small laptops / big tablets / 5-8 cores
 *   high — desktop-ish viewport with plenty of cores
 */

/** @returns {boolean} true when the visitor asked the OS for less motion. */
export function prefersReducedMotion () {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Cheap, synchronous guess at how much GPU/CPU budget we have. */
export function detectTier () {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4
  // Rough "is this a phone" signal that does not rely on UA sniffing.
  const narrow = Math.min(w, h) < 560 || w < 760

  if (narrow || cores <= 4) return 'low'
  if (w < 1280 || cores <= 8) return 'mid'
  return 'high'
}

/**
 * Pixel-ratio cap. Phones get 1.5 (the extra pixels buy almost nothing on a
 * sub-6" panel and cost a lot of fill rate); everything else gets 2.
 */
export function maxPixelRatioFor (tier) {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
  const small = typeof window !== 'undefined' && window.innerWidth < 760
  return Math.min(dpr, small || tier === 'low' ? 1.5 : 2)
}

const PRESETS = {
  low: {
    koiCount: 4,
    koiRadialSegments: 10,   // segments around the body tube
    koiProfileSteps: 15,     // segments along the body (nose -> tail)
    koiTextureWidth: 256,
    waterSegments: 56,
    pebbleCount: 40,
    lilyCount: 4,
    moteCount: 260,
    bubbleCount: 60,
    shaftCount: 3,
    antialias: false
  },
  mid: {
    koiCount: 6,
    koiRadialSegments: 14,
    koiProfileSteps: 20,
    koiTextureWidth: 384,
    waterSegments: 104,
    pebbleCount: 90,
    lilyCount: 6,
    moteCount: 760,
    bubbleCount: 140,
    shaftCount: 4,
    antialias: true
  },
  high: {
    koiCount: 8,
    koiRadialSegments: 20,
    koiProfileSteps: 26,
    koiTextureWidth: 512,
    waterSegments: 150,
    pebbleCount: 150,
    lilyCount: 8,
    moteCount: 1500,
    bubbleCount: 260,
    shaftCount: 6,
    antialias: true
  }
}

/**
 * @returns {{tier:string, reduced:boolean, maxPixelRatio:number} & typeof PRESETS.high}
 */
export function createQuality (overrides = {}) {
  const tier = overrides.tier || detectTier()
  const reduced = overrides.reduced != null ? overrides.reduced : prefersReducedMotion()
  const preset = PRESETS[tier] || PRESETS.mid

  const q = {
    tier,
    reduced,
    maxPixelRatio: maxPixelRatioFor(tier),
    ...preset,
    ...overrides
  }

  // Reduced motion renders a single still frame, so the streaming effects are
  // pure waste: drop them up front instead of guarding every call site.
  if (q.reduced) {
    q.bubbleCount = 0
    q.moteCount = Math.min(q.moteCount, 400)
  }

  return q
}
