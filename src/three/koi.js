import * as THREE from 'three'
import { PALETTE, css } from './palette.js'

/**
 * koi.js — procedural koi. No downloaded models, no downloaded textures.
 *
 *  geometry : a lathed spindle body (long axis +Z, nose at +Z) merged with
 *             flat membrane fins — big fan tail, long dorsal ridge, swept
 *             pectorals, anal fin. One shared geometry for the whole school.
 *  material : MeshStandardMaterial patched via onBeforeCompile so the fish
 *             still take the real lantern lighting and scene fog, but get a
 *             travelling-sine-wave deformation in the vertex stage and a
 *             story-driven colour grade + pearlescent rim in the fragment.
 *  texture  : painted into a <canvas> at runtime (kohaku / sanke / showa /
 *             utsuri / solid orange / ogon / bekko) so every fish is a
 *             different animal, with big high-contrast patches that still
 *             read when the fish is forty pixels tall.
 *  motion   : each fish walks its own closed CatmullRom loop, and the whole
 *             school can collapse onto a shared formation when the story
 *             asks for a tight school.
 *
 * STORY WIRING (see the mood contract at the top of index.js)
 *   koiPresence -> per-fish fade thresholds, with a slow drift so the same
 *                  fish are not always the ones missing
 *   spread      -> loop radius AND how far each fish collapses onto the
 *                  shared school formation
 *   depth       -> vertical bias of the whole school
 *   pace        -> path speed AND tail-beat rate AND beat amplitude
 *   koiLight    -> emissive lift (uGlow)
 *   clarity     -> saturation, value, pearlescent sheen
 *   coldFactor  -> extra desaturation + a murk-green cast
 *
 * SCROLL WIRING (stage.scroll)
 *   speed       -> startle: fish accelerate, beat faster, bank harder and the
 *                  school loosens. Fast attack, slow release, per-fish gain,
 *                  so a flick of the wheel scatters them and they regroup.
 *   velocity    -> a signed "current" that pushes the school away from / back
 *                  toward the lens, so the water feels driven by the viewer.
 *   quality.reduced suppresses all of it.
 */

const TAU = Math.PI * 2

/* Which part of the fish a vertex belongs to, carried in the `aFin` attribute.
   The fragment shader only cares about body(0) vs fin(>0); the vertex shader
   additionally singles out the pectorals so they can flutter. */
const PART = { BODY: 0, CAUDAL: 1, DORSAL: 2, ANAL: 3, PECTORAL: 4 }

/* -------------------------------------------------------------------------
   Geometry
   ------------------------------------------------------------------------- */

/**
 * Half-silhouette of the body, as LatheGeometry wants it: Vector2(radius, y)
 * running nose (y = +0.52) to tail (y = -0.51). Koi are deep-bodied carp:
 * blunt rounded snout, maximum girth about a third back, then a long taper to
 * a genuinely thin peduncle. The explicit dome points at the nose stop the
 * head reading as a pencil tip.
 */
function bodyProfile (steps) {
  const pts = [
    new THREE.Vector2(0.0010, 0.5230),
    new THREE.Vector2(0.0225, 0.5185),
    new THREE.Vector2(0.0380, 0.5090)
  ]
  for (let i = 0; i <= steps; i++) {
    const t = i / steps                        // 0 = nose, 1 = tail
    const s = Math.pow(t, 0.70)                // skews the bulge toward the head
    const bulge = Math.pow(Math.sin(Math.PI * s), 0.78)
    const r =
      bulge * 0.1255 +                         // the body itself
      0.0300 * Math.pow(1 - t, 1.6) +          // blunt head, blends off fast
      0.0045                                   // minimum peduncle thickness
    pts.push(new THREE.Vector2(r, 0.5 - t))
  }
  pts.push(new THREE.Vector2(0.0040, -0.5060))
  pts.push(new THREE.Vector2(0.0010, -0.5120))
  return pts
}

/**
 * A flat fin membrane: a triangle fan over a closed outline given as [z, y]
 * pairs that must wind monotonically in angle about the local origin.
 * Lives in the x = 0 plane.
 *
 * The sheet is built TWICE, back to back with opposite winding and opposite
 * normals. That costs a couple of dozen triangles per fin and lets the whole
 * koi material run FrontSide: a koi body is a closed lathe, so rendering its
 * backfaces was pure wasted fill — and these are transparent, lit, fogged
 * fragments, the most expensive kind. Only the fins ever needed two sides.
 *
 * uv.x is repurposed as a root(0) -> edge(1) ramp. The body's real uv is the
 * lathe's, and the fragment shader only reads this ramp where aFin > 0, so
 * the two uses never collide.
 */
function membrane (outline, thickness = 0.010) {
  const n = outline.length
  const half = n + 1               // fan centre + rim, per sheet
  const vertCount = half * 2
  const position = new Float32Array(vertCount * 3)
  const normal = new Float32Array(vertCount * 3)
  const uv = new Float32Array(vertCount * 2)

  for (let s = 0; s < 2; s++) {
    const base = s * half
    const sgn = s === 0 ? -1 : 1
    // vertex `base` is the fan centre at the local origin. The two sheets are
    // pushed apart by `thickness` at the root and meet at the rim, so the fin
    // has a lens cross-section: seen edge-on it reads as a thin blade instead
    // of collapsing to a one-pixel line, which is exactly what gave the old
    // tail its "razor sticking out of the fish" look at close range.
    position[base * 3] = sgn * thickness
    for (let i = 0; i < n; i++) {
      position[(base + i + 1) * 3] = 0                 // rim: sheets meet
      position[(base + i + 1) * 3 + 1] = outline[i][1] // y
      position[(base + i + 1) * 3 + 2] = outline[i][0] // z
      uv[(base + i + 1) * 2] = 1                       // rim
    }
    for (let i = 0; i < half; i++) {
      normal[(base + i) * 3] = sgn
      uv[(base + i) * 2 + 1] = 0.5
    }
  }

  const index = new Uint16Array(n * 6)
  for (let i = 0; i < n; i++) {
    const a = i + 1
    const b = ((i + 1) % n) + 1
    index[i * 3] = 0
    index[i * 3 + 1] = a
    index[i * 3 + 2] = b
    // mirrored sheet: reversed winding so its front face points the other way
    index[(n + i) * 3] = half
    index[(n + i) * 3 + 1] = half + b
    index[(n + i) * 3 + 2] = half + a
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  return geo
}

/** Tag every vertex of `geo` with which body part it is. */
function tagPart (geo, part) {
  const count = geo.attributes.position.count
  const arr = new Float32Array(count).fill(part)
  geo.setAttribute('aFin', new THREE.BufferAttribute(arr, 1))
  return geo
}

/**
 * Minimal indexed-geometry merge. Hand-rolled rather than pulled from
 * three/addons so the attribute set (position/normal/uv/aFin) is explicit and
 * cannot drift with addon versions.
 */
function mergeIndexed (geos) {
  let vertCount = 0
  let idxCount = 0
  for (const g of geos) {
    vertCount += g.attributes.position.count
    idxCount += g.index.count
  }

  const position = new Float32Array(vertCount * 3)
  const normal = new Float32Array(vertCount * 3)
  const uv = new Float32Array(vertCount * 2)
  const aFin = new Float32Array(vertCount)
  const index = vertCount > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount)

  let vo = 0
  let io = 0
  for (const g of geos) {
    position.set(g.attributes.position.array, vo * 3)
    normal.set(g.attributes.normal.array, vo * 3)
    uv.set(g.attributes.uv.array, vo * 2)
    aFin.set(g.attributes.aFin.array, vo)
    const src = g.index.array
    for (let i = 0; i < src.length; i++) index[io + i] = src[i] + vo
    vo += g.attributes.position.count
    io += src.length
  }

  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(position, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  out.setAttribute('aFin', new THREE.BufferAttribute(aFin, 1))
  out.setIndex(new THREE.BufferAttribute(index, 1))
  // Generous bounds: the vertex shader pushes the tail sideways, and three
  // must not frustum-cull a fish whose deformed form is still on screen.
  out.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -0.15), 1.2)
  return out
}

/**
 * Caudal fan. Koi tails are big, broad and only shallowly forked — this is
 * the single most recognisable silhouette cue, so it is deliberately larger
 * than a "generic fish" tail. Points wind monotonically in angle about the
 * peduncle root at the local origin.
 */
const CAUDAL_OUTLINE = [
  [0.000, 0.028],
  [-0.090, 0.136], [-0.205, 0.226], [-0.312, 0.240], [-0.300, 0.132],
  [-0.212, 0.026],
  [-0.212, -0.026],
  [-0.300, -0.132], [-0.312, -0.240], [-0.205, -0.226], [-0.090, -0.136],
  [0.000, -0.028]
]

/** Long low ridge — a koi's dorsal runs most of the back, it is not a shark
 *  fin and it is not a dome. Wide in z, shallow in y, with the high point
 *  forward of centre and a long trailing fall-off to the peduncle. */
const DORSAL_OUTLINE = [
  [0.230, 0.000], [0.190, 0.048], [0.090, 0.072], [-0.040, 0.076],
  [-0.170, 0.062], [-0.280, 0.038], [-0.350, 0.012], [-0.350, -0.014],
  [-0.140, -0.042], [0.120, -0.034]
]

/** A rounded lens used, rescaled, for the anal fin. */
const LENS_OUTLINE = [
  [0.19, 0.000], [0.10, 0.055], [-0.02, 0.085], [-0.14, 0.072],
  [-0.23, 0.015], [-0.23, -0.030], [-0.06, -0.045], [0.10, -0.030]
]

/** Pectorals: broad paddles, obvious from above — another strong koi cue. */
const PECTORAL_OUTLINE = [
  [0.055, 0.000], [0.020, 0.046], [-0.058, 0.080], [-0.158, 0.064],
  [-0.212, 0.015], [-0.204, -0.013], [-0.095, -0.033], [0.020, -0.030]
]

/** Build the one geometry the whole school shares. */
export function buildKoiGeometry ({ radialSegments, profileSteps }) {
  const parts = []

  // ---- body: lathe about Y, squash laterally, then stand the axis up as +Z
  const body = new THREE.LatheGeometry(bodyProfile(profileSteps), radialSegments)
  body.scale(0.72, 1, 1)        // koi are deeper than they are wide
  body.rotateX(Math.PI / 2)     // long axis Y -> +Z, nose at +Z, belly at -Y
  parts.push(tagPart(body, PART.BODY))

  // ---- caudal fin, hung off the peduncle
  const caudal = membrane(CAUDAL_OUTLINE, 0.020)
  caudal.translate(0, 0, -0.50)
  parts.push(tagPart(caudal, PART.CAUDAL))

  // ---- dorsal ridge, rooted inside the back
  const dorsal = membrane(DORSAL_OUTLINE, 0.016)
  dorsal.scale(1, 1.26, 1.12)
  dorsal.translate(0, 0.072, -0.085)
  parts.push(tagPart(dorsal, PART.DORSAL))

  // ---- anal fin: a smaller, flipped lens under the rear belly
  const anal = membrane(LENS_OUTLINE, 0.012)
  anal.scale(1, -0.80, 0.60)
  anal.translate(0, -0.072, -0.300)
  parts.push(tagPart(anal, PART.ANAL))

  // ---- pectorals: the paddle laid flat, swept back, mirrored across x = 0
  const pecL = membrane(PECTORAL_OUTLINE, 0.011)
  pecL.rotateZ(Math.PI / 2 + 0.30)  // stand the span up into X, with a droop
  pecL.rotateY(0.42)                // sweep the blade backwards
  pecL.translate(-0.078, -0.052, 0.140)
  parts.push(tagPart(pecL, PART.PECTORAL))

  const pecR = pecL.clone()
  pecR.scale(-1, 1, 1)              // mirror (applyMatrix4 flips the normals too)
  parts.push(tagPart(pecR, PART.PECTORAL))

  const merged = mergeIndexed(parts)
  for (const p of parts) p.dispose()
  return merged
}

/* -------------------------------------------------------------------------
   Texture
   ------------------------------------------------------------------------- */

/**
 * UV layout inherited from LatheGeometry (and CanvasTexture's flipY):
 *   u (canvas x): 0 = belly seam, 0.25 = right flank, 0.5 = BACK, 0.75 = left
 *   v (canvas y): 0 = nose (top of the canvas), 1 = tail (bottom)
 *
 * The viewer almost always sees the BACK of a pond koi, so every pattern is
 * centred on u = 0.5 and wide enough to spill down both flanks. Blotches are
 * drawn three times (x - W, x, x + W) so they wrap seamlessly at the seam.
 */

/** Koi pigment. Deliberately hotter than the site palette: these have to
 *  survive ACES tone mapping, exponential fog and a night lighting rig. */
const C = {
  white: 0xfbf7f0,
  cream: 0xf2e7d1,
  red: 0xd93a1e,
  redDeep: 0xb52c17,
  orange: 0xf4701c,
  orangeHot: 0xff8c2a,
  ink: 0x15110f,
  gold: 0xe2aa45,
  goldHi: 0xf9d281
}

function rgba (hex, a) {
  const r = (hex >> 16) & 255
  const g = (hex >> 8) & 255
  const b = hex & 255
  return `rgba(${r},${g},${b},${a})`
}

/**
 * One soft-but-crisp-edged lobe, drawn wrapped. Koi markings have hard edges;
 * the gradient only exists to kill aliasing, so it holds full alpha out to
 * 86% of the radius instead of fading the whole way.
 */
function blotch (ctx, W, cx, cy, rx, ry, rot, hex, alpha) {
  for (const off of [-W, 0, W]) {
    ctx.save()
    ctx.translate(cx + off, cy)
    ctx.rotate(rot)
    ctx.scale(Math.max(0.001, rx), Math.max(0.001, ry))
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    grad.addColorStop(0.00, rgba(hex, alpha))
    grad.addColorStop(0.86, rgba(hex, alpha))
    grad.addColorStop(0.95, rgba(hex, alpha * 0.72))
    grad.addColorStop(1.00, rgba(hex, 0))
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

/**
 * A "stepping stone" — the big irregular slab of colour that makes a koi a
 * koi. Centred on the back, several overlapping lobes so the edge is ragged.
 * `size` 1 is a patch that wraps a third of the way down each flank.
 */
function stone (ctx, W, H, rand, hex, vCenter, size, alpha = 1) {
  const cx = (0.5 + (rand() - 0.5) * 0.14) * W
  const cy = vCenter * H
  const rx = W * (0.235 + rand() * 0.075) * size
  const ry = H * (0.105 + rand() * 0.055) * size
  const lobes = 3
  for (let i = 0; i < lobes; i++) {
    blotch(
      ctx, W,
      cx + (rand() - 0.5) * rx * 0.85,
      cy + (rand() - 0.5) * ry * 1.5,
      rx * (0.66 + rand() * 0.46),
      ry * (0.72 + rand() * 0.55),
      (rand() - 0.5) * 0.55,
      hex, alpha
    )
  }
}

/** A small accent mark — sumi spots, shoulder flecks. */
function speck (ctx, W, H, rand, hex, vCenter, size, alpha = 1) {
  const cx = (0.5 + (rand() - 0.5) * 0.44) * W
  const cy = (vCenter + (rand() - 0.5) * 0.08) * H
  const rx = W * (0.055 + rand() * 0.045) * size
  const ry = H * (0.035 + rand() * 0.035) * size
  blotch(ctx, W, cx, cy, rx, ry, rand() * TAU, hex, alpha)
  blotch(ctx, W, cx + (rand() - 0.5) * rx, cy + (rand() - 0.5) * ry * 1.4,
    rx * 0.7, ry * 0.8, rand() * TAU, hex, alpha)
}

/** Faint overlapping scale arcs — pure texture, invisible as pattern. */
function scaleNet (ctx, W, H, rand) {
  const rows = Math.max(12, Math.round(W / 16))
  const cols = Math.max(16, Math.round(W / 11))
  const dy = H / rows
  const dx = W / cols
  ctx.lineWidth = Math.max(0.6, W * 0.0022)
  for (let r = 0; r < rows; r++) {
    const y = (r + 1) * dy
    const off = (r % 2) * dx * 0.5 + (rand() - 0.5) * dx * 0.12
    for (let c = -1; c <= cols; c++) {
      const x = c * dx + off
      ctx.strokeStyle = rgba(0xffffff, 0.055)
      ctx.beginPath()
      ctx.arc(x, y - dy * 0.62, dx * 0.62, 0.42, Math.PI - 0.42)
      ctx.stroke()
      ctx.strokeStyle = rgba(C.ink, 0.045)
      ctx.beginPath()
      ctx.arc(x, y - dy * 0.46, dx * 0.62, 0.42, Math.PI - 0.42)
      ctx.stroke()
    }
  }
}

/**
 * Patterns, biggest statement first. Order matters: index 0/3 are the big
 * dominant fish, so the two loudest varieties lead, and the first four cover
 * the whole gamut for the 4-fish phone budget.
 */
const VARIANTS = [
  'kohaku', 'orange', 'utsuri', 'sanke',
  'showa', 'kohaku', 'ogon', 'bekko',
  'sanke', 'utsuri'
]

function paintPattern (ctx, W, H, rand, variant) {
  const fill = (hex) => { ctx.fillStyle = css(hex); ctx.fillRect(0, 0, W, H) }

  switch (variant) {
    case 'kohaku': {
      // White with a bold red "hi" pattern — the classic. Head cap + 2-3 slabs.
      fill(C.white)
      stone(ctx, W, H, rand, C.red, 0.115, 1.05)
      stone(ctx, W, H, rand, rand() < 0.5 ? C.red : C.orange, 0.37, 1.15)
      stone(ctx, W, H, rand, C.red, 0.63, 1.0)
      if (rand() < 0.6) stone(ctx, W, H, rand, C.orange, 0.85, 0.8)
      break
    }
    case 'sanke': {
      // Kohaku plus sumi (black) accents on the back, never on the head.
      fill(C.white)
      stone(ctx, W, H, rand, C.red, 0.20, 1.1)
      stone(ctx, W, H, rand, C.orange, 0.50, 1.0)
      stone(ctx, W, H, rand, C.red, 0.78, 0.95)
      speck(ctx, W, H, rand, C.ink, 0.36, 1.1, 0.92)
      speck(ctx, W, H, rand, C.ink, 0.66, 0.95, 0.92)
      break
    }
    case 'showa': {
      // Black-bodied, with red slabs and white windows. Highest contrast fish
      // in the school, and the one that reads from furthest away.
      fill(C.ink)
      stone(ctx, W, H, rand, C.red, 0.26, 1.3)
      stone(ctx, W, H, rand, C.red, 0.68, 1.2)
      stone(ctx, W, H, rand, C.white, 0.45, 0.8)
      stone(ctx, W, H, rand, C.white, 0.90, 0.75)
      break
    }
    case 'utsuri': {
      // Shiro utsuri: white and black, roughly half and half, wrapping bands.
      fill(C.white)
      stone(ctx, W, H, rand, C.ink, 0.17, 1.25)
      stone(ctx, W, H, rand, C.ink, 0.45, 1.15)
      stone(ctx, W, H, rand, C.ink, 0.74, 1.2)
      speck(ctx, W, H, rand, C.ink, 0.93, 1.0, 0.9)
      break
    }
    case 'orange': {
      // Near-solid orange (aka benigoi): one unbroken slab of colour.
      fill(C.orange)
      // Brighter along the back so the dorsal line catches the lanterns.
      const g = ctx.createLinearGradient(0, 0, W, 0)
      g.addColorStop(0.00, rgba(C.orangeHot, 0))
      g.addColorStop(0.32, rgba(C.orangeHot, 0.22))
      g.addColorStop(0.50, rgba(C.orangeHot, 0.85))
      g.addColorStop(0.68, rgba(C.orangeHot, 0.22))
      g.addColorStop(1.00, rgba(C.orangeHot, 0))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      if (rand() < 0.7) speck(ctx, W, H, rand, C.cream, 0.88, 1.1, 0.75)
      break
    }
    case 'ogon': {
      // Metallic gold, no pattern — carries the sheen instead.
      fill(C.gold)
      const g = ctx.createLinearGradient(0, 0, W, 0)
      g.addColorStop(0.00, rgba(C.goldHi, 0))
      g.addColorStop(0.50, rgba(C.goldHi, 0.72))
      g.addColorStop(1.00, rgba(C.goldHi, 0))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      break
    }
    default: { // bekko
      fill(C.cream)
      stone(ctx, W, H, rand, C.orange, 0.30, 1.0, 0.85)
      speck(ctx, W, H, rand, C.ink, 0.24, 1.15, 0.9)
      speck(ctx, W, H, rand, C.ink, 0.47, 1.25, 0.9)
      speck(ctx, W, H, rand, C.ink, 0.70, 1.1, 0.9)
      speck(ctx, W, H, rand, C.ink, 0.88, 0.95, 0.9)
      break
    }
  }
}

export function makeKoiTexture ({ width, variant, rand }) {
  const W = width
  const H = Math.max(64, Math.round(width * 0.5))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  paintPattern(ctx, W, H, rand, variant)
  scaleNet(ctx, W, H, rand)

  // Fine mottling so flat areas are not plastic under a specular highlight.
  for (let i = 0; i < W; i++) {
    const a = 0.02 + rand() * 0.04
    ctx.fillStyle = rand() < 0.5 ? rgba(C.ink, a) : rgba(0xffffff, a)
    const r = 0.6 + rand() * 1.6
    ctx.beginPath()
    ctx.arc(rand() * W, rand() * H, r, 0, TAU)
    ctx.fill()
  }

  // Flank shading where the body rolls under toward the belly (u ~ 0.21 and
  // 0.79). NOT along the back: darkening u = 0.5 is what made the old fish
  // read grey, because the back is the only side the camera ever sees.
  let g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0.00, rgba(PALETTE.night900, 0.00))
  g.addColorStop(0.21, rgba(PALETTE.night900, 0.20))
  g.addColorStop(0.42, rgba(PALETTE.night900, 0.00))
  g.addColorStop(0.58, rgba(PALETTE.night900, 0.00))
  g.addColorStop(0.79, rgba(PALETTE.night900, 0.20))
  g.addColorStop(1.00, rgba(PALETTE.night900, 0.00))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Pale belly at both u edges (they meet at the seam under the fish).
  g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0.00, rgba(C.white, 0.86))
  g.addColorStop(0.14, rgba(C.white, 0))
  g.addColorStop(0.86, rgba(C.white, 0))
  g.addColorStop(1.00, rgba(C.white, 0.86))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Gill plate: a faint seam at a constant v, i.e. a horizontal line here.
  ctx.strokeStyle = rgba(C.ink, 0.26)
  ctx.lineWidth = Math.max(1, W * 0.006)
  ctx.beginPath()
  ctx.moveTo(0, H * 0.155)
  ctx.lineTo(W, H * 0.155)
  ctx.stroke()

  // Mouth, with the two barbels that nothing else in the pond has.
  ctx.strokeStyle = rgba(C.ink, 0.45)
  ctx.lineWidth = Math.max(1, W * 0.005)
  ctx.beginPath()
  ctx.moveTo(0, H * 0.035)
  ctx.lineTo(W, H * 0.035)
  ctx.stroke()
  for (const u of [0.30, 0.70]) {
    ctx.beginPath()
    ctx.moveTo(u * W, H * 0.040)
    ctx.lineTo(u * W + (u < 0.5 ? -1 : 1) * W * 0.035, H * 0.085)
    ctx.stroke()
  }

  // Eyes, on the upper flanks just behind the snout.
  for (const u of [0.295, 0.705]) {
    const ex = u * W
    const ey = H * 0.080
    const er = W * 0.024
    ctx.fillStyle = rgba(PALETTE.brass300, 0.95)
    ctx.beginPath()
    ctx.arc(ex, ey, er * 1.65, 0, TAU)
    ctx.fill()
    ctx.fillStyle = rgba(C.ink, 1)
    ctx.beginPath()
    ctx.arc(ex, ey, er, 0, TAU)
    ctx.fill()
    ctx.fillStyle = rgba(0xffffff, 0.75)
    ctx.beginPath()
    ctx.arc(ex - er * 0.35, ey - er * 0.35, er * 0.3, 0, TAU)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping      // u wraps around the body
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 4                    // three clamps this to the GPU max
  tex.needsUpdate = true
  return tex
}

/* -------------------------------------------------------------------------
   Material — the swim shader
   ------------------------------------------------------------------------- */

const SWIM_VERTEX_DECL = /* glsl */`
uniform float uBeat;      // accumulated tail-beat phase, radians
uniform float uFlutPhase; // accumulated pectoral phase, radians
uniform float uPhase;     // per-fish, so the school never beats in unison
uniform float uWaveAmp;   // lateral amplitude at the tail root
uniform float uWaveK;     // radians of wave per unit of body length
uniform float uFlutter;   // pectoral-fin beat amplitude
attribute float aFin;
varying float vFin;
varying float vFinT;
`

const SWIM_BEGINNORMAL = /* glsl */`
	/* ---- travelling body wave --------------------------------------------
	   The body runs nose (+z = 0.5) to tail, so s = 0.5 - z grows from 0 at
	   the snout to ~1.4 at the tip of the caudal fin.

	       dx(s) = A(s) * sin( phase ),   A(s) = uWaveAmp * s^2.2
	       phase = uPhase + s * uWaveK - uBeat

	   uBeat is ACCUMULATED on the CPU rather than computed as time * rate, so
	   that changing the beat rate with pace or a scroll startle speeds the
	   tail up smoothly instead of snapping its phase.

	   phase rises with s and falls with uBeat, so a crest travels nose -> tail:
	   that is thrust, which is the direction a real carp's wave moves.
	   The s^2.2 ramp keeps the head almost rigid (carangiform swimming)
	   and puts all the sweep in the back third.                            */
	float sBody = max( 0.5 - position.z, 0.0 );
	float sSafe = max( sBody, 1e-4 );                 // pow(0, k) is unreliable
	float amp  = uWaveAmp * pow( sSafe, 2.2 );
	float dAmp = uWaveAmp * 2.2 * pow( sSafe, 1.2 );  // dA/ds
	float ph   = uPhase + sBody * uWaveK - uBeat;
	float sW   = sin( ph );
	float cW   = cos( ph );
	float dx   = amp * sW;

	/* d(dx)/dz. z decreases as s increases, hence the leading minus sign. */
	float dxdz = - ( dAmp * sW + amp * uWaveK * cW );

	/* Pectoral fins (aFin == 4) beat gently; the ramp keeps the root still. */
	float pect = step( 3.5, aFin );
	float flut = uFlutter * pect * sin( uFlutPhase + uPhase ) *
		clamp( ( abs( position.x ) - 0.06 ) / 0.10, 0.0, 1.0 );

	vFin = step( 0.5, aFin );
	vFinT = uv.x;

	/* For a displacement field d(z) along X the Jacobian is
	      J = I + e_x (dd/dz) e_z^T
	   so normals transform by J^-T, i.e.  n -> n - e_z * (dd/dz) * n.x.      */
	objectNormal = normalize( objectNormal - vec3( 0.0, 0.0, dxdz * objectNormal.x ) );
`

const SWIM_BEGIN_VERTEX = /* glsl */`
	transformed.x += dx;
	transformed.y += flut;
`

const SWIM_FRAG_DECL = /* glsl */`
uniform vec3 uFinColor;
uniform vec3 uMurk;
uniform float uGlow;
uniform float uSat;
uniform float uValue;
uniform float uMurkMix;
uniform float uSheen;
varying float vFin;
varying float vFinT;
`

/* Fins first, then the story grade. Doing the grade after the fin mix means
   the membranes desaturate with the body instead of staying bright in murk. */
const SWIM_FRAG_MAP = /* glsl */`
	float finT = clamp( vFinT, 0.0, 1.0 );
	// Fin membrane: the root takes the animal's own colour, the blade washes
	// out toward the rim. Darker than the body on purpose — a koi's fins are
	// thin wet tissue, and painting them near-white turned the dorsal into an
	// opaque mushroom cap sitting on the fish's back.
	vec3 finRgb = uFinColor * ( 0.52 + 0.40 * finT );
	diffuseColor.rgb = mix( diffuseColor.rgb, finRgb, vFin );
	// Membranes thin out toward the rim: that is what makes a fan tail read as
	// a fan tail rather than a paddle.
	diffuseColor.a *= 1.0 - vFin * ( 0.18 + 0.50 * finT * finT );

	float koiLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
	diffuseColor.rgb = mix( vec3( koiLum ), diffuseColor.rgb, uSat );
	diffuseColor.rgb = mix( diffuseColor.rgb, uMurk * ( 0.30 + 0.70 * koiLum ), uMurkMix );
	diffuseColor.rgb *= uValue;
`

const SWIM_FRAG_EMISSIVE = /* glsl */`
	/* A whisper of self-light keeps the fish readable through dark water, and
	   a Fresnel rim gives the wet, pearlescent edge koi have under a lantern. */
	totalEmissiveRadiance += diffuseColor.rgb * uGlow * ( 1.0 + 0.25 * vFin );
	float koiFres = pow( 1.0 - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 ), 3.0 );
	totalEmissiveRadiance += uSheen * koiFres * vec3( 1.0, 0.93, 0.82 );
`

/** One program for the whole school; only uniform values differ per fish. */
function patchKoiMaterial (material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + SWIM_VERTEX_DECL)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + SWIM_BEGINNORMAL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWIM_BEGIN_VERTEX)

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SWIM_FRAG_DECL)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + SWIM_FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = mix( roughnessFactor, 0.40, vFin );`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + SWIM_FRAG_EMISSIVE)
  }
  material.customProgramCacheKey = () => 'koi-swim'
  return material
}

/* -------------------------------------------------------------------------
   Paths
   ------------------------------------------------------------------------- */

const SCHOOL_CENTER = new THREE.Vector3(0, 0, -2.0)
/** Fish never rise above this, so they cannot poke through the surface. */
const MAX_FISH_Y = -0.34
/** ...nor sink into the silt bed. */
const MIN_FISH_Y = -5.3
/** World units of vertical bias per unit of mood.depth. */
const DEPTH_GAIN = 1.55

function makePath (rand, i, count) {
  const spread = count > 1 ? i / (count - 1) : 0
  const radius = 2.4 + spread * 3.6 + rand() * 0.8
  const depth = -0.50 - (i % 4) * 0.70 - rand() * 0.40
  const n = 7
  const pts = []
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + (rand() - 0.5) * 0.3
    const rr = radius * (0.72 + rand() * 0.56)
    const y = Math.min(MAX_FISH_Y, depth + (rand() - 0.5) * 0.9)
    pts.push(new THREE.Vector3(
      SCHOOL_CENTER.x + Math.cos(a) * rr,
      y,
      SCHOOL_CENTER.z + Math.sin(a) * rr
    ))
  }
  // Closed, centripetal-ish Catmull-Rom: smooth, no cusps, no self-overshoot.
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5)
}

/**
 * The lead line the whole school collapses onto when `spread` goes tight.
 * Without this, "tight school" would only ever mean "smaller circles", which
 * does not read as fish moving together.
 */
function makeSchoolPath (rand) {
  const n = 8
  const pts = []
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU
    const rr = 3.0 + rand() * 1.4
    pts.push(new THREE.Vector3(
      SCHOOL_CENTER.x + Math.cos(a) * rr,
      -1.70 + Math.sin(a * 2 + 0.7) * 0.55,
      SCHOOL_CENTER.z + Math.sin(a) * rr * 0.88
    ))
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5)
}

function mulberry32 (seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* -------------------------------------------------------------------------
   The school
   ------------------------------------------------------------------------- */

/** Relative sizes. A couple of dominant fish, several mid, a few small — and
 *  ordered so the 4-fish phone budget still gets two big ones. */
const SIZE_LADDER = [1.18, 0.64, 0.95, 1.06, 0.74, 0.54, 0.86, 0.68, 1.00, 0.60]
const SIZE_BASE = 0.80

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n)
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6))
  return t * t * (3 - 2 * t)
}

/** Defaults so the first frame (and any caller without a stage) is composed. */
const DEFAULT_MOOD = {
  koiPresence: 0.45,
  spread: 1.0,
  depth: 0.0,
  pace: 0.75,
  koiLight: 0.025,
  clarity: 0.55,
  coldFactor: 0,
  dawnFactor: 0
}

export function createKoiSchool ({ quality }) {
  const rand = mulberry32(0x6b01d)
  const group = new THREE.Group()
  group.name = 'koi-school'

  const geometry = buildKoiGeometry({
    radialSegments: quality.koiRadialSegments,
    profileSteps: quality.koiProfileSteps
  })

  const fish = []
  const textures = []
  const materials = []
  const count = Math.max(1, quality.koiCount)

  for (let i = 0; i < count; i++) {
    const variant = VARIANTS[i % VARIANTS.length]
    const texture = makeKoiTexture({ width: quality.koiTextureWidth, variant, rand })
    textures.push(texture)

    // Fins pick up the animal's own cast rather than all being the same bone.
    const finColor = new THREE.Color(
      variant === 'utsuri' || variant === 'showa' ? 0xdbe0da
        : variant === 'orange' ? 0xf9a362
          : variant === 'ogon' ? 0xf4cd86
            : 0xf3e8db
    )

    const uniforms = {
      uBeat: { value: rand() * TAU },
      uFlutPhase: { value: rand() * TAU },
      uPhase: { value: rand() * TAU },
      uWaveAmp: { value: quality.reduced ? 0.030 : 0.048 + rand() * 0.016 },
      uWaveK: { value: 5.1 + rand() * 1.1 },
      uFlutter: { value: quality.reduced ? 0 : 0.016 },
      uFinColor: { value: finColor },
      uMurk: { value: new THREE.Color(0x72806a) },
      uGlow: { value: 0.06 },
      uSat: { value: 1 },
      uValue: { value: 1 },
      uMurkMix: { value: 0 },
      uSheen: { value: 0.08 }
    }

    const material = patchKoiMaterial(new THREE.MeshStandardMaterial({
      map: texture,
      roughness: variant === 'ogon' ? 0.22 : 0.30,
      metalness: variant === 'ogon' ? 0.38 : 0.06,
      // FrontSide: the body is a closed lathe and the fins carry their own
      // second sheet, so backfaces are never visible — and skipping them
      // halves the lit-transparent fill cost on the biggest fish.
      side: THREE.FrontSide,
      // Transparent for the presence fade and the translucent fin rims. The
      // default renderOrder (0) keeps the school ahead of water.js (1) and
      // the particle layers (2-4) inside the transparent pass.
      transparent: true,
      depthWrite: true
    }), uniforms)
    materials.push(material)

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = 'koi-' + i + '-' + variant
    const size = SIZE_LADDER[i % SIZE_LADDER.length] * SIZE_BASE
    mesh.scale.setScalar(size)
    group.add(mesh)

    // Formation slot, in the school's local frame (+Z = heading): a loose
    // wedge, biggest fish nearest the point.
    const side = (i % 2) ? -1 : 1
    const rank = Math.floor(i / 2)

    fish.push({
      mesh,
      uniforms,
      material,
      size,
      curve: makePath(rand, i, count),
      u: (i / count) + rand() * 0.08,
      length: 1,
      speed: 0.46 + rand() * 0.5,
      speedWobble: 0.18 + rand() * 0.18,
      speedPhase: rand() * TAU,
      bobAmp: 0.035 + rand() * 0.05,
      bobRate: 0.5 + rand() * 0.6,
      bobPhase: rand() * TAU,
      bank: 0,
      // Per-fish ceiling, so a school pressed up under the surface does not
      // flatten onto one plane and read as a row of stickers.
      ceiling: MAX_FISH_Y - rand() * 0.42,
      waveW: 8.2 + rand() * 3.6,
      waveAmp0: quality.reduced ? 0.030 : 0.048 + rand() * 0.016,
      // presence: evenly spaced thresholds, lowest on the dominant fish so the
      // hero koi is the one that never leaves.
      presenceThr: 0.04 + 0.82 * (count > 1 ? i / (count - 1) : 0),
      presenceDrift: 0.13 * (0.3 + 0.7 * (count > 1 ? i / (count - 1) : 0)),
      presencePhase: rand() * TAU,
      vis: 0,
      // scroll reactivity
      react: 0.68 + rand() * 0.7,
      reactAttack: 5.0 + rand() * 5.0,
      driftGain: 0.6 + rand() * 0.8,
      scatter: new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.45, rand() - 0.5).normalize(),
      startle: 0,
      slot: new THREE.Vector3(
        side * (0.62 + rank * 0.62 + rand() * 0.30),
        (rand() - 0.5) * 0.95,
        0.95 - rank * 0.90 - rand() * 0.45
      )
    })
  }

  for (const f of fish) f.length = Math.max(0.001, f.curve.getLength())

  const schoolCurve = makeSchoolPath(rand)
  const schoolLength = Math.max(0.001, schoolCurve.getLength())
  let schoolU = rand()

  /* ---- smoothed story + scroll state ---------------------------------- */
  const m = { ...DEFAULT_MOOD }
  let startleAvg = 0
  let current = 0

  /* Scratch — allocating inside the frame loop is how you get GC hitches. */
  const ownPos = new THREE.Vector3()
  const aheadA = new THREE.Vector3()
  const aheadB = new THREE.Vector3()
  const tan = new THREE.Vector3()
  const tanAhead = new THREE.Vector3()
  const slotWorld = new THREE.Vector3()
  const drift = new THREE.Vector3()
  const schoolPos = new THREE.Vector3()
  const schoolTan = new THREE.Vector3()
  const qOwn = new THREE.Quaternion()
  const qSchool = new THREE.Quaternion()
  const lookM = new THREE.Matrix4()
  const ORIGIN = new THREE.Vector3()
  const UP = new THREE.Vector3(0, 1, 0)
  const schoolAnchor = new THREE.Object3D()
  const camFwd = new THREE.Vector3()
  const anchorTarget = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  const sep = new THREE.Vector3()
  let camPos = null
  /* While the lens is above the water the only way a koi reads at all is as a
     shape just under the skin of the pond, so the school rises toward the
     surface exactly as far as the camera is out of the water. */
  let surfaceLift = 0

  /** Quaternion whose +Z axis points along `dir` — Object3D.lookAt semantics. */
  function quatFromDir (dir, out) {
    lookM.lookAt(dir, ORIGIN, UP)
    return out.setFromRotationMatrix(lookM)
  }

  /**
   * Where the shared school line is right now, as an oriented frame.
   *
   * The lead point rides a closed loop, so on its own it would be somewhere
   * random relative to the lens on any given frame — and "the koi come back"
   * is worthless if the school happens to be behind the camera when the
   * viewer reaches that chapter. So the tighter the school is (cohesion), the
   * more its lead point is drawn toward a spot ahead of the lens. Heading
   * still comes from the curve, so they swim ACROSS the view rather than
   * hanging in it, and at low cohesion the pull is a weak 0.15 so a loose
   * school stays spread through the pond the way a loose school should.
   */
  function updateSchoolFrame (dt, paceMul, cohesion, camera) {
    if (!quality.reduced) schoolU += (0.62 * paceMul * dt) / schoolLength
    const su = schoolU - Math.floor(schoolU)
    schoolCurve.getPointAt(su, schoolPos)
    schoolCurve.getPointAt((su + 0.015) % 1, aheadA)
    schoolTan.subVectors(aheadA, schoolPos)
    if (schoolTan.lengthSq() < 1e-9) schoolTan.set(0, 0, -1)
    schoolTan.normalize()
    schoolPos.y += m.depth * DEPTH_GAIN + surfaceLift

    const stagePull = 0.15 + cohesion * 0.72
    if (camera) {
      camera.getWorldDirection(camFwd)
      anchorTarget.copy(camera.position).addScaledVector(camFwd, 7.8)
      // Keep the staging point under the surface and off the silt bed, and
      // nudge it down a little so the school reads below the lens, not in it.
      anchorTarget.y = Math.min(anchorTarget.y - 0.25, MAX_FISH_Y - 0.15)
      anchorTarget.y = Math.max(anchorTarget.y, MIN_FISH_Y + 0.8)
      schoolPos.lerp(anchorTarget, stagePull)
    }

    schoolAnchor.position.copy(schoolPos)
    quatFromDir(schoolTan, qSchool)
    schoolAnchor.quaternion.copy(qSchool)
    schoolAnchor.updateMatrixWorld(true)
  }

  /** Place one fish. Split out so the reduced-motion still frame can reuse it. */
  function place (f, t, dt, cohesion, spreadEff) {
    const uu = f.u - Math.floor(f.u)
    f.curve.getPointAt(uu, ownPos)
    f.curve.getPointAt((uu + 0.012) % 1, aheadA)
    f.curve.getPointAt((uu + 0.030) % 1, aheadB)
    tan.subVectors(aheadA, ownPos)
    if (tan.lengthSq() < 1e-9) tan.set(0, 0, -1)
    tan.normalize()
    tanAhead.subVectors(aheadB, aheadA)
    if (tanAhead.lengthSq() < 1e-9) tanAhead.copy(tan)
    tanAhead.normalize()

    // `spread`: push the loop out / draw it in about the pond centre.
    const radialK = 0.60 + 0.44 * spreadEff
    ownPos.x = SCHOOL_CENTER.x + (ownPos.x - SCHOOL_CENTER.x) * radialK
    ownPos.z = SCHOOL_CENTER.z + (ownPos.z - SCHOOL_CENTER.z) * radialK
    ownPos.y += m.depth * DEPTH_GAIN + surfaceLift
    if (!quality.reduced) ownPos.y += f.bobAmp * Math.sin(t * f.bobRate + f.bobPhase)

    if (cohesion > 0.001) {
      slotWorld.copy(f.slot).applyMatrix4(schoolAnchor.matrixWorld)
      ownPos.lerp(slotWorld, cohesion)
    }

    // Scroll "current" + the fish's own startle scatter.
    ownPos.addScaledVector(drift, f.driftGain)
    if (f.startle > 0.001) ownPos.addScaledVector(f.scatter, 0.62 * f.startle)

    if (ownPos.y > f.ceiling) ownPos.y = f.ceiling
    if (ownPos.y < MIN_FISH_Y) ownPos.y = MIN_FISH_Y

    // Personal space. The lens travels through the pond, so without this a
    // fish can end up a hand's width from it: one koi fills the frame, reads
    // as an orange blob, and the school it belongs to is lost. Push anything
    // too close back out along the view ray — scaled by the fish's own size,
    // because a big koi needs more room than a small one.
    if (camPos) {
      const near = 1.5 + 2.0 * f.size
      toCam.subVectors(ownPos, camPos)
      const d = toCam.length()
      if (d > 1e-4 && d < near) ownPos.copy(camPos).addScaledVector(toCam, near / d)
    }
    f.mesh.position.copy(ownPos)

    quatFromDir(tan, qOwn)
    if (cohesion > 0.001) qOwn.slerp(qSchool, cohesion)
    f.mesh.quaternion.copy(qOwn)

    // Bank into the turn. (tan x tanAhead).y > 0 means turning to the fish's
    // left, and local +X is its left, so a left turn wants a negative roll.
    // A startled fish leans into it much harder.
    const turn = tan.z * tanAhead.x - tan.x * tanAhead.z
    const gain = 26 * (1 + 1.4 * f.startle)
    const lean = 0.30 * f.startle * (f.scatter.x > 0 ? 1 : -1)
    const wanted = Math.max(-0.60, Math.min(0.60, -turn * gain)) * (1 - 0.45 * cohesion) + lean
    const k = dt > 0 ? 1 - Math.exp(-3 * dt) : 1
    f.bank += (wanted - f.bank) * k
    f.mesh.rotateZ(f.bank)
  }

  /** Per-frame colour grade from the story. */
  function grade (f) {
    const u = f.uniforms
    u.uGlow.value = m.koiLight * 2.4
    u.uSat.value = (0.55 + 0.45 * m.clarity) * (1 - 0.34 * m.coldFactor)
    u.uValue.value = 0.78 + 0.22 * m.clarity
    u.uMurkMix.value = 0.46 * m.coldFactor * (1 - m.clarity)
    u.uSheen.value = 0.030 + 0.085 * m.clarity
  }

  function update (t, dt, stage) {
    const src = (stage && stage.mood) || DEFAULT_MOOD
    const scroll = (stage && stage.scroll) || null

    /* ---- smooth the story bundle. mood is already continuous, but the
       school should also have its own inertia: nothing here ever snaps. ---- */
    const mk = quality.reduced || dt <= 0 ? 1 : 1 - Math.exp(-2.2 * dt)
    m.koiPresence += ((src.koiPresence ?? DEFAULT_MOOD.koiPresence) - m.koiPresence) * mk
    m.spread += ((src.spread ?? DEFAULT_MOOD.spread) - m.spread) * mk
    m.depth += ((src.depth ?? DEFAULT_MOOD.depth) - m.depth) * mk
    m.pace += ((src.pace ?? DEFAULT_MOOD.pace) - m.pace) * mk
    m.koiLight += ((src.koiLight ?? DEFAULT_MOOD.koiLight) - m.koiLight) * mk
    m.clarity += ((src.clarity ?? DEFAULT_MOOD.clarity) - m.clarity) * mk
    m.coldFactor += ((src.coldFactor ?? DEFAULT_MOOD.coldFactor) - m.coldFactor) * mk

    /* ---- scroll input -------------------------------------------------- */
    let shaped = 0
    if (scroll && !quality.reduced) {
      const s = clamp01(scroll.speed || 0)
      // smoothstep: a nudge of the wheel is almost free, a hard flick saturates.
      shaped = s * s * (3 - 2 * s)
      const vel = Math.max(-1, Math.min(1, (scroll.velocity || 0) / 2.6))
      current += (vel - current) * (dt > 0 ? 1 - Math.exp(-2.4 * dt) : 1)
    } else {
      current += (0 - current) * (dt > 0 ? 1 - Math.exp(-2.4 * dt) : 1)
    }
    // A current the viewer is making: down pushes the school away and under,
    // up draws it back toward the lens.
    drift.set(current * 0.22, -current * 0.30, -current * 0.95)

    let startleSum = 0
    for (const f of fish) {
      const target = quality.reduced ? 0 : shaped * f.react
      // Fast attack, slow release — startle, then settle.
      const rate = target > f.startle ? f.reactAttack : 1.15
      f.startle += (target - f.startle) * (dt > 0 ? 1 - Math.exp(-rate * dt) : 1)
      startleSum += f.startle
    }
    startleAvg = startleSum / fish.length

    /* ---- derived school shape ------------------------------------------ */
    // A startled school loses its composure as well as its station-keeping.
    const spreadEff = Math.min(1.95, m.spread + 0.55 * startleAvg)
    const cohesion = clamp01((1.08 - spreadEff) / 0.23) * 0.90
    const paceMul = m.pace * (1 + 0.9 * startleAvg)

    camPos = (stage && stage.camera) ? stage.camera.position : null
    const sub = stage && typeof stage.submergence === 'number' ? stage.submergence : 1
    surfaceLift += (0.62 * (1 - sub) - surfaceLift) * mk
    updateSchoolFrame(dt, paceMul, cohesion, stage && stage.camera)

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i]

      /* ---- presence: who is even here ---------------------------------- */
      // The drift makes the membership of the school rotate slowly, so it is
      // never the same fish that vanish in the murk two scrolls running.
      const thr = f.presenceThr +
        f.presenceDrift * Math.sin(t * 0.085 + f.presencePhase)
      const wantVis = smoothstep(thr - 0.10, thr + 0.10, m.koiPresence)
      f.vis += (wantVis - f.vis) * (quality.reduced || dt <= 0 ? 1 : 1 - Math.exp(-1.6 * dt))

      const vis = clamp01(f.vis)
      f.mesh.visible = vis > 0.015
      f.material.opacity = vis
      // Fading fish also shrink a touch: reads as swimming off into the gloom
      // rather than dissolving on the spot.
      f.mesh.scale.setScalar(f.size * (0.84 + 0.16 * vis))

      /* ---- swim ---------------------------------------------------------*/
      // Note this runs even for a faded-out fish: it keeps swimming its loop
      // off-camera, so when presence comes back it fades in where it would
      // actually be rather than where it was when it left.
      const paceF = m.pace * (1 + 1.45 * f.startle)
      if (!quality.reduced) {
        // Speed drifts a little so they mill around instead of running on rails.
        const v = f.speed * paceF * (1 + f.speedWobble * Math.sin(t * 0.37 + f.speedPhase))
        f.u += (v * dt) / f.length
        // Tail beat tracks the body speed — a slow fish with a fast tail is
        // the single most obvious "this is not a real fish" tell.
        f.uniforms.uBeat.value += f.waveW * paceF * dt
        f.uniforms.uFlutPhase.value += (3.4 + 3.2 * paceF) * dt
        f.uniforms.uWaveAmp.value = f.waveAmp0 *
          (0.74 + 0.26 * Math.min(1.3, paceF)) * (1 + 0.40 * f.startle)
        f.uniforms.uFlutter.value = 0.016 * (0.7 + 0.9 * Math.min(1.4, paceF))
      }

      if (!f.mesh.visible) continue
      grade(f)
      place(f, t, quality.reduced ? 0 : dt, cohesion, spreadEff)
    }

    separate()
  }

  /**
   * Keep two koi from occupying the same water. Once the school tightens, the
   * formation slots alone are not enough — a fish whose own loop happens to
   * cross a neighbour's slot will swim straight through it, and one koi
   * passing through another is the kind of thing a viewer notices instantly.
   *
   * O(n^2) over at most eight fish, so 28 comparisons: cheaper than any
   * spatial structure would be to maintain.
   */
  function separate () {
    for (let a = 0; a < fish.length; a++) {
      const fa = fish[a]
      if (!fa.mesh.visible) continue
      for (let b = a + 1; b < fish.length; b++) {
        const fb = fish[b]
        if (!fb.mesh.visible) continue
        sep.subVectors(fb.mesh.position, fa.mesh.position)
        const want = (fa.size + fb.size) * 0.78
        const d2 = sep.lengthSq()
        if (d2 < 1e-6 || d2 >= want * want) continue
        const d = Math.sqrt(d2)
        sep.multiplyScalar(((want - d) / d) * 0.5)
        fa.mesh.position.sub(sep)
        fb.mesh.position.add(sep)
      }
      const y = fa.mesh.position.y
      if (y > fa.ceiling) fa.mesh.position.y = fa.ceiling
      else if (y < MIN_FISH_Y) fa.mesh.position.y = MIN_FISH_Y
    }
  }

  function dispose () {
    group.clear()
    geometry.dispose()
    for (const mat of materials) mat.dispose()
    for (const tx of textures) tx.dispose()
    materials.length = 0
    textures.length = 0
    fish.length = 0
  }

  // Compose the opening frame before anything is rendered.
  update(0, 0, null)

  return { group, update, dispose, fish }
}
