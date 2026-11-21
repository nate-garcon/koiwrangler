/**
 * Hand-drawn inline SVG. No external assets, no icon fonts, no stock art,
 * no emoji. Everything here is geometry authored for this site.
 *
 * DRAWING LANGUAGE — "engraved almanac line-cut", to sit with Rye + brass:
 *   - icon artboard is viewBox="0 0 32 32", live area 26x26 (3px margin),
 *     geometry snapped to a 2px sub-grid wherever the subject allows;
 *   - ONE outline weight: stroke-width 2, fill none, stroke currentColor,
 *     round caps and joins. Scale an icon with width/height ONLY, never by
 *     changing stroke-width;
 *   - permitted secondary marks: 1.25 hairlines for hatching / water / mesh,
 *     and at most ONE solid-filled element per icon (an eye, a drop, a dot)
 *     as an optical anchor;
 *   - no gradients, no two-tone, no opacity tricks. Colour is currentColor,
 *     so the caller styles it with `color`.
 */

/* ===================================================================== *
 * ICON SET
 *
 * PUBLIC API for other modules:
 *
 *   import { icon, ICONS, hasIcon } from './svg.js'
 *
 *   icon(key)                       -> 32x32 markup, class "sx-ico"
 *   icon(key, { size: 40 })         -> 40x40
 *   icon(key, { className: 'sh-ico' })
 *   icon(key, { label: 'Add to cart' })  -> role="img" + <title>, NOT
 *                                           aria-hidden; use this only when
 *                                           the icon is the sole content of
 *                                           a link or button.
 *   ICONS.watch                     -> the default 32px markup, if you would
 *                                      rather not call the helper
 *   hasIcon(key)                    -> boolean, for data-driven lookups
 *
 * Keys come straight from the data contracts:
 *   src/data/content.js   PROMISES[].icon  -> watch tag wader ledger
 *   src/data/supplies.js  SUPPLIES[].icon  -> bottle-drop bottle-culture
 *                                             test-vials algae-rock
 *                                             pellet-bag wheat-bag silkworm
 *                                             koi-net filter-pad air-pump
 *                                             thermometer
 *   category marks (SUPPLY_CATEGORIES[].key) -> cat-water cat-food cat-gear
 *
 * An unknown key renders nothing and warns in the console rather than
 * throwing, so a new data row can never white-screen the page.
 * ===================================================================== */

/** Shared sack body — pellet-bag, wheat-bag and cat-food must read as kin. */
const SACK = `
  <path d="M8.4 10.6 7 25.4Q6.8 28 9.4 28h10.2q2.6 0 2.4-2.6L20.6 10.6"/>
  <path d="M9.6 7h9.8l1.2 3.6H8.4Z"/>
  <path d="M11.2 11.2 10 27.6" stroke-width="1.25"/>`

/** key -> icon interior. Wrapped by icon() / ICONS; never used raw. */
const GEO = {
  /* ---- promises ---------------------------------------------------- */

  // Pocket watch: crown stem + ring tab at 12, hands at 7:00.
  watch: `
  <circle cx="16" cy="19" r="9.5"/>
  <path d="M16 9.5V7.2"/>
  <circle cx="16" cy="5.2" r="1.7"/>
  <path d="M25 19h-2M16 28v-2M7 19h2M16 10.4v1.8"/>
  <path d="M16 19v-4.6M16 19l-3.4 4.4"/>`,

  // Mercantile price tag: clipped rhombus, punched eyelet, knotted cord, $.
  tag: `
  <path d="M13.5 7.5h5l7 7v5l-7 7h-5l-7-7v-5Z"/>
  <circle cx="12" cy="14" r="1.5"/>
  <path d="M10.8 12.8 7.6 9.6"/>
  <path d="M7.6 9.6a2.7 2.7 0 1 1 3.1-1.7"/>
  <path d="M19.5 14c0-2.4-7-2.4-7 .6s7 1.8 7 5-7 3-7 .6"/>
  <path d="M16 11.4v12.4"/>`,

  // Wader boot, 3/4 side, waterline at the shin. "I do the filthy part."
  wader: `
  <path d="M9.4 7V19.5C9.4 22.5 8 23.5 8 25.6 8 27.4 9.2 28 10.6 28H23
           C25.6 28 26.6 26 25 24.6 23 23 20.2 22 20.2 19V7"/>
  <path d="M9.4 7C12.6 5.2 17 5.2 20.2 7"/>
  <path d="M3.4 13.6q3-1.4 6 0M20.2 13.6q4.4 1.6 8.8 0"/>
  <g stroke-width="1.25">
    <path d="M3.6 17.2h4.4M4.4 20.4h3.2M3.4 23.6h3.4"/>
    <path d="M22 17.2h6.4M22.4 20.4h6M25.8 23.6h2.8"/>
  </g>`,

  // Open ledger spread: four ruled lines left, one lonely dash right.
  ledger: `
  <path d="M4 8.4q6-2.4 12 .8 6-3.2 12-.8v15.8q-6-2.4-12 .8-6-3.2-12-.8Z"/>
  <path d="M16 9.2v15.8"/>
  <g stroke-width="1.25">
    <path d="M6.8 12.6h6.6M6.8 15.6h6.6M6.8 18.6h6.6M6.8 21.6h6.2"/>
    <path d="M19 13.6h4.2"/>
  </g>`,

  /* ---- shop: water care -------------------------------------------- */

  // Dosing bottle, tipped, one solid drop thrown clear of the neck.
  'bottle-drop': `
  <g transform="translate(2 0) rotate(32 12 18)">
    <path d="M6 11.6Q6 8 9.4 8h3.2Q16 8 16 11.6V24q0 3-3 3H9q-3 0-3-3Z"/>
    <path d="M9.4 8V5h3.2v3"/>
    <path d="M7.8 14.4h2.4M7.8 17.4h2.4" stroke-width="1.25"/>
  </g>
  <path d="M25 13.2c2 2.8 3 4.1 3 5.2a3 3 0 0 1-6 0c0-1.1 1-2.4 3-5.2Z"
        fill="currentColor" stroke="none"/>`,

  // Squat culture jar, three hatched swirls of bacteria.
  'bottle-culture': `
  <path d="M11 7.4h10v3H11Z"/>
  <path d="M11.6 10.4Q8 11.4 8 15.4V24q0 3.6 3.6 3.6h8.8Q24 27.6 24 24v-8.6q0-4-3.6-5"/>
  <g stroke-width="1.25">
    <path d="M10.8 17q2.6-2.6 5.2 0t5.2 0"/>
    <path d="M10.8 20.6q2.6-2.6 5.2 0t5.2 0"/>
    <path d="M10.8 24.2q2.6-2.6 5.2 0t5.2 0"/>
  </g>`,

  // Three test vials on a rack rail, the middle one filled to a third.
  'test-vials': `
  <path d="M6.5 9v12a2.5 2.5 0 0 0 5 0V9"/>
  <path d="M13.5 9v12a2.5 2.5 0 0 0 5 0V9"/>
  <path d="M20.5 9v12a2.5 2.5 0 0 0 5 0V9"/>
  <path d="M4 12.4h24"/>
  <path d="M13.5 19v2a2.5 2.5 0 0 0 5 0v-2Z" fill="currentColor" stroke="none"/>`,

  // Pond stone with string algae trailing off it.
  'algae-rock': `
  <path d="M5.4 25.6 7.6 18.4 12.6 14.6 19.2 15.6 23.6 20 25.8 25.6Z"/>
  <path d="M3.4 25.6h25.2"/>
  <g stroke-width="1.25">
    <path d="M12.6 14.8 15.6 20.2 24.6 23.4"/>
    <path d="M10.4 16.4C7.4 12.6 10.6 10.2 7.8 6.4"/>
    <path d="M15.8 14.8C13.6 10.6 17.2 8.6 15 4.6"/>
    <path d="M20.4 15.8C20 11.6 23.8 10.4 22.4 6.6"/>
  </g>`,

  /* ---- shop: food (one sack body, three readings) ------------------- */

  // Staple pellets: the sack, with three solid pellets spilled beside it.
  'pellet-bag': `${SACK}
  <circle cx="24.6" cy="27" r="1.5" fill="currentColor" stroke="none"/>
  <circle cx="27.6" cy="26" r="1.3" fill="currentColor" stroke="none"/>
  <circle cx="25.8" cy="23.6" r="1.3" fill="currentColor" stroke="none"/>`,

  // Wheatgerm: the SAME sack, plus an ear of wheat.
  'wheat-bag': `${SACK}
  <path d="M25.4 28V14.6"/>
  <path d="M25.4 16.8 23 14.6M25.4 16.8l2.4-2.2M25.4 20.4 23 18.2M25.4 20.4l2.4-2.2M25.4 24 23 21.8M25.4 24l2.4-2.2"/>`,

  // Silkworm treat: segmented grub, one solid eye.
  silkworm: `
  <path d="M5.4 19.6C3.6 15.2 6.4 11 12 9.6 18.4 8 25.2 9.4 27.4 13.4
           29.2 16.6 26.6 21 21 22.2 14.6 23.6 7.2 23.4 5.4 19.6Z"/>
  <g stroke-width="1.25">
    <path d="M10.8 10.4C9.4 14.6 9.6 19 11.4 22.8"/>
    <path d="M15.4 9.2C14.2 13.8 14.4 18.6 16 23.2"/>
    <path d="M20 9.2C19 13.6 19.2 18.4 20.6 22.6"/>
    <path d="M24 10.6C23.4 14.2 23.6 17.8 24.8 20.8"/>
  </g>
  <circle cx="24.4" cy="14.4" r="1.5" fill="currentColor" stroke="none"/>`,

  /* ---- shop: gear --------------------------------------------------- */

  // The hero product: a hooped knotless landing net on a pole.
  'koi-net': `
  <ellipse cx="19" cy="12" rx="9" ry="5.5" transform="rotate(-30 19 12)"/>
  <path d="M11.3 16.4 5.4 25.8"/>
  <path d="M11.2 15.4q1.4 8.6 7.8 10.2M26.8 9.6q.4 9.4-7.8 16"/>
  <g stroke-width="1.25">
    <path d="M14.4 17.2q1.6 5.4 4 7.6M18.2 16.8q.8 4.6.8 8.8M22.6 14.6q.4 5.6-2.6 10.6"/>
    <path d="M12.6 19.4q6 3.2 12.6-2.6M15 23.2q3.6 2.4 7.6 0"/>
  </g>`,

  // Filter pads: a stack seen 3/4, cut face hatched, near corner peeled.
  'filter-pad': `
  <path d="M6 14h16v10H6Z"/>
  <path d="M6 14 10 10h16l-4 4"/>
  <path d="M22 14 26 10v10l-4 4"/>
  <g stroke-width="1.25">
    <path d="M6 17.6h16M6 21h16"/>
    <path d="M22.9 16.6 25.2 14.3M22.9 19.6 25.2 17.3M22.9 22.6 25.2 20.3"/>
  </g>
  <path d="M6 14q2.6-1.6 2-4.4Q6.4 11 6 14Z"/>`,

  // Air pump: box, tube, stone, three solid bubbles rising.
  'air-pump': `
  <path d="M4 7.4h9.2v8H4Z"/>
  <path d="M6.4 10h4.4M6.4 12.4h4.4" stroke-width="1.25"/>
  <path d="M13.2 11.4q6 0 8.6 4 1.2 1.8 1.2 8.2"/>
  <path d="M18.4 24h7.6q2 0 2 2t-2 2h-7.6q-2 0-2-2t2-2Z"/>
  <circle cx="25.4" cy="20.6" r="1.4" fill="currentColor" stroke="none"/>
  <circle cx="27.2" cy="17" r="1.1" fill="currentColor" stroke="none"/>
  <circle cx="25.4" cy="13.6" r="0.9" fill="currentColor" stroke="none"/>`,

  // Floating pond thermometer: foam collar, solid bulb, four scale ticks.
  thermometer: `
  <path d="M14 6.6a2 2 0 0 1 4 0V21a2 2 0 0 1-4 0Z"/>
  <ellipse cx="16" cy="8.6" rx="6.6" ry="2.8"/>
  <path d="M19 13.4h2.6M19 16h2.6M19 18.6h2.6M19 21.2h2.6" stroke-width="1.25"/>
  <circle cx="16" cy="24.6" r="3.6" fill="currentColor" stroke="none"/>`,

  /* ---- category marks ----------------------------------------------- */

  'cat-water': `
  <path d="M16 5.6c5.4 7.4 8 11 8 13.4a8 8 0 0 1-16 0c0-2.4 2.6-6 8-13.4Z"
        fill="currentColor" stroke="none"/>`,

  'cat-food': SACK,

  'cat-gear': `
  <ellipse cx="21.6" cy="9.6" rx="7" ry="4.4" transform="rotate(-34 21.6 9.6)"/>
  <path d="M15.6 13.2 5.4 26.6"/>
  <path d="M16.2 12.8q1.6 6 6 8.4M27.4 7.6q1.4 7.6-5.6 13.6" stroke-width="1.25"/>
  <path d="M26.6 26.6 14.4 13.8"/>
  <path d="M14.4 13.8 10.6 10.2 7 11.8 5.8 8M14.4 13.8 12.6 9 8.8 8.2"/>`,
}

/** Keys an icon exists for. Handy for data-driven rendering. */
export const ICON_KEYS = Object.keys(GEO)

/** True when `key` has artwork. Use before rendering unknown data. */
export function hasIcon(key) {
  return Object.prototype.hasOwnProperty.call(GEO, key)
}

/**
 * Render one icon.
 * @param {string} key one of ICON_KEYS
 * @param {{size?: number, className?: string, label?: string}} [opts]
 *   size      square px, default 32. Changes width/height only.
 *   className default "sx-ico".
 *   label     accessible name. Pass it ONLY when the icon is the sole
 *             content of a control; otherwise the icon stays aria-hidden.
 * @returns {string} inline <svg> markup
 */
export function icon(key, { size = 32, className = 'sx-ico', label = '' } = {}) {
  if (!hasIcon(key)) {
    console.warn(`[svg] no icon for "${key}"`)
    return ''
  }
  const a11y = label
    ? `role="img" aria-label="${label}"`
    : 'aria-hidden="true" focusable="false"'
  return `
<svg class="${className}" viewBox="0 0 32 32" width="${size}" height="${size}"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" ${a11y}>${GEO[key]}
</svg>`
}

/** Every icon at its default 32px, keyed the same as the data files. */
export const ICONS = Object.fromEntries(ICON_KEYS.map((k) => [k, icon(k)]))

/* ===================================================================== *
 * BRAND MARK
 * ===================================================================== */

/**
 * Cattle-brand roundel: one continuous iron. The open ring's two ends ARE
 * the koi's tail flukes, so loop and fish are a single drawing — the thing
 * you could burn into a truck door. Legible down to 20px.
 */
export const markKoiLasso = (cls = 'sx-mark') => `
<svg class="${cls}" viewBox="0 0 64 64" width="44" height="44"
     fill="none" stroke="currentColor" stroke-width="5"
     stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true" focusable="false">
  <path d="M54.4 23.4A24 24 0 1 0 54.4 40.6"/>
  <path d="M54.4 23.4C57.6 21.6 59.4 18.6 60 15"/>
  <path d="M54.4 40.6C57.6 42.4 59.4 45.4 60 49"/>
  <path d="M53.5 32C46 21.5 38 20.5 30 20.5 22.5 20.5 16 25.5 16 33
           16 40 22.5 43.5 30 43.5 38 43.5 46.5 42.5 53.5 32Z"/>
  <path d="M28.8 21 32 14.2"/>
  <circle cx="24" cy="30" r="2.5" fill="currentColor" stroke="none"/>
</svg>`

/** Small cattle-brand style glyph: a "KW" bar brand. Decorative. */
export const markBrand = (cls = 'sx-brandmark') => `
<svg class="${cls}" viewBox="0 0 48 32" width="48" height="32" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 26V6M4 16l9-10M4 16l10 10"/>
    <path d="M22 6l5 20 5-13 5 13 5-20"/>
    <path d="M2 30h44" stroke-width="1.6" opacity="0.6"/>
  </g>
</svg>`

/** Downward chevron for the FAQ accordions. */
export const iconChevron = (cls = 'sx-chev') => `
<svg class="${cls}" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
  <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.4"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

/** Hamburger / close pair for the mobile menu button. */
export const iconMenu = () => `
<svg class="sx-burger" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
    <path d="M3 6h18M3 12h18M3 18h18"/>
  </g>
</svg>`

/** Thin arrow used on the "Scroll to dive in" hint. */
export const iconDive = () => `
<svg viewBox="0 0 24 32" width="18" height="24" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3v22"/><path d="M5 18l7 8 7-8"/>
  </g>
</svg>`

/* ===================================================================== *
 * GALLERY PLATES
 *
 * Three drawn plates standing in for photographs Michael has not taken.
 * Before and After are deliberately THE SAME DRAWING: same rim, same
 * angle, same two stones, same composition — only the water changes.
 * That is the whole point of a before/after.
 *
 * The frame is drawn by CSS (.sx-plate__frame), not here.
 * ===================================================================== */

const plateFrame = (inner) => `
<svg class="sx-plate__art" viewBox="0 0 320 220" role="img" aria-hidden="true" focusable="false"
     preserveAspectRatio="xMidYMid meet">
  ${inner}
</svg>`

/** The shared stage: coping, water edge, two stones, grass behind. */
const POND = `
  <ellipse pathLength="1" cx="160" cy="126" rx="146" ry="72" stroke-width="2.6"/>
  <ellipse pathLength="1" cx="160" cy="126" rx="126" ry="56" stroke-width="2"/>
  <g stroke-width="1.25">
    <path pathLength="1" d="M16 110 36 114M30 80 48 90M70 60 82 74M160 54v16M238 60 226 74M278 82 262 92M304 110 284 114"/>
    <path pathLength="1" d="M16 142 36 138M30 172 48 162M70 192 82 178M160 198v-16M238 192 226 178M278 170 262 160M304 142 284 138"/>
  </g>
  <path pathLength="1" d="M84 70q6-20 24-20 18 0 22 14 4 14-12 18" stroke-width="2.6"/>
  <path pathLength="1" d="M196 64q8-18 26-14 18 4 18 18 0 12-14 16" stroke-width="2.6"/>
  <g stroke-width="1.6">
    <path pathLength="1" d="M56 74q-10-18-6-32M62 76q-4-22 2-32M68 78q6-18 16-26"/>
    <path pathLength="1" d="M258 74q10-18 6-32M252 76q4-22-2-32M246 78q-6-18-16-26"/>
  </g>`

/** BEFORE — the muck: silt bed, string algae on the stones, leaf mat. */
export const plateDirtyPond = () => plateFrame(`
  <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    ${POND}
    <path pathLength="1" d="M46 150C66 172 108 182 160 182 212 182 254 172 274 150
             244 166 206 172 160 172 114 172 76 166 46 150Z"
          fill="currentColor" stroke="none"/>
    <g stroke-width="1.25">
      <path pathLength="1" d="M54 146 62 138M72 158 82 148M94 166 104 156M118 172 128 162M144 176 154 166M172 176 182 166M198 172 208 162M222 166 232 156M244 158 254 148M262 146 270 138"/>
    </g>
    <g stroke-width="1.25">
      <path pathLength="1" d="M94 88q-8 16 0 28-6 12 2 22M106 86q-6 18 2 28-4 12 4 20M116 84q-2 16 6 26"/>
      <path pathLength="1" d="M210 82q-8 14-2 26-4 12 4 20M222 80q-4 16 4 26-2 10 4 16"/>
    </g>
    <g stroke-width="1.6">
      <path pathLength="1" d="M104 126q11-11 22 0-11 11-22 0ZM128 116q12-10 22 2-12 10-22-2ZM152 130q11-11 22 0-11 11-22 0ZM176 118q12-10 22 2-12 10-22-2ZM118 142q11-11 22 0-11 11-22 0ZM146 148q12-10 22 2-12 10-22-2Z"/>
      <path pathLength="1" d="M115 126h22M139 118h22M163 130h22M187 120h20M129 142h22M157 150h22"/>
    </g>
  </g>`)

/** AFTER — same rim, same angle: silt gone, two kohaku, surface reflection. */
export const plateKoi = () => plateFrame(`
  <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    ${POND}
    <g stroke-width="1.25">
      <path pathLength="1" d="M52 112q56-16 116-8M66 160q60 14 128-2M118 92q44-8 86-2"/>
    </g>
    ${koiTop(116, 152, -14, 1.15)}
    ${koiTop(212, 108, 8, 0.95)}
  </g>`)

/**
 * One koi seen from above, with real kohaku patches (solid, not outlined).
 * Nose points right in local coords; `rot` degrees, `s` scale.
 */
function koiTop(x, y, rot, s) {
  return `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path pathLength="1" d="M-22-4q12-7 29-3 8 2 8 7t-8 7q-17 4-29-3Z" stroke-width="2.4"/>
    <path pathLength="1" d="M-22-4q-10-8-19-10 3 6 3 14-0 8-3 14 9-2 19-10" stroke-width="2.4"/>
    <path pathLength="1" d="M4 9q-3 7 2 10 5 3 9-2" stroke-width="1.4"/>
    <path pathLength="1" d="M2-9q2-6 9-6 7 0 9 4" stroke-width="1.4"/>
    <path pathLength="1" d="M4-8q9-3 16 2-7 5-15 1Z" fill="currentColor" stroke="none"/>
    <path pathLength="1" d="M-16-3q7-5 12 1-6 5-12-1Z" fill="currentColor" stroke="none"/>
    <circle pathLength="1" cx="23" cy="-2.6" r="2.1" fill="currentColor" stroke="none"/>
  </g>`
}

/** THE KIT — knotless net, scrub brush, aerated holding tank. Drawn big. */
export const plateTools = () => plateFrame(`
  <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path pathLength="1" d="M22 196 84 104" stroke-width="3"/>
    <ellipse pathLength="1" cx="104" cy="76" rx="38" ry="23" stroke-width="3" transform="rotate(-28 104 76)"/>
    <path pathLength="1" d="M80 92q6 36 30 48M138 58q6 38-28 82" stroke-width="2.4"/>
    <g stroke-width="1.25">
      <path pathLength="1" d="M90 96q10 26 20 44M104 92q6 24 8 48M120 84q4 28-10 56"/>
      <path pathLength="1" d="M84 104q32 18 62-14M96 128q20 12 42 0"/>
    </g>
    <ellipse pathLength="1" cx="238" cy="112" rx="58" ry="18" stroke-width="3"/>
    <path pathLength="1" d="M180 112v52q0 24 58 24t58-24v-52" stroke-width="3"/>
    <path pathLength="1" d="M180 126q-10 2-10 10t10 10M296 126q10 2 10 10t-10 10" stroke-width="2.4"/>
    <circle pathLength="1" cx="236" cy="116" r="4.5" stroke-width="1.6"/>
    <circle pathLength="1" cx="218" cy="110" r="3" stroke-width="1.6"/>
    <circle pathLength="1" cx="256" cy="108" r="2.4" stroke-width="1.6"/>
    <g stroke-width="1.25">
      <path pathLength="1" d="M190 148q48 14 96 0M194 168q44 12 88 0"/>
    </g>
    <path pathLength="1" d="M14 198h292" stroke-width="2.4"/>
    <path pathLength="1" d="M108 164h74v20h-74Z" stroke-width="2.8"/>
    <g stroke-width="1.6">
      <path pathLength="1" d="M116 184v12M126 184v12M136 184v12M146 184v12M156 184v12M166 184v12M176 184v12"/>
    </g>
    <path pathLength="1" d="M144 164v-14q0-8 10-8" stroke-width="2.4"/>
  </g>`)
