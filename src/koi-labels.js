/**
 * KOI LABELS — naming the fish as they swim past.
 *
 * A fixed, inert overlay that sits ABOVE the pond canvas and BELOW the content
 * panels, and puts a small brass caption on at most two koi at a time: the
 * nearest ones that are currently in open water.
 *
 * It reads positions from the bridge the 3D exposes:
 *
 *   window.__pond.getKoiLabels() -> [{ variant, x, y, depth, opacity, size }]
 *
 * nearest first, in CSS pixels relative to the canvas, with fish that are
 * behind the lens, off-screen or mid-fade already removed.
 *
 * DESIGN RULES THIS FILE IS OBEYING
 * ---------------------------------
 * - It is a label, not an animation. The pond owns the frame budget, so
 *   positions are sampled on requestAnimationFrame but THROTTLED to ~10fps,
 *   and the loop does not run at all while the document is hidden.
 * - A label may never sit on body copy or intercept a click: the layer is
 *   pointer-events:none and aria-hidden, and any label whose caption or leader
 *   would cross a glass panel is suppressed. Panels carry a backdrop-filter,
 *   so a label behind one would otherwise show through as a blurred brass
 *   smear rather than disappear.
 * - Nothing flickers at a panel edge. Starting a label needs real clearance
 *   (ENTER_PAD); keeping one only needs to not be properly overlapped
 *   (EXIT_PAD), so a fish grazing an edge cannot strobe. Labels fade, a slot
 *   is not reused until its fade-out has finished, and a label already on
 *   screen is not pre-empted by a nearer fish until it has had MIN_HOLD.
 * - prefers-reduced-motion: the labels are static. No fade and no leader
 *   animation — the CSS in styles/sections.css drops the transitions; this
 *   file behaves identically, so a label still follows the fish it names.
 * - If the bridge is missing (an older build, or WebGL refused to start) this
 *   does nothing at all, quietly, and takes its own layer back out of the DOM.
 */

const SLOTS = 2                 // never label more than two fish at once
const INTERVAL = 100            // ~10fps: a label, not an animation
const FADE = 280                // must match the opacity transition in CSS
const ENTER_PAD = 18            // px of clearance a fish needs to GET a label
const EXIT_PAD = -8             // px of overlap before it LOSES one
const MIN_HOLD = 1200           // ms a label is safe from being pre-empted
const PREEMPT = 0.08            // how much nearer a rival must be to take over
const LEAD = 30                 // leader length along x, px
const LIFT = 22                 // how far above the fish the caption sits, px
const CAP_W = 124               // widest caption ("Taisho Sanke") plus scrim
const CAP_H = 26                // caption height including its scrim
const VIEW_PAD = 8              // never let a caption touch the window edge
const WAIT_FOR_POND = 12000     // ms to wait for the bridge before giving up

/** Elements whose rects a label must never cross: panels, header, footer and
 *  the hero's copy — everything carrying type or a backdrop-filter. */
const BLOCKERS = '.sx-section, .sx-header, .sx-footer, .sx-hero__inner, .sx-hero__hint'

/** Variant -> what to call it. Keys are src/three/koi.js VARIANTS. `orange`
 *  is painted there as a near-solid benigoi, so that is what it is called,
 *  and `utsuri` is painted as the white version, shiro utsuri. */
const NAMES = {
  kohaku: 'Kohaku',
  sanke: 'Taisho Sanke',
  showa: 'Showa',
  utsuri: 'Shiro Utsuri',
  orange: 'Benigoi',
  ogon: 'Ogon',
  bekko: 'Bekko',
}

/** Identity for one fish, good enough to track it between samples. The pond
 *  builds its school from a ten-deep variant list and a ten-deep size ladder,
 *  so variant + size is unique; if it ever collided, the worst case is a
 *  label following the wrong identical-looking fish. */
const idOf = (f) => `${f.variant}:${(f.size ?? 0).toFixed(3)}`

export function initKoiLabels() {
  if (typeof document === 'undefined') return () => {}

  const layer = document.createElement('div')
  layer.className = 'sx-koilayer'
  layer.setAttribute('aria-hidden', 'true')
  document.body.appendChild(layer)

  const slots = Array.from({ length: SLOTS }, () => makeSlot(layer))

  let blockers = document.querySelectorAll(BLOCKERS)
  let frame = 0
  let last = 0
  let waited = 0
  let stopped = false

  const refreshBlockers = () => { blockers = document.querySelectorAll(BLOCKERS) }
  addEventListener('resize', refreshBlockers)

  /** The bridge, or null. main.js renders the sections BEFORE it boots the
   *  pond, so for the first frames there is legitimately nothing here yet. */
  function bridge() {
    const p = window.__pond
    return p && typeof p.getKoiLabels === 'function' ? p : null
  }

  function stop(removeLayer) {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(frame)
    frame = 0
    removeEventListener('resize', refreshBlockers)
    document.removeEventListener('visibilitychange', onVisibility)
    if (removeLayer) layer.remove()
  }

  function tick(now) {
    frame = requestAnimationFrame(tick)
    // First frame of a run: start the clock, spend nothing else.
    if (!last) { last = now; return }
    if (now - last < INTERVAL) return
    const dt = now - last
    last = now

    const pond = bridge()
    if (!pond) {
      // No pond yet. Give it a reasonable while to turn up, then leave: a
      // build without the bridge must cost nothing and show nothing.
      waited += dt
      if (waited > WAIT_FOR_POND || document.documentElement.classList.contains('no-pond')) {
        stop(true)
      }
      return
    }

    let fish = []
    try {
      fish = pond.getKoiLabels() || []
    } catch (err) {
      // A bridge that throws is a bridge we stop calling.
      console.warn('[koi-labels] getKoiLabels failed, labels off:', err)
      stop(true)
      return
    }

    assign(slots, fish, blockers, now)
  }

  function onVisibility() {
    if (stopped) return
    if (document.hidden) {
      cancelAnimationFrame(frame)
      frame = 0
      slots.forEach((s) => hide(s, 0))
    } else if (!frame) {
      last = 0
      frame = requestAnimationFrame(tick)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  if (!document.hidden) frame = requestAnimationFrame(tick)

  // Teardown, for a caller that ever wants it back.
  return () => stop(true)
}

/* ------------------------------------------------------------------ slots */

function makeSlot(layer) {
  const el = document.createElement('div')
  el.className = 'sx-koilabel'
  el.innerHTML =
    '<span class="sx-koilabel__dot"></span>'
    + '<span class="sx-koilabel__lead"></span>'
    + '<span class="sx-koilabel__name"></span>'
  layer.appendChild(el)
  return {
    el,
    name: el.querySelector('.sx-koilabel__name'),
    lead: el.querySelector('.sx-koilabel__lead'),
    id: null,      // the fish this slot is naming
    since: 0,      // when it came on screen
    freeAt: 0,     // not reusable until its fade-out has run
    depth: 1,
    on: false,
  }
}

function hide(slot, now) {
  if (slot.on) {
    slot.el.classList.remove('is-on')
    slot.on = false
  }
  slot.id = null
  // A slot that re-pointed at a different fish mid-fade would teleport its
  // caption instead of fading. Hold it empty until the fade is over.
  slot.freeAt = now + FADE
}

/**
 * Keep every slot on the fish it is already naming for as long as that stays
 * honest, then fill free slots with the nearest unlabelled candidates.
 */
function assign(slots, fish, blockers, now) {
  const rects = []
  for (const b of blockers) {
    const r = b.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) rects.push(r)
  }
  const vw = innerWidth
  const vh = innerHeight

  // Hold what is already labelled, with the loose EXIT test.
  const taken = new Set()
  for (const slot of slots) {
    if (!slot.id) continue
    const f = pick(fish, slot.id)
    const box = f && labelBox(f, vw)
    if (!box || !clear(box, rects, vw, vh, EXIT_PAD)) { hide(slot, now); continue }
    taken.add(slot.id)
    slot.depth = f.depth
    place(slot, f, box)
  }

  // Candidates for a free slot: clear of every panel by a real margin and not
  // already named. getKoiLabels() hands them over nearest first, so the
  // nearest eligible fish is the one that gets the next slot.
  const open = []
  for (const f of fish) {
    if (taken.has(idOf(f))) continue
    const box = labelBox(f, vw)
    if (clear(box, rects, vw, vh, ENTER_PAD)) open.push({ f, box })
  }

  let next = 0
  for (const slot of slots) {
    if (slot.id || now < slot.freeAt) continue
    const cand = open[next]
    if (!cand) break
    next++
    slot.id = idOf(cand.f)
    slot.since = now
    slot.depth = cand.f.depth
    place(slot, cand.f, cand.box)
    slot.el.classList.add('is-on')
    slot.on = true
  }

  // Pre-emption, deliberately reluctant: a much nearer fish takes a slot only
  // once the caption sitting in it has had its turn. Without the dwell this
  // swaps on nearly every sample, which reads as a glitch.
  const rival = open[next]
  if (rival) {
    let worst = null
    for (const slot of slots) {
      if (!slot.id || now - slot.since < MIN_HOLD) continue
      if (!worst || slot.depth > worst.depth) worst = slot
    }
    if (worst && worst.depth - rival.f.depth > PREEMPT) {
      worst.id = idOf(rival.f)
      worst.since = now
      worst.depth = rival.f.depth
      place(worst, rival.f, rival.box)
    }
  }
}

/** The sample for a tracked id — the nearest one, if the id is ambiguous. */
function pick(fish, id) {
  let best = null
  for (const f of fish) {
    if (idOf(f) !== id) continue
    if (!best || f.depth < best.depth) best = f
  }
  return best
}

/**
 * Where this fish's label would go, and the rectangle it would occupy.
 * The caption hangs up-and-right, or up-and-left for a fish on the right of
 * the frame, so a caption never reaches for the edge it is nearest.
 */
function labelBox(f, vw) {
  const flip = f.x > vw * 0.62
  const dx = flip ? -LEAD : LEAD
  return {
    flip,
    dx,
    dy: -LIFT,
    left: flip ? f.x + dx - CAP_W : f.x - 10,
    right: flip ? f.x + 10 : f.x + dx + CAP_W,
    top: f.y - LIFT - CAP_H / 2,
    bottom: f.y + 10,
  }
}

/**
 * Is that rectangle in open water? `pad` is positive for "this much clearance
 * required" and negative for "allow this much overlap", which is what gives
 * starting and stopping their hysteresis.
 */
function clear(box, rects, vw, vh, pad) {
  if (box.left < VIEW_PAD || box.right > vw - VIEW_PAD) return false
  if (box.top < VIEW_PAD || box.bottom > vh - VIEW_PAD) return false
  for (const r of rects) {
    if (box.left < r.right - pad && box.right > r.left + pad
      && box.top < r.bottom - pad && box.bottom > r.top + pad) return false
  }
  return true
}

/** Put the slot on the fish. */
function place(slot, f, box) {
  const len = Math.hypot(box.dx, box.dy)
  const angle = (Math.atan2(box.dy, box.dx) * 180) / Math.PI

  slot.el.style.translate = `${Math.round(f.x)}px ${Math.round(f.y)}px`
  slot.el.classList.toggle('is-flipped', box.flip)
  slot.lead.style.width = `${len.toFixed(1)}px`
  slot.lead.style.rotate = `${angle.toFixed(1)}deg`
  slot.name.style.translate = `${Math.round(box.dx)}px ${Math.round(box.dy)}px`

  const text = NAMES[f.variant] || f.variant || ''
  if (slot.name.textContent !== text) slot.name.textContent = text
}
