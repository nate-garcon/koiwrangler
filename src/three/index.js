/**
 * initPond — the orchestrator.
 *
 * Builds the stage, hangs the water / koi / environment / particles off it,
 * runs the frame loop, and translates the scroll story into render state.
 *
 * THE MOOD CONTRACT (read this before touching a module)
 * -----------------------------------------------------
 * Every frame this file writes the current story bundle onto the stage as
 * `stage.mood`, BEFORE any module's update() is called. Modules already
 * receive `stage`, so none of their signatures had to change: read
 * `stage.mood` inside your update and drive your own look from it.
 *
 * stage.mood fields (from src/three/mood.js, blended continuously):
 *   fogDensity   0.008 .. 0.075   thickness of the water
 *   waterTint    hex int          deep-water colour for this beat
 *   lightWarmth  0.45 .. 1.35     <1 cold/green murk, >1 dawn
 *   silt         0 .. 1           suspended particulate load
 *   clarity      0 .. 1           how far you can see
 *   koiPresence  0 .. 1           how much of the school is here
 *   spread       0.85 .. 1.8      how scattered they are
 *   depth        -1.1 .. 0.35     vertical bias of the school
 *   pace         0.5 .. 1.2       how fast they swim
 *   koiLight     0.02 .. 0.115    emissive lift on the fish
 *   algae        0 .. 1           green growth on rocks and surface
 *   settle       0 .. 1           1 while silt should be actively draining
 *   dawnFactor   0 .. 1           derived: how far into dawn light
 *   coldFactor   0 .. 1           derived: how far into the cold murk
 *   storyPos     0 .. 5           chapter index + chapterT, continuous
 *
 * `stage.scroll` carries live scroll INPUT (as opposed to story position):
 *   velocity   signed, roughly -3..3 viewport-heights per second, smoothed
 *   speed      0..1, abs(velocity) mapped for easy use
 *   direction  +1 down, -1 up, 0 idle
 * It decays to 0 when the viewer stops. Use it to make the scene feel alive
 * under the hand — fish darting, particles stirring — not to position things.
 *
 * Also on the stage: `submergence` (0 above water, 1 under) and `crossing`
 * (peaks at 1 exactly as the lens passes through the surface — it does this
 * TWICE, going down at p~0.21 and coming back up at p~0.92).
 */
import * as THREE from 'three'
import { createQuality } from './quality.js'
import { createStage } from './scene.js'
import { createWater } from './water.js'
import { createKoiSchool } from './koi.js'
import { createEnvironment } from './environment.js'
import { createParticles } from './particles.js'
import { sampleMood } from './mood.js'

export function initPond ({ canvas }) {
  if (!canvas) throw new Error('initPond: no canvas')

  const quality = createQuality()

  // createStage throws when there is no WebGL context — main.js relies on that
  // to fall back to the CSS gradient, so do NOT swallow it.
  const stage = createStage({ canvas, quality })

  const water = createWater({ quality })
  const koi = createKoiSchool({ quality })
  const environment = createEnvironment({ quality })
  const particles = createParticles({ quality })

  stage.scene.add(water.mesh, koi.group, environment.group, particles.group)

  // Seed both bundles so modules never see undefined on their first frame.
  stage.mood = sampleMood(0, 0)
  stage.scroll = { t: 0, velocity: 0, speed: 0, direction: 0 }

  /* ------------------------------- sizing ------------------------------- */
  let projScale = 1
  function resize () {
    const { h } = stage.setSize()
    // Point-sprite scale: how many pixels one world unit covers at z = 1.
    // particles.js needs this to keep motes a constant on-screen size.
    projScale = h / (2 * Math.tan((stage.camera.fov * Math.PI) / 360))
  }
  resize()

  let resizeTimer = 0
  const onResize = () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(resize, 120)
  }
  addEventListener('resize', onResize)
  addEventListener('orientationchange', onResize)

  /* ------------------------------- story -------------------------------- */
  function setStory (state) {
    stage.mood = sampleMood(state.index, state.chapterT)
    // Live scroll input, for modules that should REACT to being scrolled
    // rather than merely being positioned by it. The koi use this to dart and
    // bank when the viewer scrolls hard; it decays to 0 when they stop.
    stage.scroll = {
      t: state.t,
      velocity: state.velocity || 0,
      speed: state.speed || 0,
      direction: state.direction || 0
    }
    // Camera runs on CHAPTER SPACE so it stays locked to the mood blend.
    // storyPos is 0..6 (chapterIndex + chapterT) — see mood.js.
    stage.setProgress(stage.mood.storyPos / 6)
  }

  // Back-compat: main.js still calls this with dive-only progress. The story
  // path is driven by setStory, so this is intentionally a no-op beyond
  // keeping older callers from throwing.
  function setScrollProgress () {}

  /* -------------------------------- loop -------------------------------- */
  const clock = new THREE.Clock()
  let running = true
  let frame = 0
  let resolveReady
  const ready = new Promise((res) => { resolveReady = res })

  function tick () {
    if (!running) return
    frame = requestAnimationFrame(tick)

    // Clamp dt: a backgrounded tab or a long GC pause must not teleport the
    // camera or fling every koi across the pond on the next frame.
    const dt = Math.min(clock.getDelta(), 1 / 20)
    const t = clock.elapsedTime

    stage.updateCamera(dt)
    stage.updateMood(t)
    applyStoryMood()

    water.update(t, stage)
    environment.update(t, stage)
    koi.update(t, dt, stage)
    particles.update(t, dt, stage, projScale)

    stage.renderer.render(stage.scene, stage.camera)

    if (resolveReady) { resolveReady(); resolveReady = null }
  }

  /**
   * stage.updateMood() tints fog purely by how deep the lens is. That is the
   * right base, but the story also says what the water is LIKE at this beat —
   * green and thick in the murk, clear and warm at dawn. Layer that on top,
   * weighted by submergence so the above-water shots keep their night sky.
   */
  const tintColor = new THREE.Color()
  function applyStoryMood () {
    const m = stage.mood
    const s = stage.submergence
    tintColor.setHex(m.waterTint)
    stage.scene.fog.color.lerp(tintColor, 0.8 * s)
    stage.scene.fog.density = stage.scene.fog.density * (1 - s) + m.fogDensity * s
    stage.renderer.setClearColor(stage.scene.fog.color, 1)
  }

  /* ----------------------------- visibility ----------------------------- */
  function onVisibility () {
    if (document.hidden) {
      running = false
      cancelAnimationFrame(frame)
    } else if (!running) {
      running = true
      clock.getDelta() // discard the gap so dt doesn't spike on resume
      tick()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  tick()

  /* ------------------------------ teardown ------------------------------ */
  function dispose () {
    running = false
    cancelAnimationFrame(frame)
    removeEventListener('resize', onResize)
    removeEventListener('orientationchange', onResize)
    document.removeEventListener('visibilitychange', onVisibility)
    clearTimeout(resizeTimer)
    particles.dispose()
    environment.dispose()
    koi.dispose()
    water.dispose()
    stage.dispose()
  }

  return { setStory, setScrollProgress, dispose, ready, stage, quality }
}
