import * as THREE from 'three'
import { PALETTE } from './palette.js'
import { LANTERNS, FLOOR_Y } from './scene.js'
import { CAUSTIC_GLSL, surfaceHeight, surfaceGradient } from './water.js'

/**
 * environment.js — everything that makes the scene read as "a pond at night":
 * the basin + bank (one mesh), instanced pebbles, leaf litter and sunken junk,
 * submerged plant stems, lily pads that ride the real wave field, and the
 * lantern posts with their glows.
 *
 * The basin doubles as the shore: a flat silt bottom out to r = 6.5 that then
 * rises to +0.45 by r = 13, so the waterline lands at about r = 12.7 and
 * anything past that is dry bank. Low-frequency bumps break up the cone and
 * give the shoreline an irregular edge.
 *
 * WHAT THE FLOOR IS
 * -----------------
 * A pond bottom is near-black: wet silt, rotted leaf litter, algae-slicked
 * stones and the rubber liner showing at the rim. It is deliberately the
 * QUIETEST thing in frame — the koi and the lanterns are the subjects, so the
 * floor must never out-brighten them. All of it is procedural: a tileable
 * four-channel noise texture, baked once at boot, carries the silt mottling,
 * the litter drifts and the algae patches, and the caustics are sparse
 * filaments rather than a wash.
 *
 * STORY (see the mood contract at the top of three/index.js)
 * ---------------------------------------------------------
 *   algae        green slime on stones, liner and shallows. Peaks in `murk`,
 *                visibly recedes across `clean`, gone by `return`.
 *   debris       leaf litter + sunken junk. Present in `murk`, shrinks and
 *                sinks away across `clean` — removing muck is the product.
 *   clarity      how much caustic light reaches the floor at all.
 *   fogDensity   further damps the caustics when the water is thick.
 *   coldFactor   drains the floor toward flat green-grey in the murk.
 *   dawnFactor   rakes warm light across the silt and warms the caustics.
 */

const GROUND_SIZE = 58
const FLAT_RADIUS = 6.5
const RIM_RADIUS = 13
const RIM_HEIGHT = 0.45
/** Radius where ground height crosses y = 0 (the nominal waterline). */
export const WATERLINE_RADIUS = 12.7

/** Gentle relief so the basin is not a perfect cone. */
function groundBump (x, z) {
  return (
    0.18 * Math.sin(x * 0.7) * Math.cos(z * 0.55) +
    0.07 * Math.sin(x * 1.9 + 1.3) * Math.sin(z * 2.1) +
    // A long, lazy swell so the far bank does not silhouette as a ruler line.
    0.13 * Math.sin(x * 0.33 + 2.2) * Math.cos(z * 0.27 - 1.1)
  )
}

/** Ground height at a world (x, z). Shared by pebbles and lantern posts. */
export function groundHeight (x, z) {
  const r = Math.sqrt(x * x + z * z)
  let y
  if (r <= FLAT_RADIUS) {
    y = FLOOR_Y
  } else {
    const u = Math.min(1, (r - FLAT_RADIUS) / (RIM_RADIUS - FLAT_RADIUS))
    y = FLOOR_Y + (RIM_HEIGHT - FLOOR_Y) * Math.pow(u, 1.35)
    if (r > RIM_RADIUS) y += (r - RIM_RADIUS) * 0.05
  }
  return y + groundBump(x, z)
}

/* Small seeded RNG so the layout is identical on every load (and between the
   CPU-side pebble placement and anything a human later wants to reproduce). */
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

/* -------------------------------------------------------------------------
   Shared GLSL: a cheap hash-based value noise, used by the small props (lily
   pads, stones, stems) where it covers very little fill.

   The BASIN does not use it. The floor is the biggest fragment bill in the
   scene — a four-field fbm there costs ~50 hashes per pixel and drops software
   rendering by an order of magnitude — so its mottling is baked once into a
   tileable RGBA texture (makeFloorTexture) and read back with two fetches.
   ------------------------------------------------------------------------- */
const NOISE_GLSL = /* glsl */`
#define ENV_TAU 6.283185307179586
float envHash21( vec2 p ) {
	vec3 p3 = fract( p.xyx * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
float envNoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	float a = envHash21( i );
	float b = envHash21( i + vec2( 1.0, 0.0 ) );
	float c = envHash21( i + vec2( 0.0, 1.0 ) );
	float d = envHash21( i + vec2( 1.0, 1.0 ) );
	return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
`

/* ---- the baked floor mottle ------------------------------------------------
   R  broad silt variation        G  fine grain
   B  rotted leaf-litter drifts   A  algae patches
   Every field is periodic on its own lattice, so the texture tiles seamlessly
   and nothing has to be evaluated per fragment at run time.                 */

/** Integer lattice hash. `gx`,`gy` wrap at `period` so the tile's edges agree.
    Hoisted out of periodicNoise deliberately: as a closure it was allocated
    twelve times per baked pixel and dominated the whole bake. */
function latticeHash (gx, gy, period, seed) {
  const a = ((gx % period) + period) % period
  const b = ((gy % period) + period) % period
  let n = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 1274126177)) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

/** Periodic 2D value noise. `u`,`v` in [0,1); the lattice wraps at `period`. */
function periodicNoise (u, v, period, seed) {
  const x = u * period
  const y = v * period
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let fx = x - ix
  let fy = y - iy
  fx = fx * fx * (3 - 2 * fx)
  fy = fy * fy * (3 - 2 * fy)
  const n00 = latticeHash(ix, iy, period, seed)
  const n10 = latticeHash(ix + 1, iy, period, seed)
  const n01 = latticeHash(ix, iy + 1, period, seed)
  const n11 = latticeHash(ix + 1, iy + 1, period, seed)
  const top = n00 + (n10 - n00) * fx
  return top + (n01 + (n11 - n01) * fx - top) * fy
}

function periodicFbm (u, v, period, seed) {
  return (
    0.62 * periodicNoise(u, v, period, seed) +
    0.26 * periodicNoise(u, v, period * 2, seed + 101) +
    0.12 * periodicNoise(u, v, period * 4, seed + 211)
  )
}

/** Build the tileable silt/litter/algae mottle. `size` must be a power of two. */
function makeFloorTexture (size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const d = img.data
  const inv = 1 / size
  for (let y = 0; y < size; y++) {
    const v = y * inv
    for (let x = 0; x < size; x++) {
      const u = x * inv
      const i = (y * size + x) * 4
      d[i] = periodicFbm(u, v, 2, 17) * 255
      d[i + 1] = periodicFbm(u, v, 7, 53) * 255
      d[i + 2] = periodicFbm(u, v, 3, 91) * 255
      d[i + 3] = periodicFbm(u, v, 4, 137) * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.NoColorSpace // this is data, not colour
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  return tex
}

/** 64x64 radial-gradient sprite, shared by all three lantern glows. */
function makeGlowTexture () {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0.0, 'rgba(255, 236, 190, 1)')
  grad.addColorStop(0.22, 'rgba(232, 200, 121, 0.72)')
  grad.addColorStop(0.55, 'rgba(216, 169, 74, 0.22)')
  grad.addColorStop(1.0, 'rgba(216, 169, 74, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  return tex
}

/* Caustic colour endpoints. The night value is warm brass, not silver: these
   filaments are lantern light focused by the ripples, so they have to belong to
   the same light the posts are casting. Sick green under the murk, warm gold
   once dawn light starts coming through the surface. */
const CAUSTIC_NIGHT = new THREE.Color(0xa9a079)
const CAUSTIC_COLD = new THREE.Color(0x4e7a52)
/* Dawn caustics used to be hot gold (0xe2b474 at 1.5x the night power), which
   is what made the morning beat read as a lit swimming pool: the floor out-
   shone the surface, so the surface stopped looking like a surface at all.
   Morning light reaching a pond bottom is warm but WEAK — it has crossed the
   skin of the water at a shallow angle and lost most of itself doing it. */
const CAUSTIC_DAWN = new THREE.Color(0xc7a478)
/* Algae goes from a thin dark film to thick sickly scum. Both are far darker
   than they feel like they should be: a slimed pond floor is olive-black, and
   the lantern point lights are strong enough that anything brighter turns the
   basin into a lawn and steals the frame from the koi. */
const ALGAE_THIN = new THREE.Color(0x1b2712)
const ALGAE_THICK = new THREE.Color(0x3f5520)

export function createEnvironment ({ quality }) {
  const group = new THREE.Group()
  group.name = 'pond-environment'
  const rand = mulberry32(0x4b01)
  const disposables = []
  const tier = quality.tier

  /* ------------------------- shared story uniforms ------------------------- */
  // One object, Object.assign'd into every material's shader. Driving the whole
  // environment from ~8 floats means the per-frame cost of the story is nil.
  const mood = {
    uTime: { value: 0 },
    uAlgae: { value: 0 },
    uDebris: { value: 0 },
    uCold: { value: 0 },
    uDawn: { value: 0 },
    uAlgaeColor: { value: new THREE.Color().copy(ALGAE_THIN) },
    uCausticColor: { value: new THREE.Color().copy(CAUSTIC_NIGHT) },
    uCausticPower: { value: 0.4 },
    uDawnColor: { value: new THREE.Color(0xc08c4a) },
    // Night sheen on the lily pads. A pad is waxy and catches the sky even
    // when no lantern is on it; without this they read as holes punched in the
    // water rather than as leaves floating on it.
    uPadSheen: { value: new THREE.Color(0x0a1016) },
    uSway: { value: 1 }
  }

  /* ------------------------------ the basin ------------------------------ */
  const groundSeg = tier === 'low' ? 44 : tier === 'mid' ? 72 : 96
  const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, groundSeg, groundSeg)
  groundGeo.rotateX(-Math.PI / 2)
  {
    const pos = groundGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)))
    }
    pos.needsUpdate = true
    groundGeo.computeVertexNormals()
  }

  // 128 costs ~10ms to bake, 256 ~40ms. The mottle is deliberately soft, so
  // phones and small laptops lose nothing they could see anyway.
  const floorTex = makeFloorTexture(tier === 'high' ? 256 : 128)
  disposables.push(floorTex)

  const groundUniforms = {
    uFloorTex: { value: floorTex },
    uLanternXZ: { value: LANTERNS.map((l) => new THREE.Vector2(l.pos.x, l.pos.z)) },
    uSiltDark: { value: new THREE.Color(0x070c0b) },
    uSiltWarm: { value: new THREE.Color(0x19200f) },
    uLitterColor: { value: new THREE.Color(0x3b2a14) },
    uBankColor: { value: new THREE.Color(0x1e2317) },
    uBankDark: { value: new THREE.Color(0x0d1009) },
    uLinerColor: { value: new THREE.Color(0x06080a) }
  }

  // The material colour is irrelevant — the shader writes diffuseColor outright
  // — but keep it dark so a failed compile degrades to silt, not to sand.
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0d1412,
    roughness: 0.94,
    metalness: 0.0
  })

  groundMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mood, groundUniforms)

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;')
      // The ground mesh is never transformed, so local space == world space.
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGroundPos = transformed;')

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
#define LANTERN_COUNT ${LANTERNS.length}
varying vec3 vGroundPos;
uniform float uTime;
uniform float uAlgae;
uniform float uDebris;
uniform float uCold;
uniform float uDawn;
uniform vec3 uAlgaeColor;
uniform vec3 uCausticColor;
uniform float uCausticPower;
uniform vec3 uDawnColor;
uniform vec2 uLanternXZ[ LANTERN_COUNT ];
uniform sampler2D uFloorTex;
uniform vec3 uSiltDark;
uniform vec3 uSiltWarm;
uniform vec3 uLitterColor;
uniform vec3 uBankColor;
uniform vec3 uBankDark;
uniform vec3 uLinerColor;
#define ENV_TAU 6.283185307179586
${CAUSTIC_GLSL}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	{
		float r = length( vGroundPos.xz );
		float below = - vGroundPos.y;                    // how far under the waterline
		float wet = smoothstep( -0.08, 0.45, below );

		/* Two fetches of the baked mottle at different tilings: the near one
		   carries grain and algae, the far one the broad relief and the litter
		   drifts. Two periods that do not share a factor hide the repeat. */
		vec4 nearN = texture2D( uFloorTex, vGroundPos.xz * 0.0565 );
		vec4 farN = texture2D( uFloorTex, vGroundPos.xz * 0.0191 + 0.37 );

		float grain = nearN.g;
		float broad = mix( farN.r, nearN.r, 0.35 );

		// Wet silt: near-black, faintly olive, mottled with settled organics.
		vec3 silt = mix( uSiltDark, uSiltWarm, smoothstep( 0.34, 0.88, broad ) );
		silt *= 0.66 + 0.68 * grain;

		// Rotted leaf litter, drifted into the low spots. Goes with the debris.
		float litter = smoothstep( 0.46, 0.88, farN.b );
		silt = mix( silt, uLitterColor * ( 0.5 + 0.85 * grain ), litter * uDebris * 0.85 );

		// Dry bank: damp earth and moss. Never sand.
		vec3 bank = mix( uBankDark, uBankColor, broad * 0.7 + 0.3 * grain );

		vec3 base = mix( bank, silt, wet );

		// The rubber liner, exposed in a band around the pond edge.
		float liner = smoothstep( 1.7, 0.30, abs( r - 12.05 ) );
		base = mix( base, uLinerColor, liner * 0.85 );

		// Algae: slime over the shallows, the liner and the rim.
		float slime = smoothstep( 0.30, 0.72, nearN.a ) * uAlgae;
		slime *= mix( 0.22, 1.0, smoothstep( 2.5, 9.5, r ) );
		slime *= mix( wet, 0.5, liner );
		slime = clamp( slime, 0.0, 1.0 );
		base = mix( base, uAlgaeColor * ( 0.5 + 0.7 * grain ), slime * 0.85 );

		// Cold murk flattens the floor out.
		base *= mix( 1.0, 0.72, uCold );
		/* Dawn light. The job here is to lift the far BANK out of silhouette so
		   the morning beat does not read as night; the submerged bed wants
		   almost none of it. Raking the whole basin evenly (which is what this
		   did) turned the floor into the brightest thing in the frame at the
		   one beat where the water surface has to carry the shot. */
		base += uDawnColor * ( uDawn * ( 0.026 + 0.050 * grain ) * mix( 1.0, 0.22, wet ) );

		diffuseColor.rgb = base;

		// Wet silt and algae are both glossy; dry bank is not.
		roughnessFactor = mix( roughnessFactor, 0.46, wet * 0.5 );
		roughnessFactor = mix( roughnessFactor, 0.24, slime );

		/* Caustics are focused lantern light, injected as emissive so the basin
		   still takes real lighting. causticPattern() only resolves into
		   filaments when its domain sits far from the origin (the shadertoy it
		   comes from feeds it p - 250.0); hand it a tiled, offset domain or it
		   saturates to a flat wash and the pond floor turns into a sand dune. */
		float deepFade = 1.0 - 0.45 * smoothstep( 1.5, 6.5, below );
		float lantern = 0.0;
		for ( int i = 0; i < LANTERN_COUNT; i ++ ) {
			vec2 d = vGroundPos.xz - uLanternXZ[ i ];
			lantern += 1.0 / ( 1.0 + 0.02 * dot( d, d ) );
		}
		lantern = clamp( lantern, 0.0, 1.4 );

		/* Physically the shallows focus the brightest caustics, but a glowing
		   far rim turns the basin into a wall at eye level — so hold the light
		   over the bed and let the liner band and the rim stones carry the
		   edge instead. */
		float rimFade = 1.0 - smoothstep( 9.5, 14.5, r );

		vec2 cp = mod( vGroundPos.xz * ( 0.30 * ENV_TAU ), ENV_TAU ) - 250.0;
		float c = causticPattern( cp, uTime * 0.42 );
		totalEmissiveRadiance += uCausticColor * ( c * uCausticPower * wet * deepFade * lantern * rimFade );
	}`)
  }
  // Every ground material compiles to the same program, so share the cache key.
  groundMat.customProgramCacheKey = () => 'pond-ground-silt'

  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.name = 'pond-basin'
  ground.frustumCulled = false
  group.add(ground)
  disposables.push(groundGeo, groundMat)

  /* ------------------------------ pebbles ------------------------------ */
  // Three bands: gravel across the bed, cobbles through the mid slope, and a
  // ring of bigger stones at the rim that reads as the edge of the pond.
  let pebbles = null
  if (quality.pebbleCount > 0) {
    const pebbleGeo = new THREE.IcosahedronGeometry(1, 0)
    const pebbleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // carried per-instance by instanceColor
      roughness: 0.88,
      metalness: 0.02,
      flatShading: true
    })
    pebbleMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mood)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vStonePos;\nvarying vec3 vStoneNormal;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
	vec4 envStoneW = modelMatrix * instanceMatrix * vec4( transformed, 1.0 );
	vStonePos = envStoneW.xyz;
	vStoneNormal = normalize( mat3( instanceMatrix ) * normal );`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vStonePos;
varying vec3 vStoneNormal;
uniform float uAlgae;
uniform float uCold;
uniform float uDawn;
uniform vec3 uAlgaeColor;
${NOISE_GLSL}`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	{
		float up = clamp( vStoneNormal.y, 0.0, 1.0 );
		float wet = smoothstep( -0.1, 0.5, - vStonePos.y );
		float n = envNoise( vStonePos.xz * 2.6 + vStonePos.y * 3.1 );
		// Slime grows on the tops of stones, not their undersides.
		float slime = clamp( uAlgae * wet * smoothstep( 0.10, 0.80, up ) * ( 0.45 + 0.6 * n ), 0.0, 1.0 );
		diffuseColor.rgb = mix( diffuseColor.rgb, uAlgaeColor * ( 0.5 + 0.8 * n ), slime * 0.9 );
		roughnessFactor = mix( roughnessFactor, 0.2, slime );
		diffuseColor.rgb *= mix( 1.0, 0.78, uCold );
		diffuseColor.rgb *= 1.0 + 0.18 * uDawn * up;
	}`)
    }
    pebbleMat.customProgramCacheKey = () => 'pond-pebble-algae'

    pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, quality.pebbleCount)
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    const col = new THREE.Color()
    for (let i = 0; i < quality.pebbleCount; i++) {
      const band = i / quality.pebbleCount
      let r
      let size
      if (band < 0.55) {
        // gravel over the flat bed
        r = 0.8 + Math.sqrt(rand()) * 6.2
        size = 0.06 + rand() * rand() * 0.18
      } else if (band < 0.82) {
        // cobbles on the slope
        r = 6.0 + rand() * 4.6
        size = 0.12 + rand() * rand() * 0.34
      } else {
        // the rim ring: bigger stones holding the liner down
        r = 11.1 + rand() * 1.9
        size = 0.26 + rand() * rand() * 0.52
      }
      const a = rand() * Math.PI * 2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      p.set(x, groundHeight(x, z) + size * 0.28, z)
      e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28)
      q.setFromEuler(e)
      s.set(size * (0.85 + rand() * 0.55), size * (0.5 + rand() * 0.3), size * (0.85 + rand() * 0.55))
      m.compose(p, q, s)
      pebbles.setMatrixAt(i, m)
      // Wet river stone: cool slate, warmed a little at random.
      const v = 0.10 + rand() * rand() * 0.16
      col.setRGB(v * (0.85 + rand() * 0.5), v * (0.95 + rand() * 0.2), v * (1.0 + rand() * 0.25))
      pebbles.setColorAt(i, col)
    }
    pebbles.instanceMatrix.needsUpdate = true
    if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true
    pebbles.frustumCulled = false
    pebbles.name = 'pond-pebbles'
    group.add(pebbles)
    disposables.push(pebbleGeo, pebbleMat)
  }

  /* --------------------------- debris: the muck --------------------------- */
  // Leaf litter and sunken junk. Both shrink toward nothing and sink into the
  // silt as `uDebris` falls, which is what the `clean` chapter is selling.
  // The shrink happens in the vertex shader — each piece collapses toward its
  // own origin, which sits in the silt — so clearing the pond costs one uniform
  // write per frame and zero matrix rebuilds. Once nothing is left the two
  // meshes stop being submitted at all.
  const DEBRIS_VERT_PATCH = /* glsl */`#include <begin_vertex>
	transformed *= max( uDebris, 0.0001 );`

  function makeDebrisMaterial (color, roughness, key) {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: 0.0,
      side: THREE.DoubleSide,
      flatShading: true
    })
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mood)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uDebris;\nvarying vec3 vJunkPos;')
        .replace('#include <begin_vertex>', `${DEBRIS_VERT_PATCH}
	vJunkPos = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vJunkPos;
uniform float uAlgae;
uniform float uCold;
uniform vec3 uAlgaeColor;
${NOISE_GLSL}`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	{
		float n = envNoise( vJunkPos.xz * 3.4 + vJunkPos.y );
		diffuseColor.rgb *= 0.55 + 0.9 * n;
		diffuseColor.rgb = mix( diffuseColor.rgb, uAlgaeColor * 0.8, uAlgae * 0.45 * n );
		diffuseColor.rgb *= mix( 1.0, 0.75, uCold );
	}`)
    }
    mat.customProgramCacheKey = () => key
    return mat
  }

  const debrisMeshes = []
  const leafCount = tier === 'low' ? 24 : tier === 'mid' ? 52 : 88
  const junkCount = tier === 'low' ? 5 : tier === 'mid' ? 9 : 14

  {
    // Leaves: irregular little discs lying flat in the silt.
    const leafGeo = new THREE.CircleGeometry(1, 5)
    leafGeo.rotateX(-Math.PI / 2)
    const leafMat = makeDebrisMaterial(0x4a3317, 0.9, 'pond-debris-leaf')
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount)
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    for (let i = 0; i < leafCount; i++) {
      const r = 0.8 + Math.sqrt(rand()) * 10.5
      const a = rand() * Math.PI * 2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const size = 0.13 + rand() * 0.22
      p.set(x, groundHeight(x, z) + 0.015, z)
      e.set((rand() - 0.5) * 0.5, rand() * 6.28, (rand() - 0.5) * 0.5)
      q.setFromEuler(e)
      s.set(size * (0.8 + rand() * 0.6), size, size * (0.6 + rand() * 0.5))
      m.compose(p, q, s)
      leaves.setMatrixAt(i, m)
    }
    leaves.instanceMatrix.needsUpdate = true
    leaves.frustumCulled = false
    leaves.name = 'pond-leaf-litter'
    group.add(leaves)
    debrisMeshes.push(leaves)
    disposables.push(leafGeo, leafMat)
  }

  {
    // Sunken junk: one 6-sided prism, scaled into branches, cans and pots.
    const junkGeo = new THREE.CylinderGeometry(0.5, 0.42, 1, 6, 1, false)
    const junkMat = makeDebrisMaterial(0x2b2a22, 0.82, 'pond-debris-junk')
    const junk = new THREE.InstancedMesh(junkGeo, junkMat, junkCount)
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    for (let i = 0; i < junkCount; i++) {
      const r = 1.2 + Math.sqrt(rand()) * 9.0
      const a = rand() * Math.PI * 2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const branch = rand() < 0.55
      const size = branch ? 0.09 + rand() * 0.07 : 0.18 + rand() * 0.2
      const len = branch ? 1.4 + rand() * 2.6 : 0.6 + rand() * 0.7
      p.set(x, groundHeight(x, z) + size * 0.5, z)
      // Branches lie down; pots and cans sit upright but tipped.
      e.set(branch ? Math.PI / 2 + (rand() - 0.5) * 0.35 : (rand() - 0.5) * 0.7, rand() * 6.28, (rand() - 0.5) * 0.5)
      q.setFromEuler(e)
      s.set(size, size * len * (branch ? 6.5 : 3.0), size)
      m.compose(p, q, s)
      junk.setMatrixAt(i, m)
    }
    junk.instanceMatrix.needsUpdate = true
    junk.frustumCulled = false
    junk.name = 'pond-sunken-junk'
    group.add(junk)
    debrisMeshes.push(junk)
    disposables.push(junkGeo, junkMat)
  }

  /* -------------------------- submerged plant stems -------------------------- */
  // Thin ribbons rooted in the slope, swaying in the vertex shader. They give
  // the mid-ground an organic silhouette so the basin is not a bare bowl.
  {
    const stemCount = quality.reduced ? (tier === 'low' ? 8 : 18) : tier === 'low' ? 12 : tier === 'mid' ? 24 : 40
    const stemGeo = new THREE.PlaneGeometry(0.085, 1, 1, 4)
    stemGeo.translate(0, 0.5, 0)
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x1b2d19,
      roughness: 0.78,
      metalness: 0.0,
      side: THREE.DoubleSide
    })
    stemMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mood)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSway;\nvarying vec3 vStemPos;\nvarying float vStemUp;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
	float envStemPhase = instanceMatrix[ 3 ].x * 1.7 + instanceMatrix[ 3 ].z * 2.3;
	float envStemUp = clamp( transformed.y, 0.0, 1.0 );
	float envBend = pow( envStemUp, 1.7 ) * uSway;
	transformed.x += 0.17 * envBend * sin( uTime * 0.6 + envStemPhase );
	transformed.z += 0.13 * envBend * sin( uTime * 0.47 + envStemPhase * 1.6 );
	vStemUp = envStemUp;
	vStemPos = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vStemPos;
varying float vStemUp;
uniform float uAlgae;
uniform float uCold;
uniform float uDawn;
uniform vec3 uAlgaeColor;
${NOISE_GLSL}`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	{
		float n = envNoise( vec2( vStemPos.x * 3.0, vStemPos.y * 7.0 ) );
		// Darker and siltier at the base, fresher at the tip.
		diffuseColor.rgb *= 0.45 + 0.75 * vStemUp * ( 0.6 + 0.7 * n );
		diffuseColor.rgb = mix( diffuseColor.rgb, uAlgaeColor * 0.9, uAlgae * 0.5 );
		diffuseColor.rgb *= mix( 1.0, 0.7, uCold );
		diffuseColor.rgb *= 1.0 + 0.25 * uDawn * vStemUp;
	}`)
    }
    stemMat.customProgramCacheKey = () => 'pond-plant-stem'

    const stems = new THREE.InstancedMesh(stemGeo, stemMat, stemCount)
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    for (let i = 0; i < stemCount; i++) {
      const r = 3.6 + Math.sqrt(rand()) * 8.6
      const a = rand() * Math.PI * 2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const gy = groundHeight(x, z)
      // Keep the tips under the surface: a stem never pokes out of the water.
      const h = Math.max(0.8, Math.min(3.9, -gy * (0.45 + rand() * 0.42)))
      p.set(x, gy, z)
      e.set((rand() - 0.5) * 0.25, rand() * 6.28, (rand() - 0.5) * 0.25)
      q.setFromEuler(e)
      s.set(0.7 + rand() * 1.1, h, 1)
      m.compose(p, q, s)
      stems.setMatrixAt(i, m)
    }
    stems.instanceMatrix.needsUpdate = true
    stems.frustumCulled = false
    stems.name = 'pond-plant-stems'
    group.add(stems)
    disposables.push(stemGeo, stemMat)
  }

  /* ----------------------------- lily pads ----------------------------- */
  // A circle with a wedge removed is exactly a lily-pad silhouette. Doming the
  // disc and curling the rim is what stops it reading as a flat black blob:
  // the dome catches lantern light, the rim catches the sky.
  const lilySeg = tier === 'low' ? 18 : 30
  const LILY_CLEFT = 0.30 // half-angle of the wedge cut out of the disc
  /* RingGeometry, not CircleGeometry: a circle is a triangle FAN — one centre
     vertex and a single ring — so every "dome" displacement collapsed to a
     flat cone and the pads shaded as one unbroken value. Real radial rings are
     what let the saucer curl, and the curl is what catches the sky. */
  const lilyGeo = new THREE.RingGeometry(
    0.014, 1, lilySeg, 4, LILY_CLEFT, Math.PI * 2 - LILY_CLEFT * 2
  )
  lilyGeo.rotateX(-Math.PI / 2)
  {
    const pos = lilyGeo.attributes.position
    // (radius 0..1, blade parameter 0..1) carried to the fragment shader. The
    // blade parameter is 0 at the two lips of the cleft and 1 on the midrib
    // opposite it, so veins spread evenly instead of crowding the notch — and
    // it survives the rim being pushed out of round below.
    const padAttr = new Float32Array(pos.count * 2)
    const span = Math.PI - LILY_CLEFT
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const rr = Math.min(1, Math.sqrt(x * x + z * z))
      // The cleft points toward +X, so the blade is symmetric about that axis.
      const u = clamp01((Math.abs(Math.atan2(z, x)) - LILY_CLEFT) / span)
      padAttr[i * 2] = rr
      padAttr[i * 2 + 1] = u

      // Nudge the outline out of round. A perfect circle is the single biggest
      // tell that a pad is a primitive rather than a leaf.
      const wobble = 1 + rr * (0.055 * Math.sin(u * 7.1 + 0.9) + 0.032 * Math.sin(u * 13.7))
      pos.setX(i, x * wobble)
      pos.setZ(i, z * wobble)

      // A shallow saucer: barely raised through the middle, then the outer
      // quarter curls up into a margin that stands proud of the water.
      const curl = clamp01((rr - 0.70) / 0.30)
      pos.setY(i, 0.055 * (1 - rr * rr) + 0.115 * curl * curl)
    }
    pos.needsUpdate = true
    lilyGeo.setAttribute('aPad', new THREE.BufferAttribute(padAttr, 2))
    lilyGeo.computeVertexNormals()
  }

  const lilyMat = new THREE.MeshStandardMaterial({
    color: 0x2d5134,
    roughness: 0.42,
    metalness: 0.0,
    side: THREE.DoubleSide
  })
  lilyMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mood)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aPad;\nvarying vec2 vPadRU;\nvarying vec2 vPadXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvPadRU = aPad;\n\tvPadXZ = position.xz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vPadRU;
varying vec2 vPadXZ;
uniform float uAlgae;
uniform float uCold;
uniform float uDawn;
uniform vec3 uAlgaeColor;
uniform vec3 uPadSheen;
${NOISE_GLSL}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	{
		float rr = clamp( vPadRU.x, 0.0, 1.0 );   // 0 hub .. 1 rim
		float u = clamp( vPadRU.y, 0.0, 1.0 );    // 0 cleft lip .. 1 midrib

		/* Veins. Eighteen primaries fanning out of the hub, plus a heavier
		   midrib on the axis of symmetry. Spacing is in BLADE space, so they
		   stay even across the notch instead of bunching up beside it. */
		float vf = abs( fract( u * 9.0 ) - 0.5 ) * 2.0;
		float vein = smoothstep( 0.74, 0.99, vf );
		vein = max( vein, 1.0 - smoothstep( 0.0, 0.05, 1.0 - u ) );   // midrib
		// Veins start at the hub and thin out before they reach the margin.
		vein *= smoothstep( 0.05, 0.42, rr ) * ( 1.0 - 0.45 * smoothstep( 0.86, 1.0, rr ) );
		// Fine cross-veining between the primaries, barely there.
		vein = max( vein, 0.30 * smoothstep( 0.55, 0.95, abs( sin( rr * 7.1 + u * 24.0 ) ) ) * smoothstep( 0.3, 0.8, rr ) );

		float blotch = envNoise( vPadXZ * 6.5 );
		vec3 blade = diffuseColor.rgb * ( 0.58 + 0.62 * blotch );
		blade *= 1.0 + 0.5 * vein;

		/* The margin. A pad's edge is its most legible feature from above: a
		   warm red-brown lip, with the blade darkening into a crease just
		   inside it. That dark-then-light pair is what reads as an EDGE rather
		   than as the end of a blob. */
		float margin = smoothstep( 0.88, 1.0, rr );
		float crease = smoothstep( 0.74, 0.88, rr ) * ( 1.0 - smoothstep( 0.88, 0.96, rr ) );
		blade *= 1.0 - 0.38 * crease;
		blade = mix( blade, vec3( 0.185, 0.095, 0.050 ), margin * 0.7 );

		// The underside is a dull plum, not the green top.
		if ( ! gl_FrontFacing ) blade = mix( vec3( 0.075, 0.035, 0.045 ), blade, 0.25 );

		// Algae scum films over the pads in the murk.
		blade = mix( blade, uAlgaeColor * ( 0.7 + 0.5 * blotch ), uAlgae * 0.55 );
		blade *= mix( 1.0, 0.7, uCold );
		blade *= 1.0 + 0.3 * uDawn;

		diffuseColor.rgb = blade;
		roughnessFactor = mix( roughnessFactor, 0.78, uAlgae * 0.6 );

		/* Sky sheen. A pad is waxy: at night it reflects the sky rather than
		   emitting anything, and that reflection is all the viewer has to tell
		   a leaf from a hole in the water. Weight it by a fresnel so the curled
		   margin and the far side of the saucer light up and the middle stays
		   dark — which is exactly how a wet leaf reads. */
		if ( gl_FrontFacing ) {
			float facing = clamp( dot( normalize( vNormal ), normalize( vViewPosition ) ), 0.0, 1.0 );
			float fres = pow( 1.0 - facing, 2.6 );
			/* Weighted low on purpose: a pad seen edge-on across the pond is
			   at full fresnel, and anything stronger than this turns the far
			   ones into white chips floating on black water. */
			totalEmissiveRadiance += uPadSheen *
				( 0.26 + 0.72 * fres + 0.62 * vein + 0.60 * margin );
		}
	}`)
  }
  lilyMat.customProgramCacheKey = () => 'pond-lily-veins'
  disposables.push(lilyGeo, lilyMat)

  /* Lilies grow off a rhizome, so they come in clumps — scattering them evenly
     round the pond is both wrong and wasteful, because most of the ring sits
     outside the lens for the whole scroll. Three clumps, placed where the
     camera actually looks: one out toward the far bank, one mid-pond, one
     close enough to pass under the lens on the way down. */
  const LILY_CLUMPS = [
    { x: -2.7, z: -5.2 },
    { x: 3.5, z: -1.1 },
    { x: -1.3, z: 4.0 }
  ]

  const lilies = []
  for (let i = 0; i < quality.lilyCount; i++) {
    const clump = LILY_CLUMPS[i % LILY_CLUMPS.length]
    const spur = rand() * Math.PI * 2
    const reach = 0.5 + Math.sqrt(rand()) * 2.1
    const pad = new THREE.Mesh(lilyGeo, lilyMat)
    const scale = 0.32 + rand() * 0.42
    // Slightly out of round in plan as well as in outline, so eight pads off
    // one geometry do not read as eight stamps of the same shape.
    pad.scale.set(scale * (0.90 + rand() * 0.2), scale, scale * (0.90 + rand() * 0.2))
    pad.position.set(clump.x + Math.cos(spur) * reach, 0.02, clump.z + Math.sin(spur) * reach)
    pad.rotation.y = rand() * Math.PI * 2
    group.add(pad)
    lilies.push(pad)
  }

  /* ---------------------------- lantern posts ---------------------------- */
  const glowTex = makeGlowTexture()
  const postGeo = new THREE.CylinderGeometry(0.05, 0.085, 1, 6, 1, false)
  const postMat = new THREE.MeshStandardMaterial({
    color: PALETTE.leather700,
    roughness: 0.78,
    metalness: 0.15
  })
  const headGeo = new THREE.IcosahedronGeometry(0.17, 1)
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x2a2219,
    emissive: new THREE.Color(PALETTE.brass300),
    emissiveIntensity: 1.5,
    roughness: 0.4,
    metalness: 0.5
  })
  disposables.push(postGeo, postMat, headGeo, headMat, glowTex)

  const glows = []
  for (const l of LANTERNS) {
    const gy = groundHeight(l.pos.x, l.pos.z)
    const height = Math.max(0.4, l.pos.y - gy)

    const post = new THREE.Mesh(postGeo, postMat)
    post.scale.set(1, height, 1)
    post.position.set(l.pos.x, gy + height * 0.5, l.pos.z)
    group.add(post)

    const head = new THREE.Mesh(headGeo, headMat)
    head.position.copy(l.pos)
    group.add(head)

    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      // Warm, not white: an additive sprite at full white blows straight out
      // through the tonemapper and turns every lantern into a headlight.
      color: new THREE.Color(PALETTE.brass400),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: true
    })
    const glow = new THREE.Sprite(glowMat)
    glow.position.copy(l.pos)
    glow.scale.setScalar(2.0)
    glow.renderOrder = 2
    group.add(glow)
    glows.push({ glow, glowMat, def: l })
    disposables.push(glowMat)
  }

  /* ------------------------------- update ------------------------------- */
  const grad = new THREE.Vector2()
  const glowColor = new THREE.Color()
  const GLOW_WARM = new THREE.Color(PALETTE.brass400)
  const GLOW_COLD = new THREE.Color(0x7f9a86)
  const GLOW_DAWN = new THREE.Color(0xf0cf92)

  // Eased copies of the story fields. The mood bundle is already continuous,
  // but easing here means a jumped scroll (anchor link, restored position)
  // still arrives at its new look instead of snapping to it.
  const eased = { algae: 0, debris: 0, cold: 0, dawn: 0, clarity: 0.55, fog: 0.019, stir: 0 }
  let lastT = 0
  let primed = false
  let lilyPlaced = false

  function approach (from, to, rate, dt) {
    return from + (to - from) * (1 - Math.exp(-rate * dt))
  }

  function update (t, stage) {
    const dt = Math.min(0.1, Math.max(0, t - lastT))
    lastT = t
    // Reduced motion gets a frozen clock: a composed still, not a loop.
    mood.uTime.value = quality.reduced ? 12.5 : t
    // Scrolling hard pushes water through the weed. Eased so the stems lean
    // into the move and settle back rather than snapping with the wheel.
    const scrollSpeed = (stage.scroll && stage.scroll.speed) || 0
    eased.stir = approach(eased.stir, clamp01(scrollSpeed), eased.stir < scrollSpeed ? 6 : 1.8, dt)
    mood.uSway.value = quality.reduced ? 0 : 1 + 0.85 * eased.stir

    const m = stage.mood
    if (m) {
      // Land on the story's look on the first real frame instead of easing up
      // from zero; ease from then on.
      const rate = primed ? 2.6 : 1e6
      if (dt > 0) primed = true
      eased.algae = approach(eased.algae, clamp01(m.algae), rate, dt)
      // Debris is the muck: it tracks algae down but lags it slightly, so the
      // rocks come clean just before the litter finishes draining away.
      eased.debris = approach(eased.debris, clamp01(m.algae * 0.75 + (1 - clamp01(m.clarity)) * 0.45), rate, dt)
      eased.cold = approach(eased.cold, clamp01(m.coldFactor), rate, dt)
      eased.dawn = approach(eased.dawn, clamp01(m.dawnFactor), rate, dt)
      eased.clarity = approach(eased.clarity, clamp01(m.clarity), rate, dt)
      eased.fog = approach(eased.fog, m.fogDensity, rate, dt)
    }

    // Lift the mid-range: half-cleared slime must still read on a near-black
    // floor, or the one beat that shows the work being done is invisible.
    mood.uAlgae.value = Math.pow(eased.algae, 0.72)
    mood.uDebris.value = eased.debris
    mood.uCold.value = eased.cold
    mood.uDawn.value = eased.dawn

    // Once the muck is gone there is nothing left to submit.
    const debrisVisible = eased.debris > 0.004
    for (let i = 0; i < debrisMeshes.length; i++) debrisMeshes[i].visible = debrisVisible

    // Slimed pads are dull; clean ones catch the sky, and dawn lights them up.
    // Cool and dim: this is reflected night sky, not a light source. It only
    // has to beat the black water underneath by enough to show a silhouette.
    const padK = 1 - 0.55 * eased.algae
    mood.uPadSheen.value.setRGB(
      0.017 * padK * (1 + 2.1 * eased.dawn),
      0.023 * padK * (1 + 1.8 * eased.dawn),
      0.034 * padK * (1 + 1.0 * eased.dawn)
    )

    // Thick, cold water means the slime reads as bright sickly scum; clear
    // water leaves only a thin dark film behind.
    mood.uAlgaeColor.value.copy(ALGAE_THIN).lerp(ALGAE_THICK, eased.algae * (0.45 + 0.55 * eased.cold))

    // Caustics: colour follows the light, strength follows how much of it can
    // actually get down here through the silt.
    mood.uCausticColor.value.copy(CAUSTIC_NIGHT).lerp(CAUSTIC_COLD, eased.cold).lerp(CAUSTIC_DAWN, eased.dawn)
    const fogChoke = 1 - 0.65 * clamp01((eased.fog - 0.02) / 0.055)
    /* Seen from ABOVE the water, every lumen on the floor is a lumen the
       surface has to compete with — and the surface is the subject up there.
       Hold the caustics back until the lens is actually under, which is also
       what lets water.js stop capping its transmission: a dim floor can be
       honestly transparent without the frame turning into a lit pool. */
    const underK = 0.42 + 0.58 * clamp01(stage.submergence)
    mood.uCausticPower.value =
      (0.07 + 0.26 * eased.clarity) * fogChoke * (0.85 + 0.15 * eased.dawn) * underK

    // Lily pads ride the exact wave field the water shader draws. Reduced
    // motion poses them on a frozen wave once and then leaves them alone.
    if (!quality.reduced || !lilyPlaced) {
      lilyPlaced = true
      const wt = quality.reduced ? 12.5 : t
      for (let i = 0; i < lilies.length; i++) {
        const pad = lilies[i]
        const x = pad.position.x
        const z = pad.position.z
        pad.position.y = surfaceHeight(x, z, wt) + 0.015
        surfaceGradient(x, z, wt, grad)
        // Tilt so the pad's +Y normal follows the surface normal (-gx, 1, -gz).
        pad.rotation.x = -grad.y
        pad.rotation.z = grad.x
      }
    }

    // Lantern glows shrink and cool off once we are under the water, warm up
    // into dawn, and go green-grey when seen through the murk.
    const s = stage.submergence
    glowColor.copy(GLOW_WARM).lerp(GLOW_COLD, eased.cold * 0.7 * s).lerp(GLOW_DAWN, eased.dawn)
    for (let i = 0; i < glows.length; i++) {
      const { glow, glowMat, def } = glows[i]
      let flicker = 1
      if (!quality.reduced) {
        flicker = 1 +
          0.06 * Math.sin(t * def.flickerSpeed + def.phase) +
          0.035 * Math.sin(t * def.flickerSpeed * 2.37 + def.phase * 1.7)
      }
      glow.scale.setScalar(2.0 * flicker * (1 - 0.3 * s))
      glowMat.color.copy(glowColor)
      glowMat.opacity = (0.62 - 0.34 * s) * flicker * (1 + 0.25 * eased.dawn)
    }
  }

  function dispose () {
    group.traverse((o) => { if (o.isInstancedMesh) o.dispose() })
    group.clear()
    lilies.length = 0
    glows.length = 0
    debrisMeshes.length = 0
    for (const d of disposables) d.dispose()
  }

  return { group, update, dispose, pebbles, ground }
}
