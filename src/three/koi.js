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
 * STAGING
 *   The pond is behind the WHOLE page, but from `dive` on, the page floats a
 *   glass panel of body copy across the middle 86% of it, so the only open
 *   water is a narrow strip each side, the gaps between sections, the hero
 *   and the dawn band. The school is therefore staged off the lens axis
 *   rather than on it — see updateSchoolFrame — and while the lens is in the
 *   air it is drawn OVER the surface rather than under it, because from
 *   above water.js lets through about 2% of whatever is behind the plane.
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
      // uv.y carries HOW FAR AROUND the rim this vertex is, so the fragment
      // stage can draw fin rays. They converge at the fan centre, which is
      // where a real fin's rays converge too.
      uv[(base + i + 1) * 2 + 1] = i / n
    }
    for (let i = 0; i < half; i++) {
      normal[(base + i) * 3] = sgn
    }
    uv[base * 2 + 1] = 0.5
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
  // A koi's caudal spans a little more than the body is deep — NOT twice it.
  // The raw outline was drawn to a span of 0.48 against a 0.26 body, which
  // rendered as a grey sail being towed along behind a fish.
  caudal.scale(1, 0.74, 1.04)
  caudal.translate(0, 0, -0.50)
  parts.push(tagPart(caudal, PART.CAUDAL))

  // ---- dorsal ridge, rooted inside the back
  const dorsal = membrane(DORSAL_OUTLINE, 0.016)
  dorsal.scale(1, 1.00, 1.08)
  dorsal.translate(0, 0.078, -0.085)
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

/**
 * A wrapping BAND of colour across the full width of the canvas, with ragged
 * edges — i.e. a saddle over the back that spills down both flanks.
 *
 * This, not the scatter of blotches, is what actually makes a koi read at
 * forty pixels through murky water. Real hi markings are big continuous
 * slabs; the previous all-blotch approach left more white showing than
 * colour, and from the back (the only side the lens ever sees) the school
 * came out as grey-white minnows.
 *
 * The edge jitter is a sum of two sines in u with INTEGER frequencies, so it
 * is seamless where the texture wraps at the belly seam.
 */
function saddle (ctx, W, H, rand, hex, v0, v1, ragged = 1, alpha = 1) {
  const steps = 40
  const f1 = 1 + Math.floor(rand() * 3)
  const f2 = 3 + Math.floor(rand() * 4)
  const p1 = rand() * TAU
  const p2 = rand() * TAU
  const a1 = 0.052 * ragged
  const a2 = 0.026 * ragged
  const top = []
  const bot = []
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    top.push(v0 + a1 * Math.sin(u * TAU * f1 + p1) + a2 * Math.sin(u * TAU * f2 + p2))
    bot.push(v1 + a1 * Math.sin(u * TAU * f2 + p2 * 1.7) + a2 * Math.sin(u * TAU * f1 + p1 * 0.6))
  }
  ctx.fillStyle = rgba(hex, alpha)
  ctx.beginPath()
  ctx.moveTo(0, top[0] * H)
  for (let i = 1; i <= steps; i++) ctx.lineTo((i / steps) * W, top[i] * H)
  for (let i = steps; i >= 0; i--) ctx.lineTo((i / steps) * W, bot[i] * H)
  ctx.closePath()
  ctx.fill()
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
 * Patterns, in the order fish are built. Two things key off this order, so it
 * is load-bearing rather than decorative:
 *
 *   - presence thresholds rise with index, so LOW indices are the fish that
 *     are always in the pond. The loudest colour has to live down here or the
 *     murk chapter is a school of white ghosts.
 *   - the phone budget is four fish, so indices 0-3 alone must cover the
 *     gamut: a big red-and-white kohaku, a tricolour sanke, the black-based
 *     showa, and one near-solid orange.
 *
 * White-based varieties (utsuri, the second kohaku, bekko) sit higher up,
 * where they arrive as the school fills out and read as variety rather than
 * as the school's whole character.
 */
const VARIANTS = [
  'kohaku', 'sanke', 'showa', 'orange',
  'utsuri', 'kohaku', 'ogon', 'bekko',
  'sanke', 'orange'
]

/** A pattern's dominant colour, used to tint its fins and its sheen. */
export const VARIANT_CAST = {
  kohaku: 0xf0a07a,
  sanke: 0xeeb193,
  showa: 0xd8cfc4,
  orange: 0xf9a362,
  utsuri: 0xdbe0da,
  ogon: 0xf4cd86,
  bekko: 0xf1dcb8
}

function paintPattern (ctx, W, H, rand, variant) {
  const fill = (hex) => { ctx.fillStyle = css(hex); ctx.fillRect(0, 0, W, H) }
  // Each fish shifts its reds a little so two kohaku are never the same animal.
  const hi = rand() < 0.42 ? C.orange : C.red
  const hi2 = hi === C.red ? C.redDeep : C.orangeHot

  switch (variant) {
    case 'kohaku': {
      // Red-and-white, the classic. Three big hi saddles — a head cap, a
      // shoulder slab and a rear slab — leaving white windows between them.
      // Coverage is deliberately well over half: a kohaku whose hi only
      // dots the back is, from above, a white fish.
      fill(C.white)
      saddle(ctx, W, H, rand, hi, 0.035, 0.255, 1.0)   // head / shoulder cap
      saddle(ctx, W, H, rand, hi, 0.325, 0.620, 1.2)   // the big one
      saddle(ctx, W, H, rand, hi2, 0.700, 0.915, 1.0)  // rear slab
      stone(ctx, W, H, rand, hi, 0.46, 0.85, 0.9)      // ragged overspill
      break
    }
    case 'sanke': {
      // Kohaku plus sumi (black) accents on the back, never on the head.
      fill(C.white)
      saddle(ctx, W, H, rand, hi, 0.055, 0.290, 1.1)
      saddle(ctx, W, H, rand, hi2, 0.370, 0.655, 1.2)
      saddle(ctx, W, H, rand, hi, 0.730, 0.930, 1.0)
      speck(ctx, W, H, rand, C.ink, 0.325, 1.5, 0.95)
      speck(ctx, W, H, rand, C.ink, 0.660, 1.3, 0.95)
      speck(ctx, W, H, rand, C.ink, 0.845, 1.1, 0.9)
      break
    }
    case 'showa': {
      // Black-based, with red slabs and white windows. Highest contrast fish
      // in the school, and the one that reads from furthest away.
      fill(C.ink)
      saddle(ctx, W, H, rand, C.red, 0.080, 0.400, 1.3)
      saddle(ctx, W, H, rand, C.red, 0.560, 0.845, 1.3)
      stone(ctx, W, H, rand, C.white, 0.46, 1.05)
      stone(ctx, W, H, rand, C.white, 0.90, 0.85)
      stone(ctx, W, H, rand, C.orangeHot, 0.23, 0.70, 0.75)
      break
    }
    case 'utsuri': {
      // Shiro utsuri: white and black, roughly half and half, wrapping bands
      // that step alternately forward and back along the body.
      fill(C.white)
      saddle(ctx, W, H, rand, C.ink, 0.045, 0.230, 1.5)
      saddle(ctx, W, H, rand, C.ink, 0.380, 0.600, 1.6)
      saddle(ctx, W, H, rand, C.ink, 0.745, 0.930, 1.4)
      break
    }
    case 'orange': {
      // Near-solid orange (benigoi): one unbroken slab of colour. The loudest
      // thing in the pond and the fish the eye finds first.
      fill(C.orange)
      // Brighter along the back so the dorsal line catches the lanterns.
      const g = ctx.createLinearGradient(0, 0, W, 0)
      g.addColorStop(0.00, rgba(C.orangeHot, 0))
      g.addColorStop(0.30, rgba(C.orangeHot, 0.35))
      g.addColorStop(0.50, rgba(C.orangeHot, 1.0))
      g.addColorStop(0.70, rgba(C.orangeHot, 0.35))
      g.addColorStop(1.00, rgba(C.orangeHot, 0))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      // A couple of deeper slabs so it is not a flat plastic carrot.
      saddle(ctx, W, H, rand, C.red, 0.270, 0.430, 1.4, 0.40)
      saddle(ctx, W, H, rand, C.red, 0.690, 0.820, 1.2, 0.34)
      if (rand() < 0.7) speck(ctx, W, H, rand, C.cream, 0.88, 1.1, 0.75)
      break
    }
    case 'ogon': {
      // Metallic gold, no pattern — carries the sheen instead.
      fill(C.gold)
      const g = ctx.createLinearGradient(0, 0, W, 0)
      g.addColorStop(0.00, rgba(C.goldHi, 0))
      g.addColorStop(0.50, rgba(C.goldHi, 0.92))
      g.addColorStop(1.00, rgba(C.goldHi, 0))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      saddle(ctx, W, H, rand, C.orangeHot, 0.330, 0.520, 1.3, 0.26)
      break
    }
    default: { // bekko — cream with a warm wash and sumi stepping stones
      fill(C.cream)
      saddle(ctx, W, H, rand, C.orange, 0.140, 0.360, 1.3, 0.80)
      saddle(ctx, W, H, rand, C.orange, 0.600, 0.790, 1.2, 0.68)
      speck(ctx, W, H, rand, C.ink, 0.24, 1.35, 0.92)
      speck(ctx, W, H, rand, C.ink, 0.47, 1.45, 0.92)
      speck(ctx, W, H, rand, C.ink, 0.70, 1.30, 0.92)
      speck(ctx, W, H, rand, C.ink, 0.88, 1.10, 0.92)
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

  // Flank shading where the body rolls under toward the belly (u ~ 0.19 and
  // 0.81). NOT along the back: darkening u = 0.5 is what made the old fish
  // read grey, because the back is the only side the camera ever sees.
  let g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0.00, rgba(PALETTE.night900, 0.00))
  g.addColorStop(0.19, rgba(PALETTE.night900, 0.22))
  g.addColorStop(0.40, rgba(PALETTE.night900, 0.00))
  g.addColorStop(0.60, rgba(PALETTE.night900, 0.00))
  g.addColorStop(0.81, rgba(PALETTE.night900, 0.22))
  g.addColorStop(1.00, rgba(PALETTE.night900, 0.00))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // A warm highlight along the spine (u = 0.5). This is the band the lens
  // actually sees, and lifting it is what makes the fish read as a wet,
  // rounded animal instead of a printed decal.
  g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0.00, rgba(0xffe9cf, 0))
  g.addColorStop(0.42, rgba(0xffe9cf, 0))
  g.addColorStop(0.50, rgba(0xffe9cf, 0.18))
  g.addColorStop(0.58, rgba(0xffe9cf, 0))
  g.addColorStop(1.00, rgba(0xffe9cf, 0))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Pale belly at both u edges (they meet at the seam under the fish). Kept
  // narrow: every pixel of belly white spent above u = 0.12 is a pixel of
  // pattern the camera will never get back.
  g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0.00, rgba(C.white, 0.88))
  g.addColorStop(0.12, rgba(C.white, 0))
  g.addColorStop(0.88, rgba(C.white, 0))
  g.addColorStop(1.00, rgba(C.white, 0.88))
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

  // Eyes, on the upper flanks just behind the snout. u = 0.5 is the spine
  // and u = 0 the belly seam, so 0.34 / 0.66 sits them just above the
  // midline of the head, which is where a carp carries them. Big: at the
  // ranges this fish is actually seen, the eye is the cue that turns a
  // coloured shape into an animal.
  for (const u of [0.340, 0.660]) {
    const ex = u * W
    const ey = H * 0.076
    const er = W * 0.030
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
  // flipY MUST be off. LatheGeometry runs v = 0 at the first profile point
  // (the nose) to v = 1 at the last (the tail), and three's default flipY
  // uploads the canvas upside down — which silently painted the eyes, the
  // mouth, the barbels and the gill plate onto the TAIL of every fish in the
  // school. With it off, canvas y reads nose-at-the-top exactly as the UV
  // note above this function says it does.
  tex.flipY = false
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
varying float vFinA;     // position around a fin's rim, for the rays
varying float vUpness;   // object-space back(+1) .. belly(-1)
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
	vFinA = uv.y;
	/* Which way this bit of skin faces in the FISH's own frame, so the
	   counter-shading in the fragment stage rolls with the animal when it
	   banks instead of sliding around on it. */
	vUpness = objectNormal.y;

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
uniform float uForm;
varying float vFin;
varying float vFinT;
varying float vFinA;
varying float vUpness;
`

/* Fins first, then the story grade. Doing the grade after the fin mix means
   the membranes desaturate with the body instead of staying bright in murk. */
const SWIM_FRAG_MAP = /* glsl */`
	float finT = clamp( vFinT, 0.0, 1.0 );
	/* COUNTER-SHADING. The pond's rig is ambient-dominated by design — a
	   night hemisphere, a dim moon and three distant lanterns — so a lathed
	   body returns almost the same radiance all the way round and the fish
	   come out as flat printed leaves. Nothing about the geometry is wrong;
	   there is simply no light to model it with. So the roundness is put
	   back in the albedo, which is also where a real carp keeps it: dark over
	   the back, pale under the belly, graded continuously down the flank. */
	float upness = clamp( vUpness * 0.5 + 0.5, 0.0, 1.0 );
	diffuseColor.rgb *= mix( 1.0, 0.54 + 0.66 * upness, uForm * ( 1.0 - 0.45 * vFin ) );

	/* Fin membrane: the root takes the animal's own colour, the blade washes
	   out toward the rim, and the rays — the stiff spokes a fan is built on —
	   run across it. Warmer and FAR more translucent than the body: a koi's
	   fins are thin wet tissue with the water showing through them, and at
	   the old near-opaque alpha the dorsal read as a mushroom cap sitting on
	   the fish's back and the caudal as a sheet of grey card. */
	float ray = abs( fract( vFinA * 9.0 ) - 0.5 ) * 2.0;
	vec3 finRgb = uFinColor * ( 0.78 + 0.52 * finT ) * ( 0.80 + 0.30 * ray );
	diffuseColor.rgb = mix( diffuseColor.rgb, finRgb, vFin );
	// Membranes thin out toward the rim: that is what makes a fan tail read as
	// a fan tail rather than a paddle.
	diffuseColor.a *= 1.0 - vFin * ( 0.30 + 0.58 * finT * finT );

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
	// Mostly a BODY effect. A full-strength rim on a near-edge-on membrane is
	// what turned the fan tail chalky grey: the fins are almost all grazing
	// angle, so they collect the whole term and nothing else.
	totalEmissiveRadiance += uSheen * koiFres * ( 1.0 - 0.62 * vFin ) * vec3( 1.0, 0.93, 0.82 );
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
const SIZE_LADDER = [1.30, 0.62, 0.98, 1.16, 0.74, 0.52, 0.88, 0.66, 1.04, 0.58]
const SIZE_BASE = 0.92

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
    const finColor = new THREE.Color(VARIANT_CAST[variant] ?? 0xf3e8db)

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
      uSheen: { value: 0.08 },
      uForm: { value: 1 }
    }

    const material = patchKoiMaterial(new THREE.MeshStandardMaterial({
      map: texture,
      roughness: variant === 'ogon' ? 0.22 : 0.30,
      metalness: variant === 'ogon' ? 0.38 : 0.06,
      // FrontSide: the body is a closed lathe and the fins carry their own
      // second sheet, so backfaces are never visible — and skipping them
      // halves the lit-transparent fill cost on the biggest fish.
      side: THREE.FrontSide,
      // Transparent for the presence fade and the translucent fin rims.
      // renderOrder is set per frame in update(): 0 (before water.js's 1)
      // while the lens is under water, 1.5 while it is above — see the note
      // on the skin of the pond there. Either way the school stays ahead of
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
      // Per-animal finish. A metallic ogon throws a hard sheen, a matt
      // utsuri barely any, and the big fish carry a touch more self-light so
      // the eye has something to settle on.
      lit: (0.82 + 0.36 * (SIZE_LADDER[i % SIZE_LADDER.length] - 0.52) / 0.78),
      gloss: variant === 'ogon' ? 1.9 : variant === 'orange' ? 1.25 : 0.80 + rand() * 0.5,
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
      // The wedge is deliberately WIDE in x. A compact formation puts every
      // fish inside the middle third of the frame, which is precisely where
      // the glass panel of body copy sits; spreading the ranks out sends the
      // flanks of the school through the open margins either side of it.
      slot: new THREE.Vector3(
        side * (0.85 + rank * 1.30 + rand() * 0.45),
        (rand() - 0.5) * 1.15,
        1.10 - rank * 1.05 - rand() * 0.55
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
  const camRight = new THREE.Vector3()
  const camUp = new THREE.Vector3()
  const anchorTarget = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  const sep = new THREE.Vector3()
  let camPos = null
  /* How far right of the lens axis the school is being staged, in world
     units, eased. See updateSchoolFrame for why this exists at all. */
  let stageSide = 0
  let aboveWater = 0
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
  function updateSchoolFrame (t, dt, paceMul, cohesion, camera) {
    if (!quality.reduced) schoolU += (0.62 * paceMul * dt) / schoolLength
    const su = schoolU - Math.floor(schoolU)
    schoolCurve.getPointAt(su, schoolPos)
    schoolCurve.getPointAt((su + 0.015) % 1, aheadA)
    schoolTan.subVectors(aheadA, schoolPos)
    if (schoolTan.lengthSq() < 1e-9) schoolTan.set(0, 0, -1)
    schoolTan.normalize()
    schoolPos.y += m.depth * DEPTH_GAIN + surfaceLift

    const stagePull = Math.min(0.90, 0.15 + cohesion * 0.72 + 0.58 * aboveWater)
    if (camera) {
      camera.getWorldDirection(camFwd)
      camRight.setFromMatrixColumn(camera.matrixWorld, 0)
      camUp.setFromMatrixColumn(camera.matrixWorld, 1)

      /* ---- WHERE IN THE FRAME ------------------------------------------
         The pond is behind the whole page, and from `dive` onward the page
         floats a glass panel of body copy over the middle 86% of it. Only a
         narrow strip each side, the gaps between sections, and the hero show
         open water. A school parked on the lens axis is therefore a school
         nobody ever sees — and in the hero the headline owns the LEFT half
         outright, so there the fish belong on the right.

         So the staging point is pushed sideways off the lens axis: hard and
         steady to the RIGHT while the lens is in the air, and underwater it
         wanders from one side to the other on a ~40 second cycle, which is
         slow enough never to read as fish dodging the text but fast enough
         that a reader working down a section sees the school pass through
         the open margin rather than never seeing it at all. */
      // Closer while the lens is in the air: every extra metre of slant range
      // is another metre of water column between the fish and the eye.
      const dist = 7.8 - 2.2 * aboveWater

      /* The wander DWELLS at the extremes and crosses the middle quickly.
         A plain sine spends as much time on the lens axis as off it, and on
         the tight-school chapters — where cohesion is 0.9 and every fish is
         inside one wedge — that means the entire school is behind the panel
         for a third of every cycle, all or nothing. Raising |sin| to a
         fractional power pushes it out toward ±1 and makes the crossing a
         brisk swim from one side of the pond to the other.

         Reduced motion gets a fixed, composed offset instead of the wander:
         a still school that slides sideways for a minute is still moving. */
      let swing = 0.80
      if (!quality.reduced) {
        const sway = Math.sin(t * 0.125) * 0.82 + Math.sin(t * 0.058 + 1.3) * 0.18
        swing = Math.sign(sway) * Math.pow(Math.abs(sway), 0.35)
      }
      /* Expressed as a FRACTION of the frame's half-width at the staging
         distance, not as a fixed number of metres. A phone in portrait sees
         a third of the width a desktop does, so an offset that reads as
         "over to the right" on a laptop throws the whole school clean off
         the side of a 360px screen. */
      const halfW = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect * dist
      const wantSide = halfW * (0.56 * aboveWater + 0.80 * (1 - aboveWater) * swing)
      stageSide += (wantSide - stageSide) *
        (quality.reduced || dt <= 0 ? 1 : 1 - Math.exp(-0.9 * dt))

      anchorTarget.copy(camera.position).addScaledVector(camFwd, dist)
      anchorTarget.addScaledVector(camRight, stageSide)
      // A light downward bias: enough that the school is not swimming through
      // the middle of a paragraph, not so much that it sinks under the bottom
      // edge of every open strip of water the page leaves it. Above the water
      // the lens is already looking DOWN at them, so the frame does that for
      // free and an extra push would only sink them out of the light.
      anchorTarget.addScaledVector(camUp, -0.55 * (1 - aboveWater))
      // Keep the staging point under the surface and off the silt bed — and,
      // while the lens is in the air, shallow enough that the light still
      // reaches them through the skin of the pond.
      anchorTarget.y = Math.min(anchorTarget.y, MAX_FISH_Y - 0.15)
      anchorTarget.y = Math.max(anchorTarget.y, MIN_FISH_Y + 0.8, -1.00 * aboveWater - 9 * (1 - aboveWater))
      schoolPos.lerp(anchorTarget, stagePull)
    }

    schoolAnchor.position.copy(schoolPos)
    quatFromDir(schoolTan, qSchool)
    schoolAnchor.quaternion.copy(qSchool)
    schoolAnchor.updateMatrixWorld(true)
  }

  /** Place one fish. Split out so the reduced-motion still frame can reuse it. */
  function place (f, t, dt, cohesion, spreadEff, staging) {
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

    /* STAGING, as distinct from cohesion. Cohesion is "are they swimming as
       one animal"; staging is "is the pond's population anywhere near the
       part of the pond the viewer is looking at". The loops themselves are
       anchored on a fixed world point, so without this the loose chapters —
       dive and clean, which sit at spread 1.1 and 1.25 and therefore get no
       cohesion at all — leave the school milling about off to one side of
       the frame while the copy talks about koi.

       So slide each fish's whole loop toward the staged anchor, keeping its
       own radius. A scattered school stays scattered; it is just scattered
       around the viewer instead of around a point they left behind. */
    if (staging > 0.001) {
      ownPos.x += (schoolAnchor.position.x - SCHOOL_CENTER.x) * staging
      ownPos.z += (schoolAnchor.position.z - SCHOOL_CENTER.z) * staging
    }

    ownPos.y += m.depth * DEPTH_GAIN + surfaceLift
    if (!quality.reduced) ownPos.y += f.bobAmp * Math.sin(t * f.bobRate + f.bobPhase)

    /* Seen from the air, depth costs light exponentially — and at the grazing
       angle the hero camera has, almost everything coming back off the pond
       is reflected sky. A koi a metre down is a rumour. So while the lens is
       out of the water the school's vertical spread is squeezed up toward the
       skin, which is exactly where koi hang at dusk anyway. */
    if (aboveWater > 0.001) {
      const roof = MAX_FISH_Y - 0.26
      ownPos.y += ((roof + (ownPos.y - roof) * 0.30) - ownPos.y) * aboveWater
    }

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
      if (d > 1e-4 && d < near) {
        ownPos.copy(camPos).addScaledVector(toCam, near / d)
        // ...and then sideways, out of the middle of the frame. Pushing only
        // along the ray leaves the fish parked on the lens axis at arm's
        // length, which is still one koi filling the shot — just a slightly
        // smaller one, and sat right over the body copy. Which way it goes
        // is the fish's own scatter sign, so two fish crowding the lens do
        // not both slide out the same side.
        const side = f.scatter.x >= 0 ? 1 : -1
        ownPos.addScaledVector(camRight, side * (near - d) * 0.9)
      }
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

  /**
   * The story grade, computed ONCE per frame. Every fish reads the same four
   * numbers out of it, scaled by its own small bias — doing the arithmetic
   * per fish was pure repetition.
   *
   *   clarity    saturation and value: colour drains as the water thickens
   *              and floods back as it clears. This is the koi half of the
   *              "the pond cleans itself" beat, so the range is wide enough
   *              to actually notice.
   *   coldFactor an additional desaturation plus a green murk cast, so the
   *              filthy chapter does not just dim the fish, it sickens them.
   *   koiLight   emissive lift, so they stay legible against the gloom.
   *
   * Above the water the fish are being read THROUGH the pond's skin at a
   * glancing angle, where most of what the lens gets back is sky reflection.
   * They need a real lift there or the hero frame has no koi in it at all.
   */
  const g = { glow: 0, sat: 1, value: 1, murk: 0, sheen: 0 }
  function gradeShared () {
    const lift = aboveWater * aboveWater
    g.glow = m.koiLight * 2.4 * (1 + 1.8 * lift)
    g.sat = (0.62 + 0.46 * m.clarity) * (1 - 0.40 * m.coldFactor)
    g.value = (0.74 + 0.30 * m.clarity) * (1 + 0.22 * aboveWater)
    g.murk = 0.52 * m.coldFactor * (1 - m.clarity)
    // Sheen gets a smaller share of the lift: a hard white rim on every fish
    // would read as chrome, not as a wet back catching a lantern.
    g.sheen = (0.030 + 0.105 * m.clarity) * (1 + 1.1 * lift)
  }

  function grade (f) {
    const u = f.uniforms
    u.uGlow.value = g.glow * f.lit
    u.uSat.value = g.sat
    u.uValue.value = g.value
    u.uMurkMix.value = g.murk
    u.uSheen.value = g.sheen * f.gloss
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
      // Capped: past a hard flick there is nothing left to startle. Without
      // the cap a high-`react` fish reaches 1.4 and its tail beats at nearly
      // seven hertz, which stops reading as alarm and starts reading as a
      // bug in the animation.
      const target = quality.reduced ? 0 : Math.min(1.15, shaped * f.react)
      // Fast attack, slow release — startle, then settle.
      const rate = target > f.startle ? f.reactAttack : 1.15
      f.startle += (target - f.startle) * (dt > 0 ? 1 - Math.exp(-rate * dt) : 1)
      startleSum += f.startle
    }
    startleAvg = startleSum / fish.length

    /* ---- derived school shape ------------------------------------------ */
    camPos = (stage && stage.camera) ? stage.camera.position : null
    const sub = stage && typeof stage.submergence === 'number' ? stage.submergence : 1
    aboveWater = 1 - sub
    surfaceLift += (0.62 * (1 - sub) - surfaceLift) * mk

    // A startled school loses its composure as well as its station-keeping.
    const spreadEff = Math.min(1.95, m.spread + 0.55 * startleAvg)
    const cohesion = clamp01((1.08 - spreadEff) / 0.23) * 0.90
    // Staging is NOT cohesion: see place(). It is deliberately low for the
    // loose chapters — a scattered school that keeps its own wide loops is
    // what sends the odd fish through the open margins beside the copy, and
    // dragging all of them toward the lens axis would plant the whole school
    // behind the panel at once.
    const staging = clamp01(0.25 + 0.55 * cohesion + 0.45 * aboveWater)
    const paceMul = m.pace * (1 + 0.9 * startleAvg)

    /* ---- seeing them through the skin of the pond ----------------------
       water.js charges everything behind the surface plane for a full
       4.2-unit column of extinction. That is right for the pond floor and
       badly wrong for a koi forty centimetres down: at the hero's grazing
       angle it lets through about 2% of whatever is under the water, and a
       capture measured the whole school arriving 4/255 brighter than the
       water it was swimming in. The dusk frame simply had no koi in it.

       So the moment the lens leaves the water the school is drawn OVER the
       surface instead of under it, at the low opacity a shape seen through
       the skin of a pond actually has. renderOrder 1.5 puts them after the
       water (1) and still before the particle layers (2-4). The swap lands
       exactly at the geometric crossing, where water.js's meniscus flare is
       at full strength and covers it, and the opacity ramps up from nothing
       on the far side of it so there is no step to see. */
    const overWater = aboveWater > 0.5
    const skin = overWater ? 0.05 + 0.44 * smoothstep(0.52, 0.98, aboveWater) : 1
    updateSchoolFrame(t, dt, paceMul, cohesion, stage && stage.camera)
    gradeShared()

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
      f.material.opacity = vis * skin
      f.mesh.renderOrder = overWater ? 1.5 : 0
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
      place(f, t, quality.reduced ? 0 : dt, cohesion, spreadEff, staging)
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
