import * as THREE from 'three'
import { PALETTE } from './palette.js'
import { LANTERNS, FLOOR_Y, WATER_LEVEL } from './scene.js'

/**
 * water.js — the pond surface.
 *
 * One large plane with a hand-written shader. It has to look right from BOTH
 * sides, because the story camera passes through it TWICE: down at p~0.21 and
 * back up at p~0.92.
 *
 *   from above  -> mostly dark, reflective water. A sky-tinted fresnel field,
 *                  lantern light skating along the ripples, and only as much
 *                  of the floor as the water's clarity actually lets through.
 *   from below   -> a rippling mirrored ceiling with Snell's window punched
 *                  through it; at dawn the window blazes, at night it barely
 *                  glows.
 *
 * STORY-DRIVEN (stage.mood — see the contract at the top of index.js)
 *   waterTint   -> uDeep, the in-scattered colour of the water body
 *   clarity     -> uExt, the extinction coefficient. This is the single most
 *                  important knob: it decides how much of the pond floor and
 *                  the koi survive the trip up through the water column, so
 *                  it is what makes "murk" opaque and "dawn" see-through.
 *   silt        -> milky backscatter; a silted pond is BRIGHTER, not darker
 *   algae       -> a floating scum film on the skin of the water, procedural,
 *                  whose coverage threshold is driven straight off the mood so
 *                  the film visibly breaks up and retreats as the pond cleans
 *   lightWarmth -> uWarmTint, a cold green cast in the murk / warm at dawn
 *   dawnFactor  -> swaps the night sky for a morning one, lights a low sun
 *                  specular path, brightens Snell's window, and re-colours the
 *                  surface-break from "swallowed by gloom" to "released"
 *   fogDensity  -> matched to the scene fog so the plane sits in the same haze
 *
 * The wave field is defined once, in JS, and the GLSL is generated from it so
 * the lily pads (which bob on the CPU) can never drift out of sync with the
 * surface the GPU draws.
 */

export const WATER_SIZE = 58
const TAU = Math.PI * 2

/**
 * Four directional sine waves: long and lazy down to short and choppy.
 * `len` is the wavelength in world units, `spd` the crest speed in units/sec.
 */
const WAVES = [
  { dx: 0.92, dz: 0.39, amp: 0.058, len: 7.6, spd: 0.55 },
  { dx: -0.45, dz: 0.89, amp: 0.040, len: 4.6, spd: 0.78 },
  { dx: 0.62, dz: -0.78, amp: 0.021, len: 2.70, spd: 1.12 },
  { dx: -0.86, dz: -0.51, amp: 0.011, len: 1.55, spd: 1.55 }
]

/** Surface height at a world (x, z) — the CPU mirror of `surfaceHeight()`. */
export function surfaceHeight (x, z, t) {
  let h = 0
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i]
    const k = TAU / w.len
    h += w.amp * Math.sin((w.dx * x + w.dz * z) * k + t * w.spd * k)
  }
  return h
}

/** Surface gradient (dh/dx, dh/dz) at a world (x, z). Writes into `out`. */
export function surfaceGradient (x, z, t, out) {
  let gx = 0
  let gz = 0
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i]
    const k = TAU / w.len
    const c = Math.cos((w.dx * x + w.dz * z) * k + t * w.spd * k)
    gx += w.amp * k * w.dx * c
    gz += w.amp * k * w.dz * c
  }
  out.set(gx, gz)
  return out
}

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n))

/** GLSL for the wave field, unrolled from WAVES so there is no loop overhead. */
const WAVE_GLSL = `
// --- generated from WAVES in water.js -------------------------------------
float surfaceHeight( vec2 p, float t ) {
  float h = 0.0;
${WAVES.map((w) => {
  const k = TAU / w.len
  return `  h += ${f(w.amp)} * sin( dot( vec2( ${f(w.dx)}, ${f(w.dz)} ), p ) * ${f(k)} + t * ${f(w.spd * k)} );`
}).join('\n')}
  return h;
}

// Analytic gradient of surfaceHeight(). Evaluated per-fragment, so the shading
// normal is exact no matter how coarsely the plane is tessellated.
vec2 surfaceGrad( vec2 p, float t ) {
  vec2 g = vec2( 0.0 );
${WAVES.map((w) => {
  const k = TAU / w.len
  return `  g += ${f(w.amp * k)} * vec2( ${f(w.dx)}, ${f(w.dz)} ) * cos( dot( vec2( ${f(w.dx)}, ${f(w.dz)} ), p ) * ${f(k)} + t * ${f(w.spd * k)} );`
}).join('\n')}
  return g;
}
`

/**
 * High-frequency "chop" that only perturbs the normal, never the geometry.
 * Three detuned terms, the last one domain-warped so the interference pattern
 * does not read as plaid. This is what the lantern glints live on — without it
 * the specular collapses into one dull blob instead of skating across ripples.
 */
const CHOP_GLSL = `
vec2 chopGrad( vec2 p, float t ) {
  vec2 g = vec2( 0.0 );

  vec2 d1 = vec2( 0.31, 0.95 );
  g += 0.0605 * d1 * cos( dot( d1, p ) * 11.0 + t * 2.6 );   // 0.0055 * 11.0

  vec2 d2 = vec2( -0.77, 0.64 );
  g += 0.0608 * d2 * cos( dot( d2, p ) * 19.0 - t * 3.4 );   // 0.0032 * 19.0

  // warp the third term's domain with a slow swell
  float warp = sin( p.x * 2.1 + t * 0.4 ) * 0.6;
  vec2 d3 = vec2( 0.60, -0.80 );
  g += 0.0648 * d3 * cos( dot( d3, p + warp ) * 27.0 + t * 4.1 ); // 0.0024 * 27.0

  // A fourth, very fine term. Too small to see as a wave, but it is what
  // breaks the specular into glitter rather than a smooth streak.
  vec2 d4 = vec2( 0.95, 0.31 );
  g += 0.0462 * d4 * cos( dot( d4, p - warp * 0.5 ) * 42.0 - t * 5.3 ); // 0.0011 * 42.0

  return g;
}
`

/**
 * Animated caustic pattern, shared with the pond floor in environment.js.
 * The classic "folded domain" trick: iteratively displace the sample point by
 * sines of itself, accumulate reciprocal distances, then crush the result with
 * a high power so only the bright filaments survive.
 */
export const CAUSTIC_GLSL = `
float causticPattern( vec2 p, float t ) {
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.0045;

  for ( int n = 0; n < 3; n ++ ) {
    float tt = t * ( 1.0 - ( 3.5 / float( n + 1 ) ) );
    i = p + vec2( cos( tt - i.x ) + sin( tt + i.y ), sin( tt - i.y ) + cos( tt + i.x ) );
    c += 1.0 / length( vec2( p.x / ( sin( i.x + tt ) / inten ), p.y / ( cos( i.y + tt ) / inten ) ) );
  }

  c /= 3.0;
  c = 1.17 - pow( c, 1.4 );
  return clamp( pow( abs( c ), 8.0 ), 0.0, 1.0 );
}
`

/** Hash / value noise / fbm — the algae film and the droplets ride on these. */
const NOISE_GLSL = `
float hash21( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}

float vnoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 fr = fract( p );
  vec2 u = fr * fr * ( 3.0 - 2.0 * fr );
  float a = hash21( i );
  float b = hash21( i + vec2( 1.0, 0.0 ) );
  float c = hash21( i + vec2( 0.0, 1.0 ) );
  float d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

float fbm( vec2 p ) {
  float v = 0.0;
  float a = 0.56;
  for ( int i = 0; i < FBM_OCTAVES; i ++ ) {
    v += a * vnoise( p );
    // rotate between octaves so the lattice never lines up into a grid
    p = vec2( p.x * 1.62 - p.y * 1.21, p.x * 1.21 + p.y * 1.62 );
    a *= 0.5;
  }
  return v;
}
`

const VERT = /* glsl */`
uniform float uTime;

varying vec3 vWorld;
varying float vFogDepth;

${WAVE_GLSL}

void main() {
  // The plane geometry already lies in XZ with y = 0, so displacing in world
  // space keeps the wave field anchored to the pond, not to the mesh.
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  wp.y += surfaceHeight( wp.xz, uTime );

  vWorld = wp.xyz;

  vec4 mv = viewMatrix * wp;
  vFogDepth = - mv.z;
  gl_Position = projectionMatrix * mv;
}
`

/**
 * @param {object} quality
 * @returns {string} the fragment shader, with the per-tier budgets baked in.
 */
function buildFrag (quality) {
  const octaves = quality.tier === 'low' || quality.reduced ? 2 : 3
  const droplets = quality.reduced ? 0 : 1

  return /* glsl */`
#define LANTERN_COUNT ${LANTERNS.length}
#define FBM_OCTAVES ${octaves}
#define DROPLETS ${droplets}

uniform float uTime;
uniform vec3  uCamPos;
uniform float uSub;        // 0 = lens above water, 1 = fully under
uniform float uCrossing;   // peaks at 1 exactly as the lens pierces the skin

uniform vec3  uDeep;       // in-scattered colour of the water body (mood.waterTint)
uniform vec3  uWarmTint;   // multiplier from mood.lightWarmth: green murk .. warm dawn
uniform float uExt;        // extinction per world unit, from mood.clarity
uniform float uSilt;       // suspended load -> milky backscatter
uniform float uAlgae;      // 0..1 surface scum coverage
uniform vec3  uAlgaeColor;
uniform float uDawn;       // mood.dawnFactor

uniform vec3  uSkyLow;     // sky near the horizon
uniform vec3  uSkyHigh;    // sky overhead
uniform vec3  uSunDir;     // low morning sun, normalised
uniform vec3  uSunColor;
uniform vec3  uMoonDir;
uniform vec3  uMoonColor;

uniform vec3  uLanternColor;
uniform float uLanternPower;
uniform vec3  uLanternPos[ LANTERN_COUNT ];

uniform float uColumn;     // representative depth of water under the surface
uniform vec3  uFogColor;
uniform float uFogDensity;

varying vec3 vWorld;
varying float vFogDepth;

${WAVE_GLSL}
${CHOP_GLSL}
${NOISE_GLSL}

/* The sky this surface is reflecting, as a function of the reflected ray. */
vec3 skyAlong( vec3 r ) {
  float up = clamp( r.y * 0.5 + 0.5, 0.0, 1.0 );
  return mix( uSkyLow, uSkyHigh, smoothstep( 0.5, 0.92, up ) );
}

/**
 * Floating scum. One slow-drifting fbm decides where the mat is, a second,
 * finer one eats holes in it so the edges are ragged rather than blobby.
 * The threshold is driven by uAlgae: as the mood cleans up, the threshold
 * climbs past the noise and the mat shrinks, fragments and vanishes. That
 * retreat is the point — the viewer is watching the pond get cleaned.
 */
float algaeCover( vec2 p, float t ) {
  if ( uAlgae < 0.004 ) return 0.0;
  vec2 ap = p * 0.21 + vec2( t * 0.011, - t * 0.0075 );
  float n = fbm( ap ) + 0.34 * fbm( ap * 3.1 + vec2( - t * 0.02, t * 0.014 ) );
  // 1.35 is above anything the noise reaches, so uAlgae = 0 really is bare.
  // Even at uAlgae = 1 the threshold stays high enough that open water shows
  // between the mats — full coverage reads as a lawn, not a neglected pond.
  float thr = mix( 1.35, 0.60, uAlgae );
  float cov = smoothstep( thr, thr + 0.22, n );
  // Fine mottle: duckweed and filament, not a painted sheet.
  float mottle = 0.50 + 0.50 * vnoise( p * 2.9 + vec2( t * 0.05, 0.0 ) );
  return clamp( cov * mottle * ( 0.35 + 0.65 * uAlgae ), 0.0, 1.0 );
}

#if DROPLETS
/** Beads of water clinging to the lens as it breaks through. */
float dropletField( vec2 p, float t ) {
  vec2 q = p * 6.5;
  vec2 ip = floor( q );
  vec2 fp = fract( q ) - 0.5;
  float h = hash21( ip );
  if ( h < 0.52 ) return 0.0;
  vec2 wob = 0.2 * vec2( cos( h * 31.0 + t * 1.7 ), sin( h * 27.0 + t * 2.1 ) );
  float r = 0.10 + 0.22 * fract( h * 7.1 );
  float d = length( fp - wob );
  return smoothstep( r, r * 0.35, d );
}
#endif

void main() {
  // Fade the fine chop out with distance. At range its wavelength drops
  // below a pixel and the specular turns into crawling moire, which reads as
  // corduroy rather than water.
  float lod = 0.16 + 0.84 * exp( - vFogDepth * 0.13 );
  vec2 g = surfaceGrad( vWorld.xz, uTime ) + chopGrad( vWorld.xz, uTime ) * lod;

  // |up| -> 0 across the whole visible band exactly as the lens crosses the
  // skin. Everything in "THE MOMENT" below keys off that.
  vec3 Nflat = normalize( vec3( -g.x, 1.0, -g.y ) );
  vec3 V = normalize( uCamPos - vWorld );   // surface point -> eye
  float edge = pow( 1.0 - abs( dot( Nflat, V ) ), 8.0 );

  // Meniscus: right at the waterline the film bulges around the lens, so
  // crank the chop there and let the reflection smear. Cheap, and it is what
  // sells the break as a physical event rather than a dissolve.
  g += chopGrad( vWorld.xz * 2.4 + 7.3, uTime * 1.5 ) * uCrossing * edge * lod * 1.3;

  // A height field's normal is ( -dh/dx, 1, -dh/dz ).
  vec3 N = normalize( vec3( -g.x, 1.0, -g.y ) );
  float up = dot( N, V );                   // > 0 eye above, < 0 eye below

  // The water body itself. Silt does not darken a pond, it makes it MILKY:
  // more of the light that goes in comes straight back out at you.
  vec3 body = uDeep * uWarmTint * ( 0.95 + 0.80 * uSilt );

  float cov = algaeCover( vWorld.xz, uTime );

  vec3 col;
  float alpha;

  if ( up > 0.0 ) {

    /* ------------- seen from above: dark water, light skating ------------- */
    float ndv = clamp( up, 0.0, 1.0 );
    // Schlick for air -> water. F0 = 0.02, so looking straight down the
    // surface is nearly invisible and at the horizon it is a mirror.
    float fres = 0.02 + 0.98 * pow( 1.0 - ndv, 5.0 );

    vec3 R = reflect( -V, N );
    vec3 refl = skyAlong( R ) * fres;

    // How much of whatever is below actually reaches the eye. The refracted
    // ray's slope sets the path length through the column, so the horizon
    // goes opaque long before the water directly underfoot does.
    vec3 rt = refract( -V, N, 0.75 );
    float downY = max( -rt.y, 0.16 );
    float trans = exp( - uExt * ( uColumn / downY ) );
    // Distant water shows no bottom at all. Without this the far field reads
    // as a lit floor with a film on it, and the floor's own detail aliases
    // into coloured speckle across half the frame.
    trans *= mix( 1.0, 0.22, smoothstep( 5.0, 26.0, vFogDepth ) );

    vec3 scat = body * ( 1.0 - fres ) * ( 1.0 - trans );

    /* ---- speculars: this is what makes it read as water, not as ground --- */
    vec3 spec = vec3( 0.0 );

    for ( int i = 0; i < LANTERN_COUNT; i ++ ) {
      vec3 toL = uLanternPos[ i ] - vWorld;
      float d = length( toL );
      vec3 L = toL / max( d, 0.001 );
      // A reflected image does not fall off with distance the way irradiance
      // does — only its apparent size shrinks. Near-linear falloff keeps the
      // far lanterns writing a glitter path across the pond.
      float atten = 1.0 / ( 1.0 + 0.045 * d );
      float ndh = max( dot( N, normalize( L + V ) ), 0.0 );
      float glint = pow( ndh, 430.0 ) * 7.0 * lod * lod; // fades with range or it crawls
      float path  = pow( ndh, 90.0 ) * 0.40;   // the streak toward the source
      float pool  = pow( ndh, 7.0 ) * 0.045;   // the broad warm pool
      spec += uLanternColor * uLanternPower * atten * ( glint + path + pool );
    }

    // Moonlight sheen: broad, cold, and the main reason the far water has any
    // shape at all on a night with the lanterns behind you.
    float mdh = max( dot( N, normalize( uMoonDir + V ) ), 0.0 );
    spec += uMoonColor * ( pow( mdh, 110.0 ) * 0.55 + pow( mdh, 16.0 ) * 0.030 )
          * ( 1.0 - 0.75 * uDawn );

    // Morning sun, low over the far bank: a warm glitter path straight up the
    // frame. Only exists at dawn, and it is the payoff of the whole scroll.
    float sdh = max( dot( N, normalize( uSunDir + V ) ), 0.0 );
    spec += uSunColor * uDawn * ( pow( sdh, 520.0 ) * 9.0 * lod * lod
          + pow( sdh, 30.0 ) * 0.32 );

    // Grazing angles reflect more of everything, but keep some straight-down
    // glint or the water under the camera goes dead.
    spec *= 0.3 + 0.7 * fres;

    vec3 num = refl + scat + spec;
    alpha = clamp( 1.0 - trans * ( 1.0 - fres ), 0.0, 1.0 );

    // Scum sits ON the film: opaque, matte, and it kills the specular.
    vec3 algaeLit = uAlgaeColor * ( 0.30 + 0.55 * uLanternPower ) + spec * 0.10;
    num = mix( num, algaeLit, cov );
    alpha = mix( alpha, 1.0, cov * 0.96 );

    // The blend multiplies by alpha, so divide it back out to get exactly
    // refl + scat + spec composited over whatever is behind the plane.
    col = num / max( alpha, 0.05 );

  } else {

    /* -------------- seen from below: a rippling mirrored ceiling ---------- */
    float c = clamp( -up, 0.0, 1.0 );            // 1 = looking straight up

    // Snell's window: the whole world above only reaches the eye within ~48.6
    // degrees of vertical (cos ~ 0.661). Outside it the underside is a mirror.
    // Wobble the boundary with the live wave height so the window breathes.
    float h = surfaceHeight( vWorld.xz, uTime );
    float wob = ( h * 0.50 + ( g.x + g.y ) * 0.22 ) * lod;
    float win = smoothstep( 0.50 + wob, 0.80 + wob, c );

    // The mirror: the dark body of the pond, banded by the real wave field so
    // the ceiling ripples instead of just shimmering on a timer.
    float ripple = 0.5 + 0.5 * sin( h * 30.0 + dot( g, vec2( 17.0, 14.0 ) ) + uTime * 1.15 );
    vec3 mirrored = body * ( 0.52 + 0.42 * uSilt ) * ( 0.78 + 0.46 * ripple * lod );

    // Inside the window: the sky, compressed. At dawn it is the way out.
    vec3 above = mix( uSkyLow, uSkyHigh, smoothstep( 0.55, 1.0, c ) );
    above *= mix( 1.0, 1.32, uDawn ) * ( 0.55 + 0.45 * c );

    col = mix( mirrored, above, win );

    // Snell's window has a bright, slightly flared rim. Dawn warms and lifts it.
    float rim = clamp( win * ( 1.0 - win ) * 4.0, 0.0, 1.0 );
    col += mix( uMoonColor * 0.20, uSunColor * 0.78, uDawn ) * rim * lod;

    for ( int i = 0; i < LANTERN_COUNT; i ++ ) {
      vec3 toL = uLanternPos[ i ] - vWorld;
      float d = length( toL );
      vec3 L = toL / max( d, 0.001 );
      float atten = 1.0 / ( 1.0 + 0.05 * d * d );
      float ndh = max( dot( N, normalize( L - V ) ), 0.0 );
      col += uLanternColor * uLanternPower * atten * win * pow( ndh, 24.0 ) * 1.4 * lod;
    }

    // The morning sun seen up through the window — a soft, huge warm disc.
    float sdh = max( dot( N, normalize( uSunDir - V ) ), 0.0 );
    col += uSunColor * uDawn * win * pow( sdh, 26.0 ) * 1.1 * lod;

    // Scum read from underneath: dark mats drifting across the ceiling,
    // blocking the window. As it clears, the way out opens up.
    col = mix( col, uAlgaeColor * 0.22, cov );

    alpha = 1.0;
  }

  /* --------------------------- THE MOMENT ------------------------------- */
  // The lens pierces the film. The plane is edge-on, so edge lights up the
  // whole visible band. Going DOWN (uDawn ~ 0) that band is a cold green seam
  // closing over you; coming UP (uDawn ~ 1) it is a warm flare opening out.
  float band = pow( 1.0 - abs( up ), mix( 14.0, 6.0, uDawn ) );
  float seam = pow( 1.0 - abs( up ), 46.0 );   // the hairline meniscus itself

  vec3 coldRim = mix( uMoonColor * 0.55, uDeep * 2.2 + vec3( 0.008, 0.028, 0.022 ), 0.5 );
  vec3 rimCol = mix( coldRim, uSunColor, uDawn );

  col += rimCol * uCrossing * (
      band * mix( 0.32, 1.6, uDawn ) +
      seam * mix( 0.55, 2.6, uDawn ) );

  // Going down, the murk closes in behind the seam: drag the band toward the
  // water body so the entry reads as being swallowed.
  col = mix( col, body * 1.6, uCrossing * band * ( 1.0 - uDawn ) * 0.42 );

#if DROPLETS
  // Surface tension: beads clinging to the lens. They only really read when
  // there is light to catch, so they belong to the upward crossing.
  float drops = dropletField( vWorld.xz, uTime ) * uCrossing * edge;
  col += mix( uMoonColor * 0.3, uSunColor * 1.5, uDawn ) * drops * ( 0.25 + 0.95 * uDawn );
#endif

  alpha = max( alpha, uCrossing * clamp( band + seam, 0.0, 1.0 ) );

  // FogExp2, matching three's fog_fragment so the water sits in the same haze
  // as every MeshStandardMaterial in the scene.
  float fogFactor = 1.0 - exp( - uFogDensity * uFogDensity * vFogDepth * vFogDepth );
  col = mix( col, uFogColor, clamp( fogFactor, 0.0, 1.0 ) );

  gl_FragColor = vec4( col, alpha );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
}

/* -------------------------------------------------------------------------
   Dawn palette. These are local to the surface: palette.js is the night
   palette and is not ours to edit, so the morning colours live here.
   ------------------------------------------------------------------------- */
const DAWN_SKY_LOW = 0x8a6248   // warm haze along the far bank
const DAWN_SKY_HIGH = 0x4a6176  // pale blue overhead — deliberately close in
const DAWN_SUN = 0xffcf9e       // value to SKY_LOW, so the horizon reads soft
const ALGAE_COLOR = 0x33491f

/** Used when a caller has not seeded stage.mood yet (tests, partial builds). */
const DEFAULT_MOOD = {
  fogDensity: 0.019,
  waterTint: PALETTE.night700,
  lightWarmth: 1,
  silt: 0,
  clarity: 0.55,
  algae: 0,
  dawnFactor: 0,
  coldFactor: 0
}

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n)
const lerp = (a, b, t) => a + (b - a) * t

/**
 * @param {{quality:object}} opts
 * @returns {{mesh:THREE.Mesh, update:Function, dispose:Function}}
 */
export function createWater ({ quality }) {
  const seg = quality.waterSegments
  const geometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, seg, seg)
  geometry.rotateX(-Math.PI / 2) // +Y normal, lying flat at y = 0

  // How deep the water is, as far as the transmission term is concerned. The
  // real floor is 6.2 below, but koi and debris live well above it, so a
  // slightly shallower column keeps them readable as shapes under the skin
  // without letting the floor punch through.
  const column = (WATER_LEVEL - FLOOR_Y) * 0.68

  const uniforms = {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uSub: { value: 0 },
    uCrossing: { value: 0 },

    uDeep: { value: new THREE.Color(PALETTE.night700) },
    uWarmTint: { value: new THREE.Color().setRGB(1, 1, 1) },
    uExt: { value: 0.28 },
    uSilt: { value: 0 },
    uAlgae: { value: 0 },
    uAlgaeColor: { value: new THREE.Color(ALGAE_COLOR) },
    uDawn: { value: 0 },

    uSkyLow: { value: new THREE.Color(PALETTE.night600) },
    uSkyHigh: { value: new THREE.Color(PALETTE.night500) },
    // Low morning sun over the far bank (the camera looks down -Z), so its
    // glitter path runs straight up the middle of the frame toward the lens.
    uSunDir: { value: new THREE.Vector3(0.17, 0.15, -1).normalize() },
    uSunColor: { value: new THREE.Color(DAWN_SUN) },
    uMoonDir: { value: new THREE.Vector3(-6, 14, 4).normalize() },
    uMoonColor: { value: new THREE.Color(PALETTE.moon) },

    uLanternColor: { value: new THREE.Color(PALETTE.brass400) },
    uLanternPower: { value: 1 },
    uLanternPos: { value: LANTERNS.map((l) => l.pos.clone()) },

    uColumn: { value: column },
    uFogColor: { value: new THREE.Color(PALETTE.fogAbove) },
    uFogDensity: { value: 0.019 }
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: buildFrag(quality),
    transparent: true,
    // No depth writes: the water is drawn after the opaque pass and simply
    // blends over whatever is beneath it (koi, pebbles, caustic floor).
    depthWrite: false,
    side: THREE.DoubleSide
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false // it is effectively the whole world
  mesh.renderOrder = 1
  mesh.name = 'pond-surface'

  // Scratch colours, so update() never allocates.
  const nightLow = new THREE.Color(PALETTE.night600)
  const nightHigh = new THREE.Color(PALETTE.night500)
  const dawnLow = new THREE.Color(DAWN_SKY_LOW)
  const dawnHigh = new THREE.Color(DAWN_SKY_HIGH)

  function update (t, stage) {
    const m = stage.mood || DEFAULT_MOOD
    const sub = stage.submergence
    const dawn = clamp01(m.dawnFactor != null ? m.dawnFactor : 0)
    const cold = clamp01(m.coldFactor != null ? m.coldFactor : 0)
    const clarity = clamp01(m.clarity != null ? m.clarity : 0.55)
    const silt = clamp01(m.silt || 0)
    const algae = clamp01(m.algae || 0)

    uniforms.uTime.value = t
    uniforms.uCamPos.value.copy(stage.camera.position)
    uniforms.uSub.value = sub
    uniforms.uCrossing.value = stage.crossing
    uniforms.uDawn.value = dawn
    uniforms.uSilt.value = silt
    uniforms.uAlgae.value = algae

    // The one number that decides how much pond you can see through. Murk
    // (clarity 0.1) is effectively opaque over a 4-unit column; dawn
    // (clarity 1.0) lets roughly two thirds of the floor through.
    uniforms.uExt.value = lerp(0.95, 0.26, clarity) * (1 + 0.35 * silt)

    uniforms.uDeep.value.setHex(m.waterTint != null ? m.waterTint : PALETTE.night700)

    // lightWarmth as a plain linear multiplier: green-cold in the murk,
    // amber-warm at dawn. setRGB (not setHex) — these are multipliers, not
    // colours, so they must not go through the sRGB decode.
    uniforms.uWarmTint.value.setRGB(
      lerp(lerp(1, 0.80, cold), 1.20, dawn),
      lerp(lerp(1, 1.00, cold), 1.02, dawn),
      lerp(lerp(1, 0.88, cold), 0.82, dawn)
    )

    uniforms.uSkyLow.value.copy(nightLow).lerp(dawnLow, dawn)
    uniforms.uSkyHigh.value.copy(nightHigh).lerp(dawnHigh, dawn)

    // Lanterns dim underwater, and they stop mattering once the sun is up.
    uniforms.uLanternPower.value = (1 - 0.45 * sub) * (1 - 0.55 * dawn)

    uniforms.uFogColor.value.copy(stage.scene.fog.color)
    uniforms.uFogDensity.value = stage.scene.fog.density
  }

  function dispose () {
    geometry.dispose()
    material.dispose()
  }

  return { mesh, update, dispose }
}
