#!/usr/bin/env node
/**
 * Generate the Open Graph social card from the real site.
 *
 * Not a mocked-up image: it drives the actual page in real Chrome at
 * 1200x630, parks the story on a chosen beat, waits for the 3D camera to
 * converge, and screenshots it. So the card always shows what the site
 * genuinely looks like today.
 *
 *   node tools/og.mjs                 # default beat, writes public/og.png
 *   node tools/og.mjs --at 0.72       # pick a different story position
 *   node tools/og.mjs --url https://nate-garcon.github.io/koiwrangler/
 */
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import path from 'node:path'

const CHROME = ['/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome']
  .find((p) => existsSync(p))
if (!CHROME) { console.error('[og] Google Chrome not found'); process.exit(2) }

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : fallback
}
// 0.72 lands in `return`: clear water, the full school back, richest colour.
// That is the frame that sells the site in a feed.
const AT = Number(arg('--at', '0.72'))
const URL_ = arg('--url', 'http://127.0.0.1:5173/')
const OUT = path.resolve(arg('--out', 'public/og.png'))

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-color-profile=srgb'],
})
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
})

await page.goto(URL_, { waitUntil: 'load', timeout: 90000 })
await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' })
await page.waitForTimeout(2500)

await page.evaluate((f) => {
  const max = document.documentElement.scrollHeight - window.innerHeight
  window.scrollTo({ top: max * f, behavior: 'instant' })
}, AT)

// Same convergence wait the QA harness uses: the camera eases over seconds,
// so a fixed delay would capture a frame mid-flight.
const settled = await page.evaluate(async () => {
  const cam = window.__pond?.stage?.camera
  if (!cam) return 'no-pond'
  const frame = () => new Promise((r) => requestAnimationFrame(r))
  let still = 0, last = cam.position.clone()
  for (let i = 0; i < 900; i++) {
    await frame()
    const d = cam.position.distanceTo(last)
    last = cam.position.clone()
    still = d < 0.0015 ? still + 1 : 0
    if (still >= 8) return 'settled'
  }
  return 'timeout'
})
await page.waitForTimeout(500)

const where = await page.evaluate(() => ({
  chapter: document.documentElement.dataset.chapter,
  clarity: window.__pond?.stage?.mood?.clarity,
}))

await page.screenshot({ path: OUT })
await browser.close()
console.log(`[og] ${OUT}\n[og] beat: ${where.chapter} (clarity ${where.clarity}), camera ${settled}`)
