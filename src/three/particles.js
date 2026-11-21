import * as THREE from 'three'
import { PALETTE } from './palette.js'

/**
 * particles.js — the three underwater atmospherics:
 *
 *   motes   — suspended silt, drifting. Only visible once we are under.
 *   bubbles — rise past the lens; they spike during the surface break.
 *   shafts  — god-rays stabbing down from the surface. Hollow cones shaded by
 *             view angle, which is a cheap stand-in for real volumetrics.
 *
 * All three are additive and fog-aware: additive light must fade to *nothing*
 * with distance, not toward the fog colour, so each shader multiplies alpha by
 * (1 - fogFactor) instead of mixing its colour.
 *
 * STORY (see the mood contract at the top of three/index.js)
 * ---------------------------------------------------------
 *   silt       the mote load. ~0 at dusk, 1.0 in the murk — thick, fat,
 *              greenish particles that scatter the lantern light badly.
 *   settle     1 while the silt should be actively draining. Combined with
 *              falling `silt` it produces `drain`: the motes sink and are
 *              swept outward, as if vacuumed, and sink below the floor mesh
 *              where the depth test buries them. The pond is cleaned on
 *              screen rather than cross-faded.
 *   clarity    scatter colour, bubble liveliness, and how far the shafts
 *              punch through the water.
 *   coldFactor particulate goes green-brown; shafts go sickly.
 *   dawnFactor everything warms and the shafts strengthen into real god-rays.
 *
 * `drain` is derived as settle * (1 - silt) rather than integrated over time,
 * so it is a pure function of scroll position: scrolling back up the page
 * un-drains the pond instead of leaving it stuck clean.
 */

const FOG_GLSL = /* glsl */`
// FogExp2, matching three's fog_fragment. Additive passes fade alpha, not rgb.
float fogAttenuation( float depth, float density ) {
  float f = 1.0 - exp( - density * density * depth * depth );
  return clamp( 1.0 - f, 0.0, 1.0 );
}
`

function mulberry32 (seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n)

/* =========================================================================
   Motes
   ========================================================================= */

const MOTE_VERT = /* glsl */`
uniform float uTime;
uniform float uProjScale;   // pixels per world unit at one unit of depth
uniform float uSize;
uniform float uDrain;       // 0..1 how far through the vacuum the silt is
uniform float uSettle;      // 1 while the silt is actively being pulled out
uniform float uStir;        // 0..1 how hard the viewer is scrolling right now
uniform float uStirDir;     // +1 scrolling down, -1 up

attribute float aSeed;
attribute float aBright;

varying float vBright;
varying float vFogDepth;
varying float vSunk;

void main() {
  vec3 p = position;

  // Lissajous drift: three detuned sines per axis read as aimless float.
  float s = aSeed * 6.2831853;
  p.x += 0.16 * sin( uTime * 0.21 + s );
  p.y += 0.11 * sin( uTime * 0.17 + s * 1.7 );
  p.z += 0.16 * cos( uTime * 0.19 + s * 2.3 );

  /* Being vacuumed. Heavier grains (low aSeed) hold on longer, so the cloud
     thins from the top down instead of dropping as one slab. The sink is
     deliberately deeper than the basin: the floor's depth test buries what
     has settled, which is exactly what settled silt should do. */
  float pull = uDrain * ( 0.45 + 1.05 * aSeed );
  p.y -= pull * 3.6;
  // Swept outward toward the edges on the way down.
  p.xz += normalize( p.xz + vec2( 0.0013, 0.0017 ) ) * pull * 1.5;
  // While the pump is actually running the column streams rather than slides.
  p.y -= uSettle * ( 1.0 - uDrain ) * 0.35 * sin( uTime * 1.1 + s * 1.3 );

  /* Scrolling hard drags water past the lens. The cloud curls, and the grains
     slip the OTHER way from the camera's travel — scroll down, the silt rises
     past you. Deliberately small: this is meant to be felt under the hand, not
     noticed, and it decays to nothing the moment the viewer stops. */
  float stirW = uTime * 1.9 + s * 3.1;
  p.x += uStir * 0.15 * sin( stirW );
  p.z += uStir * 0.13 * cos( stirW * 1.27 );
  p.y += uStir * uStirDir * 0.20 * ( 0.4 + 0.6 * aSeed );

  vSunk = pull;

  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  vFogDepth = - mv.z;
  vBright = aBright;

  // Perspective point sizing: a world-space radius projected to pixels.
  gl_PointSize = clamp( uSize * ( 0.4 + aSeed ) * uProjScale / max( - mv.z, 0.1 ), 1.0, 26.0 );
  gl_Position = projectionMatrix * mv;
}
`

const MOTE_FRAG = /* glsl */`
uniform vec3  uColor;
uniform float uOpacity;
uniform float uFogDensity;
uniform float uSoft;       // 0 crisp grit, 1 fat blurry floc

varying float vBright;
varying float vFogDepth;
varying float vSunk;

${FOG_GLSL}

void main() {
  // Soft round sprite, computed instead of sampled.
  float d = length( gl_PointCoord - 0.5 ) * 2.0;
  float a = smoothstep( 1.0, 0.0, d );
  a *= mix( a, sqrt( a ), uSoft );   // murk floc has no hard edge at all
  a *= uOpacity * vBright * fogAttenuation( vFogDepth, uFogDensity );
  // What has already been pulled out stops scattering light.
  a *= 1.0 - 0.55 * clamp( vSunk, 0.0, 1.0 );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uColor, a );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createMotes ({ quality, rand }) {
  const n = quality.moteCount
  if (n <= 0) return null

  const position = new Float32Array(n * 3)
  const seed = new Float32Array(n)
  const bright = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    position[i * 3] = (rand() - 0.5) * 20
    position[i * 3 + 1] = -0.35 - rand() * 5.4
    position[i * 3 + 2] = -11 + rand() * 18
    seed[i] = rand()
    bright[i] = 0.25 + rand() * rand() * 0.8
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  geometry.setAttribute('aBright', new THREE.BufferAttribute(bright, 1))
  // Generous: the drain pushes motes several units below their seeded y.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -4, -2), 26)

  const uniforms = {
    uTime: { value: 0 },
    uProjScale: { value: 800 },
    uSize: { value: 0.045 },
    uColor: { value: new THREE.Color(0xbcd2e0) },
    uOpacity: { value: 0 },
    uFogDensity: { value: 0.019 },
    uDrain: { value: 0 },
    uSettle: { value: 0 },
    uStir: { value: 0 },
    uStirDir: { value: 1 },
    uSoft: { value: 0 }
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: MOTE_VERT,
    fragmentShader: MOTE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })

  const points = new THREE.Points(geometry, material)
  points.name = 'pond-motes'
  points.renderOrder = 3
  points.frustumCulled = false

  return { object: points, geometry, material, uniforms }
}

/* =========================================================================
   Bubbles
   ========================================================================= */

const BUBBLE_VERT = /* glsl */`
uniform float uProjScale;
uniform float uSize;

attribute float aSize;

varying float vFogDepth;

void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  vFogDepth = - mv.z;
  gl_PointSize = clamp( uSize * aSize * uProjScale / max( - mv.z, 0.1 ), 1.5, 54.0 );
  gl_Position = projectionMatrix * mv;
}
`

const BUBBLE_FRAG = /* glsl */`
uniform vec3  uColor;
uniform float uOpacity;
uniform float uFogDensity;

varying float vFogDepth;

${FOG_GLSL}

void main() {
  float d = length( gl_PointCoord - 0.5 ) * 2.0;
  // A bubble is a thin lens: bright rim, nearly empty middle.
  float disc = smoothstep( 1.0, 0.84, d );
  float rim = smoothstep( 0.45, 0.98, d );
  float a = disc * ( 0.14 + 0.86 * rim );
  a *= uOpacity * fogAttenuation( vFogDepth, uFogDensity );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uColor, a );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createBubbles ({ quality, rand }) {
  const n = quality.bubbleCount
  if (n <= 0) return null

  const position = new Float32Array(n * 3)
  const sizes = new Float32Array(n)
  const rise = new Float32Array(n)
  const wobble = new Float32Array(n)
  const phase = new Float32Array(n)

  function seedOne (i, randomY) {
    position[i * 3] = (rand() - 0.5) * 6.5
    position[i * 3 + 1] = randomY ? -5.4 + rand() * 5.4 : -5.4 - rand() * 0.8
    position[i * 3 + 2] = -5.5 + rand() * 9.0
    sizes[i] = 0.35 + rand() * rand() * 1.6
    rise[i] = 0.22 + rand() * 0.52
    wobble[i] = 0.1 + rand() * 0.25
    phase[i] = rand() * 6.2831853
  }
  for (let i = 0; i < n; i++) seedOne(i, true)

  const geometry = new THREE.BufferGeometry()
  const posAttr = new THREE.BufferAttribute(position, 3)
  posAttr.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', posAttr)
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -2.6, -1), 12)

  const uniforms = {
    uProjScale: { value: 800 },
    uSize: { value: 0.035 },
    uColor: { value: new THREE.Color(0xd8ecf6) },
    uOpacity: { value: 0 },
    uFogDensity: { value: 0.019 }
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: BUBBLE_VERT,
    fragmentShader: BUBBLE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })

  const points = new THREE.Points(geometry, material)
  points.name = 'pond-bubbles'
  points.renderOrder = 4
  points.frustumCulled = false

  /** `live` scales how briskly the column rises — sluggish in the murk, fizzing
      by the time the koi are back. */
  function step (t, dt, live) {
    for (let i = 0; i < n; i++) {
      const iy = i * 3 + 1
      position[iy] += rise[i] * dt * live
      // Bubbles do not rise straight; they slalom.
      position[i * 3] += Math.sin(t * 1.6 + phase[i]) * wobble[i] * dt * live
      if (position[iy] > 0.15) seedOne(i, false)
    }
    posAttr.needsUpdate = true
  }

  return { object: points, geometry, material, uniforms, step }
}

/* =========================================================================
   Light shafts
   ========================================================================= */

const SHAFT_VERT = /* glsl */`
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
varying float vFogDepth;

void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vWorld = wp.xyz;
  vNormalW = normalize( mat3( modelMatrix ) * normal );
  vec4 mv = viewMatrix * wp;
  vFogDepth = - mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const SHAFT_FRAG = /* glsl */`
uniform float uTime;
uniform vec3  uColor;
uniform float uOpacity;
uniform vec3  uCamPos;
uniform float uFogDensity;

varying vec3 vWorld;
varying vec3 vNormalW;
varying vec2 vUv;
varying float vFogDepth;

${FOG_GLSL}

void main() {
  vec3 V = normalize( uCamPos - vWorld );

  /* The shaft is an open cone shell drawn additively, so front and back faces
     both contribute. Looking through the middle of the cone traverses the most
     "medium", and that is exactly where the shell faces the camera head-on,
     so |N.V| is a serviceable stand-in for optical path length. */
  float body = pow( abs( dot( vNormalW, V ) ), 0.8 );

  // uv.y runs 0 at the bottom to 1 at the top: brightest just under the skin,
  // but rolled off at the very top so the open rim is not a hard disc edge.
  float vertical = pow( clamp( vUv.y, 0.0, 1.0 ), 1.3 );
  vertical *= 1.0 - 0.6 * smoothstep( 0.9, 1.0, vUv.y );

  // Slow rotation of brightness around the cone keeps it alive.
  float shimmer = 0.76 + 0.24 * sin( vUv.x * 18.8 + uTime * 0.7 );

  float a = body * vertical * shimmer * uOpacity;
  // Do not let a shaft smear across the lens when we drift inside one.
  a *= smoothstep( 0.35, 1.9, length( uCamPos - vWorld ) );
  a *= fogAttenuation( vFogDepth, uFogDensity );
  if ( a < 0.004 ) discard;

  gl_FragColor = vec4( uColor, a );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createShafts ({ quality, rand }) {
  const n = quality.shaftCount
  if (n <= 0) return null

  const group = new THREE.Group()
  group.name = 'pond-shafts'
  const uniforms = {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x8fb6cf) },
    uOpacity: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uFogDensity: { value: 0.019 }
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  })

  // Enough radial segments that the shell reads as a soft column rather than
  // a faceted prism — it costs vertices, which are not the bottleneck here.
  const radial = quality.tier === 'low' ? 8 : 11
  const geometry = new THREE.CylinderGeometry(0.30, 0.95, 6.4, radial, 1, true)
  // Origin at the top of the cone so y = 0 sits at the water line.
  geometry.translate(0, -3.2, 0)

  const shafts = []
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(geometry, material)
    const a = (i / n) * Math.PI * 2 + rand() * 0.6
    const r = 1.2 + rand() * 4.4
    mesh.position.set(Math.cos(a) * r, 0.05, -2 + Math.sin(a) * r)
    const spread = 0.8 + rand() * 0.9
    mesh.scale.set(spread, 0.8 + rand() * 0.5, spread)
    // Lean the shaft slightly, as if refracted off-axis.
    mesh.rotation.z = (rand() - 0.5) * 0.3
    mesh.rotation.x = (rand() - 0.5) * 0.3
    mesh.renderOrder = 2
    mesh.frustumCulled = false
    mesh.userData.spread = spread
    group.add(mesh)
    shafts.push(mesh)
  }

  return { object: group, geometry, material, uniforms, shafts }
}

/* =========================================================================
   Public surface
   ========================================================================= */

/* Particulate colour: pale moon-silver on a clean night, green-brown sludge in
   the murk, warm gold once dawn light is coming through the surface. */
const MOTE_CLEAN = new THREE.Color(0xbcd2e0)
const MOTE_MURK = new THREE.Color(0x8d8f4e)
const MOTE_DAWN = new THREE.Color(0xe6cb9c)

const SHAFT_CLEAN = new THREE.Color(0x8fb6cf)
const SHAFT_MURK = new THREE.Color(0x5e7d4f)
const SHAFT_DAWN = new THREE.Color(0xf2d49a)

const BUBBLE_CLEAN = new THREE.Color(0xd8ecf6)
const BUBBLE_DAWN = new THREE.Color(0xf6e3c2)

export function createParticles ({ quality }) {
  const rand = mulberry32(0x9e37)
  const group = new THREE.Group()
  group.name = 'pond-particles'

  const motes = createMotes({ quality, rand })
  const bubbles = createBubbles({ quality, rand })
  const shafts = createShafts({ quality, rand })

  for (const part of [motes, bubbles, shafts]) {
    if (part) group.add(part.object)
  }

  // Eased copies of the story fields. The mood bundle is already continuous,
  // but easing here keeps a jumped scroll (anchor link, restored position)
  // from snapping the silt load.
  const eased = { silt: 0, drain: 0, settle: 0, clarity: 0.55, cold: 0, dawn: 0, stir: 0, stirDir: 1 }
  let primed = false

  function approach (from, to, rate, dt) {
    return from + (to - from) * (1 - Math.exp(-rate * dt))
  }

  /**
   * `projScale` converts a world-space radius into pixels at one unit of
   * depth: half the drawing-buffer height divided by tan(fov / 2).
   */
  function update (t, dt, stage, projScale) {
    const s = stage.submergence
    const fogDensity = stage.scene.fog.density
    // Reduced motion gets a frozen clock: a composed still, not a loop.
    const at = quality.reduced ? 12.5 : t

    const m = stage.mood
    if (m) {
      // Snap to the story on the first real frame, ease from then on.
      const rate = primed ? 2.8 : 1e6
      if (dt > 0) primed = true
      const silt = clamp01(m.silt)
      const settle = clamp01(m.settle)
      eased.silt = approach(eased.silt, silt, rate, dt)
      eased.settle = approach(eased.settle, settle, rate, dt)
      // Drain is a pure function of the story, so scrolling back up un-drains.
      eased.drain = approach(eased.drain, settle * (1 - silt), rate, dt)
      eased.clarity = approach(eased.clarity, clamp01(m.clarity), rate, dt)
      eased.cold = approach(eased.cold, clamp01(m.coldFactor), rate, dt)
      eased.dawn = approach(eased.dawn, clamp01(m.dawnFactor), rate, dt)
    }

    /* Live scroll INPUT, not story position: the particulate reacts to being
       scrolled and settles again when the viewer stops. Fast attack, slow
       release, so a flick stirs the water and a pause lets it calm. */
    const scroll = stage.scroll
    const speed = scroll ? clamp01(scroll.speed) : 0
    eased.stir = approach(eased.stir, quality.reduced ? 0 : speed, eased.stir < speed ? 6.5 : 1.7, dt)
    if (scroll && scroll.direction) eased.stirDir = scroll.direction

    if (motes) {
      const u = motes.uniforms
      u.uTime.value = at
      u.uProjScale.value = projScale
      u.uFogDensity.value = fogDensity
      u.uDrain.value = eased.drain
      u.uSettle.value = quality.reduced ? 0 : eased.settle
      u.uStir.value = eased.stir
      u.uStirDir.value = eased.stirDir
      // Silt is invisible in air; it fades up as the lens goes under, then the
      // story decides how much of it there is to see. Stirring kicks a little
      // more of it into the light.
      u.uOpacity.value = s * (0.06 + 0.72 * eased.silt) * (1 + 0.14 * eased.stir)
      // Murk floc is fatter, softer and dirtier than clean-water dust.
      u.uSize.value = 0.038 + 0.034 * eased.silt
      u.uSoft.value = eased.silt
      u.uColor.value.copy(MOTE_CLEAN).lerp(MOTE_MURK, eased.silt * (0.5 + 0.5 * eased.cold)).lerp(MOTE_DAWN, eased.dawn)
    }

    if (bubbles) {
      const u = bubbles.uniforms
      u.uProjScale.value = projScale
      u.uFogDensity.value = fogDensity
      // A burst right at the surface break, then a steady stream below. Clear
      // water lets the column read; silt swallows it.
      u.uOpacity.value = s * (0.20 + 0.42 * eased.clarity) + 0.55 * stage.crossing
      u.uColor.value.copy(BUBBLE_CLEAN).lerp(BUBBLE_DAWN, eased.dawn)
      if (dt > 0 && !quality.reduced) {
        // Sluggish in the sludge, fizzing once the koi are back. A hard scroll
        // hurries the column along with it.
        bubbles.step(t, dt, 0.45 + 0.85 * eased.clarity + 0.45 * eased.dawn + 0.3 * eased.stir)
      }
    }

    if (shafts) {
      const u = shafts.uniforms
      u.uTime.value = at
      u.uFogDensity.value = fogDensity
      u.uCamPos.value.copy(stage.camera.position)
      // God-rays need water to travel through: nearly nothing in the murk,
      // then they strengthen as it clears and bloom into dawn.
      u.uOpacity.value = s * (0.045 + 0.20 * eased.clarity) * (0.85 + 0.85 * eased.dawn)
      u.uColor.value.copy(SHAFT_CLEAN).lerp(SHAFT_MURK, eased.cold).lerp(SHAFT_DAWN, eased.dawn)
      // Dawn light comes in steeper and wider than lantern light does.
      const widen = 1 + 0.22 * eased.dawn
      for (let i = 0; i < shafts.shafts.length; i++) {
        const mesh = shafts.shafts[i]
        const sp = mesh.userData.spread * widen
        mesh.scale.x = sp
        mesh.scale.z = sp
      }
    }
  }

  function dispose () {
    group.clear()
    for (const part of [motes, bubbles, shafts]) {
      if (!part) continue
      part.geometry.dispose()
      part.material.dispose()
    }
  }

  return { group, update, dispose }
}

export { PALETTE }
