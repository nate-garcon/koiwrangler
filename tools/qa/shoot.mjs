#!/usr/bin/env node
/**
 * Local QA harness for The Koi Wrangler.
 *
 * Drives REAL Google Chrome on this machine (/usr/bin/google-chrome-stable) via
 * playwright-core, headless, against the loopback dev server. Nothing leaves
 * this device: no cloud browser, no remote grid, no uploads.
 *
 * Captures, per run:
 *   - a PNG at every requested scroll position, at every requested viewport
 *   - every console message, page error and failed request
 *   - a frame-rate sample taken while scroll-animating
 *   - a DOM audit: horizontal overflow culprits, heading outline, unlabelled
 *     form fields, images without alt text, tap-target sizes
 *   - a JSON report next to the PNGs
 *
 * Usage:
 *   node tools/qa/shoot.mjs                            # default sweep
 *   node tools/qa/shoot.mjs --label dive --width 1440 --scroll 0,.2,.4,.6,.8,1
 *   node tools/qa/shoot.mjs --width 360 --dpr 2 --reduced-motion
 *   node tools/qa/shoot.mjs --selector "#book" --label booking
 *
 * Flags:
 *   --url <url>          default http://127.0.0.1:5173/
 *   --label <name>       filename prefix (default "run")
 *   --width <px>         repeatable or comma list; default 1440,360
 *   --height <px>        default 900 for >=1024 wide, 780 otherwise
 *   --dpr <n>            device scale factor, default 1
 *   --scroll <list>      fractions of page height, default 0,.25,.5,.75,1
 *   --selector <css>     also screenshot this element, scrolled into view
 *   --reduced-motion     emulate prefers-reduced-motion: reduce
 *   --out <dir>          default tools/qa/out
 *   --keep-open <ms>     hold the page open before closing (debugging)
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const CHROME_CANDIDATES = [
  '/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome',
  '/usr/bin/google-chrome',
]

// ---------- arg parsing ----------
function parseArgs(argv) {
  const out = { width: [], scroll: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    switch (a) {
      case '--url': out.url = next(); break
      case '--label': out.label = next(); break
      case '--width': out.width.push(...next().split(',').map(Number)); break
      case '--height': out.height = Number(next()); break
      case '--dpr': out.dpr = Number(next()); break
      case '--scroll': out.scroll = next().split(',').map(Number); break
      case '--selector': out.selector = next(); break
      case '--reduced-motion': out.reducedMotion = true; break
      case '--out': out.out = next(); break
      case '--keep-open': out.keepOpen = Number(next()); break
      default: console.warn(`[qa] ignoring unknown flag: ${a}`)
    }
  }
  return out
}
const args = parseArgs(process.argv)
const URL_ = args.url ?? 'http://127.0.0.1:5173/'
const LABEL = args.label ?? 'run'
const WIDTHS = args.width.length ? args.width : [1440, 360]
const SCROLLS = args.scroll ?? [0, 0.25, 0.5, 0.75, 1]
const DPR = args.dpr ?? 1
const OUT = path.resolve(args.out ?? path.join(path.dirname(new URL(import.meta.url).pathname), 'out'))

const exe = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!exe) {
  console.error('[qa] Google Chrome not found. Looked in:\n  ' + CHROME_CANDIDATES.join('\n  '))
  process.exit(2)
}

// ---------- in-page instrumentation ----------
// Installed before any app code runs, so it sees the very first frames.
const FPS_PROBE = () => {
  window.__qaFrames = []
  let last = performance.now()
  const tick = (t) => {
    window.__qaFrames.push(t - last)
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** Runs in the page. Returns layout/a11y facts that are tedious to eyeball. */
const DOM_AUDIT = () => {
  const vw = document.documentElement.clientWidth
  const overflowing = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    // Only report elements that push past the viewport, not merely clipped children.
    if (r.right > vw + 1 || r.left < -1) {
      const style = getComputedStyle(el)
      if (style.position === 'fixed') continue
      overflowing.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 80)) || null,
        id: el.id || null,
        left: Math.round(r.left),
        right: Math.round(r.right),
        overBy: Math.round(r.right - vw),
      })
    }
  }

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
    level: Number(h.tagName[1]),
    text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 70),
  }))
  const headingProblems = []
  if (headings.filter((h) => h.level === 1).length !== 1) {
    headingProblems.push(`expected exactly one <h1>, found ${headings.filter((h) => h.level === 1).length}`)
  }
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level - headings[i - 1].level > 1) {
      headingProblems.push(`jump h${headings[i - 1].level} -> h${headings[i].level} at "${headings[i].text}"`)
    }
  }

  const unlabelled = [...document.querySelectorAll('input,select,textarea')]
    .filter((f) => f.type !== 'hidden')
    .filter((f) => {
      if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby')) return false
      if (f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`)) return false
      if (f.closest('label')) return false
      return true
    })
    .map((f) => ({ tag: f.tagName.toLowerCase(), type: f.type || null, name: f.name || null, id: f.id || null }))

  const imgsNoAlt = [...document.querySelectorAll('img')]
    .filter((i) => i.getAttribute('alt') === null)
    .map((i) => i.currentSrc || i.src || '(no src)')

  // Interactive things smaller than the 44x44 touch guidance.
  const smallTargets = [...document.querySelectorAll('a,button,input[type=radio],input[type=checkbox],summary,[role=button]')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
    .slice(0, 25)
    .map(({ el, r }) => ({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      w: Math.round(r.width),
      h: Math.round(r.height),
    }))

  const frames = window.__qaFrames || []
  const recent = frames.slice(-180).filter((d) => d > 0 && d < 500)
  const sorted = [...recent].sort((a, b) => a - b)
  const pct = (p) => (sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null)

  return {
    viewport: { w: vw, h: document.documentElement.clientHeight },
    docHeight: document.documentElement.scrollHeight,
    horizontalScroll: document.documentElement.scrollWidth > vw + 1
      ? { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw }
      : null,
    overflowing: overflowing.slice(0, 20),
    overflowingCount: overflowing.length,
    headings,
    headingProblems,
    unlabelledFields: unlabelled,
    imagesWithoutAlt: imgsNoAlt,
    smallTapTargets: smallTargets,
    canvas: (() => {
      const c = document.getElementById('pond-canvas')
      if (!c) return { present: false }
      return {
        present: true,
        cssW: Math.round(c.getBoundingClientRect().width),
        cssH: Math.round(c.getBoundingClientRect().height),
        bufferW: c.width,
        bufferH: c.height,
        // NEVER call getContext() here: it has side effects (it would create a
        // context, and could lock the canvas to a type the app didn't want).
        // A canvas still at the HTML default 300x150 means nothing has called
        // renderer.setSize() on it yet -> the 3D never booted.
        bufferIsDefault: c.width === 300 && c.height === 150,
        pondHandle: typeof window.__pond === 'object' && window.__pond !== null,
        htmlClass: document.documentElement.className || null,
      }
    })(),
    diveVar: getComputedStyle(document.documentElement).getPropertyValue('--dive').trim(),
    frameStats: {
      samples: recent.length,
      medianMs: pct(0.5) != null ? +pct(0.5).toFixed(2) : null,
      p95Ms: pct(0.95) != null ? +pct(0.95).toFixed(2) : null,
      worstMs: sorted.length ? +sorted[sorted.length - 1].toFixed(2) : null,
      approxFps: pct(0.5) ? +(1000 / pct(0.5)).toFixed(1) : null,
      longFrames: recent.filter((d) => d > 33).length,
    },
  }
}


/**
 * Evaluate in the page, surviving a Vite HMR reload.
 *
 * While agents are editing source, the dev server triggers a full reload and
 * any in-flight page.evaluate dies with "Execution context was destroyed".
 * That is build contention, not a page fault, so retry rather than crash the
 * whole run and report a false failure.
 */
async function safeEval (page, fn, arg, { retries = 3, fallback = null } = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await page.evaluate(fn, arg)
    } catch (err) {
      const msg = String(err?.message || err)
      const transient = msg.includes('Execution context was destroyed') ||
                        msg.includes('Target closed') ||
                        msg.includes('navigation')
      if (!transient || i === retries) {
        if (!transient) throw err
        console.warn('[qa] page kept reloading under us (agents are editing) — giving up on this probe')
        return fallback
      }
      console.warn(`[qa] page reloaded mid-probe (HMR), retry ${i + 1}/${retries}`)
      await page.waitForLoadState('load').catch(() => {})
      await page.waitForTimeout(1500)
    }
  }
  return fallback
}

// ---------- run ----------
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: [
    // Headless Chrome has no GPU here, so WebGL runs on SwiftShader (software).
    // Renders correctly for screenshots; frame timings are a PESSIMISTIC lower
    // bound and must not be quoted as real-device performance.
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
  ],
})

const report = {
  url: URL_,
  label: LABEL,
  chrome: exe,
  chromeVersion: browser.version(),
  reducedMotion: !!args.reducedMotion,
  note: 'Frame timings come from software WebGL (SwiftShader) in headless Chrome — treat them as a floor, not real-device FPS.',
  runs: [],
}

for (const width of WIDTHS) {
  const height = args.height ?? (width >= 1024 ? 900 : 780)
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: DPR,
    reducedMotion: args.reducedMotion ? 'reduce' : 'no-preference',
    isMobile: width < 700,
    hasTouch: width < 700,
  })
  const page = await ctx.newPage()

  const console_ = []
  const pageErrors = []
  const failedRequests = []
  page.on('console', (m) => console_.push({ type: m.type(), text: m.text().slice(0, 300), loc: m.location()?.url || null }))
  page.on('pageerror', (e) => pageErrors.push({ message: e.message, stack: (e.stack || '').split('\n').slice(0, 4).join(' | ') }))
  page.on('requestfailed', (r) => failedRequests.push({ url: r.url(), failure: r.failure()?.errorText }))
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.push({ url: r.url(), status: r.status() }) })

  await page.addInitScript(FPS_PROBE)
  // Generous timeouts on purpose: several agents may be driving Chrome at
  // once and WebGL runs on SwiftShader here, so `load` can legitimately take
  // far longer than a normal page. A timeout is contention, not a page bug —
  // retry once before giving up so a busy machine doesn't read as a failure.
  page.setDefaultTimeout(60000)
  try {
    await page.goto(URL_, { waitUntil: 'load', timeout: 90000 })
  } catch {
    console.warn('[qa] first goto timed out (machine busy) — retrying once')
    await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 })
  }
  // Measurement must not be at the mercy of CSS smooth scrolling.
  await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' })
  // Let the pond build itself and the reveal observers settle.
  await page.waitForTimeout(2500)

  const shots = []
  for (const frac of SCROLLS) {
    await safeEval(page, (f) => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo({ top: max * f, behavior: 'instant' })
    }, frac)

    // Wait for the 3D camera to actually ARRIVE. It eases toward its scroll
    // target over seconds, and under software WebGL at ~5fps that can take the
    // better part of ten seconds — a fixed delay captures a frame that is a
    // whole story beat behind what we asked for. Poll the live camera until it
    // stops moving; fall back to a plain delay when there is no pond.
    const settled = await safeEval(page, async () => {
      const cam = window.__pond?.stage?.camera
      if (!cam) return 'no-pond'
      const frame = () => new Promise((r) => requestAnimationFrame(r))
      let still = 0
      let last = cam.position.clone()
      for (let i = 0; i < 900; i++) {
        await frame()
        const d = cam.position.distanceTo(last)
        last = cam.position.clone()
        // Converged = sub-millimetre movement sustained over several frames.
        still = d < 0.0015 ? still + 1 : 0
        if (still >= 8) return 'settled'
      }
      return 'timeout'
    }, null, { fallback: 'reloaded' })
    if (settled === 'timeout') console.warn(`[qa] camera never settled at scroll ${frac}`)
    // Reveal/stagger transitions are CSS-timed, so they still need a beat.
    await page.waitForTimeout(settled === 'no-pond' ? 700 : 450)
    const name = `${LABEL}-${width}w-scroll${String(Math.round(frac * 100)).padStart(3, '0')}.png`
    await page.screenshot({ path: path.join(OUT, name) })
    const where = await safeEval(page, () => {
      const cam = window.__pond?.stage?.camera
      const mood = window.__pond?.stage?.mood
      const cs = getComputedStyle(document.documentElement)
      return {
        chapter: document.documentElement.dataset.chapter || null,
        dive: cs.getPropertyValue('--dive').trim(),
        storyT: cs.getPropertyValue('--story-t').trim(),
        camY: cam ? +cam.position.y.toFixed(3) : null,
        storyPos: mood ? +mood.storyPos.toFixed(3) : null,
        clarity: mood ? +mood.clarity.toFixed(2) : null,
        silt: mood ? +mood.silt.toFixed(2) : null,
        algae: mood ? +mood.algae.toFixed(2) : null
      }
    }, null, { fallback: {} })
    shots.push({ scrollFraction: frac, file: name, settled, ...where })
  }

  if (args.selector) {
    const el = page.locator(args.selector).first()
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded()
      await page.waitForTimeout(500)
      const name = `${LABEL}-${width}w-el.png`
      await el.screenshot({ path: path.join(OUT, name) }).catch((e) => console.warn('[qa] element shot failed:', e.message))
      shots.push({ selector: args.selector, file: name })
    } else {
      console.warn(`[qa] selector not found: ${args.selector}`)
    }
  }

  const audit = await safeEval(page, DOM_AUDIT, null, { fallback: null })
  if (args.keepOpen) await page.waitForTimeout(args.keepOpen)

  report.runs.push({ width, height, dpr: DPR, shots, audit, console: console_, pageErrors, failedRequests })
  await ctx.close()
}

await browser.close()

const reportPath = path.join(OUT, `${LABEL}-report.json`)
await writeFile(reportPath, JSON.stringify(report, null, 2))

// ---------- terminal summary ----------
console.log(`\n=== QA: ${LABEL} — ${URL_} ===`)
console.log(`Chrome ${report.chromeVersion} (${exe}), reduced-motion=${report.reducedMotion}`)
for (const r of report.runs) {
  if (!r.audit) { console.log(`\n--- ${r.width}x${r.height} --- audit unavailable (page kept reloading)`); continue }
  const errs = r.console.filter((c) => c.type === 'error')
  const warns = r.console.filter((c) => c.type === 'warning')
  console.log(`\n--- ${r.width}x${r.height} @${r.dpr}x ---`)
  console.log(`  doc height      ${r.audit.docHeight}px`)
  console.log(`  canvas          ${r.audit.canvas.present ? `${r.audit.canvas.cssW}x${r.audit.canvas.cssH} css, ${r.audit.canvas.bufferW}x${r.audit.canvas.bufferH} buffer${r.audit.canvas.bufferIsDefault ? ' (DEFAULT — 3D never sized it)' : ''}` : 'ABSENT'}`)
console.log(`  html class      ${r.audit.canvas.htmlClass ?? '(none)'}`)
  console.log(`  frames          median ${r.audit.frameStats.medianMs}ms (~${r.audit.frameStats.approxFps}fps), p95 ${r.audit.frameStats.p95Ms}ms, ${r.audit.frameStats.longFrames} long frames`)
  console.log(`  h-scroll        ${r.audit.horizontalScroll ? `YES — scrollWidth ${r.audit.horizontalScroll.scrollWidth} vs ${r.audit.horizontalScroll.clientWidth}` : 'none'}`)
  console.log(`  overflowing     ${r.audit.overflowingCount}`)
  for (const o of r.audit.overflowing.slice(0, 6)) console.log(`      ${o.tag}${o.id ? '#' + o.id : ''}${o.cls ? '.' + String(o.cls).split(' ')[0] : ''} +${o.overBy}px`)
  console.log(`  heading issues  ${r.audit.headingProblems.length ? r.audit.headingProblems.join('; ') : 'none'}`)
  console.log(`  unlabelled      ${r.audit.unlabelledFields.length}`)
  console.log(`  img w/o alt     ${r.audit.imagesWithoutAlt.length}`)
  console.log(`  small targets   ${r.audit.smallTapTargets.length}`)
  console.log(`  page errors     ${r.pageErrors.length}`)
  for (const e of r.pageErrors.slice(0, 5)) console.log(`      ${e.message}`)
  console.log(`  console err/warn ${errs.length}/${warns.length}`)
  for (const e of errs.slice(0, 6)) console.log(`      ${e.text}`)
  console.log(`  failed requests ${r.failedRequests.length}`)
  for (const f of r.failedRequests.slice(0, 5)) console.log(`      ${f.status || f.failure} ${f.url}`)
  console.log('  beats:')
  for (const sh of r.shots) {
    if (sh.selector) { console.log(`      [el ${sh.selector}] ${sh.file}`); continue }
    console.log(`      t=${String(sh.scrollFraction).padEnd(5)} ${String(sh.chapter).padEnd(7)} storyPos=${String(sh.storyPos).padEnd(6)} camY=${String(sh.camY).padEnd(7)} clarity=${sh.clarity} silt=${sh.silt} algae=${sh.algae} ${sh.settled}`)
  }
}
console.log(`\nreport: ${reportPath}\nimages: ${OUT}\n`)
