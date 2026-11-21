# Where this stands — 2026-11-21

Live: https://nate-garcon.github.io/koiwrangler/ (Pages, auto-deploys on push
to `main`) · Admin: `/admin.html` · Repo: `nate-garcon/koiwrangler`

## Done

Scroll-driven WebGL pond behind the whole page, six-chapter story, procedural
koi / water / floor / particles. Services with live pricing, a four-step
booking wizard with verified quote maths, a supplies shop with cart, 18 custom
SVG icons, a nishikigoi heritage section, respectful-handling section, and
on-canvas koi labelling. Dependency-free backend (Stripe Checkout + promo
codes, bookings, Google sign-in, webhooks) with Docker and `fly.toml`. SEO,
structured data, social card. Self-hosted fonts; zero third-party requests.

## Before this is a real business site

1. **Real phone and email** in `src/data/content.js`. The number is in the
   555-01xx range, which is reserved for fiction and cannot ring anyone.
2. **Real prices** in `src/data/services.js`. Mine are plausible, not
   Michael's. Every price on the site and in the booking calculator reads
   from that one file.
3. **Photos.** There are none. The gallery shows drawn plates stamped "Photo
   pending", and the About section argues for two people with no faces. A
   headshot and one real before/after would be the single biggest upgrade
   available, and unlike credentials or reviews they are facts we can have.

## To switch the backend on

Nothing is code work — it is all environment variables (`.env.example`):

```bash
cp .env.example .env            # Stripe, Google OAuth, notify webhook
npm run server                  # http://127.0.0.1:8787
VITE_API_BASE=https://your-api-host npm run build
```

Until then the booking form and shop fall back to prefilled `mailto:` links
and the "Pay by card" button stays hidden, so nothing on the live site is
broken by their absence. Deploy the API with `fly deploy` (scale-to-zero,
data on a mounted volume) or any Docker host.

`koiwrangler.com` was available at $17/yr on 2026-11-21.

## Traps worth knowing

- **`tools/qa/shoot.mjs` must wait for camera convergence.** The 3D camera
  eases over seconds; under software WebGL that is ~8s of wall clock. A fixed
  delay screenshots a frame a whole story beat behind. Its frame timings are
  SwiftShader — a pessimistic floor, never real-device FPS.
- **Chapters are paced by `MIN_SPAN` in `src/story.js`,** not purely by DOM
  anchors. Anchors alone pace by section height, which buried `dusk` in the
  first 3% of the page.
- **The camera runs in chapter space** (`storyPos / 6`), not document scroll.
  Keying it to scroll makes the moods run ahead of the lens.
- **`src/three/koi.js` has a marked `renderOrder` workaround** for `water.js`
  charging a full water column to everything behind the surface (~2% gets
  through from above). Delete it if that shader ever becomes depth-aware.
- **Custom properties substitute where they are declared.** A per-section
  override of a property computed on `:root` is silently ignored.

## Copy rules

Read the comment at the top of `src/data/content.js` before editing any text.
The owner is new to ponds and koi; the site claims no expertise, no
credentials and no testimonials by design, and the humour is aimed at the
website itself rather than at anyone who works on it.
