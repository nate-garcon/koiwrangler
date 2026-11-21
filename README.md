# The Koi Wrangler

Marketing site for a koi-pond-cleaning business. Scroll-driven WebGL pond that
tells the sales story: dusk on the surface → diving in → the murk ("this is
your pond right now") → the water clearing as you read the services → the koi
returning → surfacing at dawn.

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5173  (loopback only)
npm run build
npm run preview
```

## Layout

| Path | What it is |
|---|---|
| `src/story.js` | The narrative spine. Six chapters, each anchored to a DOM section, each with a `mood`. **Shared contract.** |
| `src/main.js` | Story director: maps scroll → chapter → beat, publishes CSS custom properties and drives the 3D. |
| `src/data/` | Single source of truth for services, prices, supplies and copy. Change a price here and it updates everywhere. |
| `src/three/` | The pond. `index.js` orchestrates; koi, water, environment and particles read `stage.mood`. |
| `src/sections/` | Page content. All artwork is inline SVG — no external requests. |
| `src/booking/`, `src/shop/` | Booking wizard with live quote maths, and the supplies shop. |
| `src/styles/` | `tokens.css` → `base.css` → `sections.css` → `booking.css`, in that cascade order. |
| `tools/qa/` | Local screenshot/audit harness. Drives real Chrome headless against the dev server. |

## Things a human must set before this is a real business site

- **Phone and email in `src/data/content.js` are placeholders.** The number is in
  the 555-01xx range, which is reserved for fiction and cannot ring anyone.
- **Prices in `src/data/services.js` are plausible starting figures, not the
  owner's actual rates.** Every price on the site and in the booking calculator
  reads from that one file.
- **Booking submissions go nowhere.** There is no backend; the form builds a
  `mailto:` summary. See `TODO(backend)` in `src/booking/index.js`.

## Copy rules — please read before editing text

The owner is new to ponds and koi. This site deliberately claims **no**
expertise, certifications, years of experience or fish-health diagnosis, and
carries **no** testimonials, review counts or awards. It sells what is true:
shows up on time, prices up front, does the heavy filthy work, and says plainly
what he does not know. Do not "improve" the copy by adding credentials or
social proof. See the comment at the top of `src/data/content.js`.
