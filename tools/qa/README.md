# Local QA harness

Drives **real Google Chrome** on this machine (`/usr/bin/google-chrome-stable`)
headless via `playwright-core`, against the loopback dev server. Nothing leaves
this device — no cloud browser, no grid, no uploads.

```bash
# default sweep: 1440px and 360px, five scroll positions each
node tools/qa/shoot.mjs

# the scroll-dive, finely sampled
node tools/qa/shoot.mjs --label dive --width 1440 --scroll 0,.1,.2,.3,.4,.5,.6,.8,1

# phone, retina
node tools/qa/shoot.mjs --label phone --width 360 --dpr 2

# accessibility / motion preference
node tools/qa/shoot.mjs --label rm --reduced-motion

# one component, scrolled into view and shot on its own
node tools/qa/shoot.mjs --label booking --selector "#book"
```

Outputs to `tools/qa/out/`: a PNG per viewport per scroll stop, plus
`<label>-report.json` containing console messages, page errors, failed
requests, frame timings and a DOM audit (horizontal overflow culprits, heading
outline, unlabelled form fields, images without alt, sub-44px tap targets,
canvas buffer size).

## Reading the output honestly

- **Frame timings are software-rendered.** Headless Chrome here has no GPU, so
  WebGL runs on SwiftShader. Treat the numbers as a pessimistic floor — never
  quote them as real-device FPS. Use them only to catch *relative* regressions
  and genuinely pathological frames.
- **`canvas ... (DEFAULT — 3D never sized it)`** means the canvas is still at
  the HTML default 300x150, i.e. nothing ever called `renderer.setSize()`. The
  3D did not boot.
- The audit never calls `getContext()` — doing so would create a context and
  could break the app's own.
