import * as THREE from 'three'
import { PALETTE } from './palette.js'

/**
 * scene.js — renderer, scene graph root, camera, the night lighting rig and
 * the scroll-driven dive camera.
 *
 * Everything in here is "the stage": no koi, no water, no props.
 */

/* -------------------------------------------------------------------------
   Lantern placement. Shared with water.js (specular pools on the surface)
   and environment.js (the physical posts), so it lives in one place.
   Pond centre is roughly (0, 0, -2); the camera starts at +Z looking -Z.
   ------------------------------------------------------------------------- */
export const LANTERNS = [
  { pos: new THREE.Vector3(-11.5, 2.45, -8.8), intensity: 36, flickerSpeed: 1.7, phase: 0.0 },
  { pos: new THREE.Vector3(13.0, 2.30, 6.4), intensity: 30, flickerSpeed: 2.3, phase: 2.1 },
  { pos: new THREE.Vector3(-4.0, 2.60, -13.9), intensity: 33, flickerSpeed: 1.3, phase: 4.3 }
]

export const WATER_LEVEL = 0
export const FLOOR_Y = -6.2

/* -------------------------------------------------------------------------
   The story camera path. `p` is GLOBAL story progress (0..1 across the whole
   document), fed from main.js via index.js -> setProgress.

   It crosses the water line (y = 0) TWICE, which is what makes the six-chapter
   arc work:
     p ~ 0.21  down through the surface  (dive)
     p ~ 0.92  back up through it        (dawn)
   Between those it travels down into the murk, drifts through the clean, and
   rises among the returning koi. `submergence` and `crossing` are derived from
   camera height in applyCamera(), so both crossings light up automatically.
   ------------------------------------------------------------------------- */
const STORY_KEYS = [
  // `p` is CHAPTER SPACE, not document scroll: p = storyPos / 6, where
  // storyPos = chapterIndex + chapterT. Six chapters, so each owns 1/6 of the
  // path and the camera is locked to the same clock as the mood blending in
  // mood.js. Keying this to raw document scroll instead made the chapters run
  // ahead of the camera — the water was already green and silted while the
  // lens was still a metre above the surface.
  //
  // dusk  0.000 - 0.167   above the water
  { p: 0.000, pos: [0.0, 1.45, 11.0], tgt: [0.0, 0.42, 1.0], fov: 44 },
  { p: 0.120, pos: [0.9, 1.05, 9.0], tgt: [0.35, 0.25, 0.0], fov: 45 },
  // dive  0.167 - 0.333   lean in and break through (crossing ~0.27)
  { p: 0.215, pos: [1.2, 0.40, 7.0], tgt: [0.5, -0.18, -1.2], fov: 48 },
  { p: 0.280, pos: [1.1, -0.34, 5.6], tgt: [0.4, -1.05, -2.0], fov: 52 },
  // murk  0.333 - 0.500   down into the worst of it
  { p: 0.420, pos: [0.6, -1.50, 4.0], tgt: [0.0, -2.00, -3.4], fov: 55 },
  // clean 0.500 - 0.667   drifting while the water clears around the lens
  { p: 0.580, pos: [-0.2, -2.20, 2.4], tgt: [-0.5, -2.30, -4.6], fov: 56 },
  // return 0.667 - 0.833  rising into the school
  { p: 0.740, pos: [-0.5, -1.70, 1.2], tgt: [-0.3, -1.60, -5.2], fov: 54 },
  { p: 0.820, pos: [-0.2, -0.80, 1.6], tgt: [0.0, -0.30, -4.0], fov: 50 },
  // dawn  0.833 - 1.000   back out into morning air (crossing ~0.90)
  { p: 0.900, pos: [0.1, 0.30, 2.6], tgt: [0.3, 0.55, -3.0], fov: 46 },
  { p: 1.000, pos: [0.3, 1.25, 4.4], tgt: [0.2, 0.60, -2.0], fov: 44 }
]

const smoothstep = (t) => t * t * (3 - 2 * t)
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)

/** Sample the story path. Writes into `outPos` / `outTgt`, returns the fov. */
function sampleDive (p, outPos, outTgt) {
  p = clamp01(p)
  let i = 0
  while (i < STORY_KEYS.length - 2 && p > STORY_KEYS[i + 1].p) i++
  const a = STORY_KEYS[i]
  const b = STORY_KEYS[i + 1]
  const span = b.p - a.p
  const t = smoothstep(span > 1e-6 ? clamp01((p - a.p) / span) : 0)

  outPos.set(
    a.pos[0] + (b.pos[0] - a.pos[0]) * t,
    a.pos[1] + (b.pos[1] - a.pos[1]) * t,
    a.pos[2] + (b.pos[2] - a.pos[2]) * t
  )
  outTgt.set(
    a.tgt[0] + (b.tgt[0] - a.tgt[0]) * t,
    a.tgt[1] + (b.tgt[1] - a.tgt[1]) * t,
    a.tgt[2] + (b.tgt[2] - a.tgt[2]) * t
  )
  return a.fov + (b.fov - a.fov) * t
}

/**
 * Build the stage.
 * Throws if WebGL is unavailable — main.js relies on that to fall back to CSS.
 */
export function createStage ({ canvas, quality }) {
  if (!canvas) throw new Error('createStage: no canvas')

  // WebGLRenderer itself throws 'Error creating WebGL context.' when there is
  // no context to be had, which is exactly the contract initPond needs.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality.antialias,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = false // night pond + fog hides the lack of them

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(PALETTE.fogAbove, 0.019)
  scene.background = null
  renderer.setClearColor(scene.fog.color, 1)

  const camera = new THREE.PerspectiveCamera(44, 1, 0.08, 180)
  camera.position.set(STORY_KEYS[0].pos[0], STORY_KEYS[0].pos[1], STORY_KEYS[0].pos[2])

  /* ---------------------------- lighting ---------------------------- */

  // Night fill. Sky term is pond-blue, ground term is near-black silt.
  const hemi = new THREE.HemisphereLight(PALETTE.night500, PALETTE.night900, 0.55)
  scene.add(hemi)

  const ambient = new THREE.AmbientLight(PALETTE.night700, 0.5)
  scene.add(ambient)

  // Cool moonlight for silhouette definition; no shadow map (too costly here).
  const moon = new THREE.DirectionalLight(PALETTE.moon, 0.42)
  moon.position.set(-6, 14, 4)
  scene.add(moon)

  // Warm brass lanterns around the pond edge.
  const lanterns = LANTERNS.map((def) => {
    const light = new THREE.PointLight(PALETTE.brass400, def.intensity, 30, 1.7)
    light.position.copy(def.pos)
    scene.add(light)
    return { light, def }
  })

  /* ---------------------------- fog states ---------------------------- */
  const fogAbove = new THREE.Color(PALETTE.fogAbove)
  const fogUnder = new THREE.Color(PALETTE.fogUnder)
  const hemiSkyAbove = new THREE.Color(PALETTE.night500)
  const hemiSkyUnder = new THREE.Color(PALETTE.night600)
  const ambAbove = new THREE.Color(PALETTE.night700)
  const ambUnder = new THREE.Color(PALETTE.night600)

  const FOG_DENSITY_ABOVE = 0.019
  const FOG_DENSITY_UNDER = 0.072

  /* ---------------------------- camera rig ---------------------------- */
  const targetPos = new THREE.Vector3().fromArray(STORY_KEYS[0].pos)
  const targetLook = new THREE.Vector3().fromArray(STORY_KEYS[0].tgt)
  const easedLook = targetLook.clone()
  let targetFov = STORY_KEYS[0].fov
  let easedFov = targetFov

  /** 0 above the water, 1 fully under. Drives fog/light/water mood. */
  let submergence = 0
  /** Peaks at 1 exactly as the lens passes through the surface. */
  let crossing = 0
  let progress = 0

  function setProgress (p) {
    progress = clamp01(p)
    targetFov = sampleDive(progress, targetPos, targetLook)
    if (quality.reduced) {
      // Reduced motion: snap. No easing, no sense of travel.
      camera.position.copy(targetPos)
      easedLook.copy(targetLook)
      easedFov = targetFov
      applyCamera()
    }
  }

  function applyCamera () {
    camera.lookAt(easedLook)
    if (Math.abs(camera.fov - easedFov) > 0.01) {
      camera.fov = easedFov
      camera.updateProjectionMatrix()
    }
    const depth = WATER_LEVEL - camera.position.y
    submergence = smoothstep(clamp01((depth + 0.15) / 0.65))
    crossing = clamp01(1 - Math.abs(depth) / 0.55)
    crossing *= crossing * (3 - 2 * crossing)
  }

  /**
   * Ease the camera toward the scroll target. Exponential smoothing with a
   * frame-rate-independent factor, so it feels like water resisting the move
   * rather than a scrollbar snapping.
   */
  function updateCamera (dt) {
    if (quality.reduced) return
    const k = 1 - Math.exp(-3.1 * dt)
    camera.position.lerp(targetPos, k)
    easedLook.lerp(targetLook, 1 - Math.exp(-3.6 * dt))
    easedFov += (targetFov - easedFov) * (1 - Math.exp(-2.6 * dt))
    applyCamera()
  }

  /** Re-tint fog and lights for how deep the lens currently is. */
  function updateMood (t) {
    const s = submergence
    scene.fog.color.copy(fogAbove).lerp(fogUnder, s)
    scene.fog.density = FOG_DENSITY_ABOVE + (FOG_DENSITY_UNDER - FOG_DENSITY_ABOVE) * s
    renderer.setClearColor(scene.fog.color, 1)

    hemi.color.copy(hemiSkyAbove).lerp(hemiSkyUnder, s)
    hemi.intensity = 0.55 - 0.25 * s
    ambient.color.copy(ambAbove).lerp(ambUnder, s)
    ambient.intensity = 0.5 - 0.08 * s
    moon.intensity = 0.42 - 0.2 * s

    // Lantern falloff underwater, plus a very small flicker. Two detuned
    // sines read as a living flame without turning into a campfire.
    const lanternScale = 1 - 0.55 * s
    for (let i = 0; i < lanterns.length; i++) {
      const { light, def } = lanterns[i]
      let flicker = 1
      if (!quality.reduced) {
        flicker = 1 +
          0.045 * Math.sin(t * def.flickerSpeed + def.phase) +
          0.028 * Math.sin(t * def.flickerSpeed * 2.37 + def.phase * 1.7)
      }
      light.intensity = def.intensity * lanternScale * flicker
    }
  }

  /* ---------------------------- sizing ---------------------------- */
  function setSize () {
    const w = Math.max(1, canvas.clientWidth || window.innerWidth)
    const h = Math.max(1, canvas.clientHeight || window.innerHeight)
    const small = window.innerWidth < 760
    const dpr = Math.min(window.devicePixelRatio || 1, small || quality.tier === 'low' ? 1.5 : 2)
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    return { w, h, dpr }
  }

  function dispose () {
    scene.remove(hemi, ambient, moon)
    hemi.dispose()
    ambient.dispose()
    moon.dispose()
    for (const { light } of lanterns) {
      scene.remove(light)
      light.dispose()
    }
    renderer.dispose()
    // Drop the GL context so a re-init (or page teardown) frees VRAM now.
    renderer.forceContextLoss?.()
  }

  // Prime the rig so the very first frame is already composed.
  setProgress(0)
  applyCamera()

  return {
    renderer,
    scene,
    camera,
    lanterns,
    setSize,
    setProgress,
    updateCamera,
    updateMood,
    dispose,
    get progress () { return progress },
    get submergence () { return submergence },
    get crossing () { return crossing }
  }
}
