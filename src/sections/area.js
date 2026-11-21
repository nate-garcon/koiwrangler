import { AREA } from '../data/content.js'
import { TRAVEL } from '../data/services.js'

/**
 * Abstract radius diagram — deliberately NOT a real map.
 * Colours come from classes styled in sections.css so the tokens stay the
 * single source of truth (var() inside SVG presentation attributes is flaky).
 */
function radiusDiagram() {
  return `
<svg class="sx-ring" viewBox="0 0 360 300" role="img"
     aria-label="Diagram: a free travel ring around Michael's base, inside a wider statewide ring."
     focusable="false" preserveAspectRatio="xMidYMid meet">
  <defs>
    <radialGradient id="sx-ring-fill" cx="50%" cy="50%" r="50%">
      <stop class="sx-ring__stop-a" offset="0%"/>
      <stop class="sx-ring__stop-b" offset="100%"/>
    </radialGradient>
  </defs>

  <circle class="sx-ring__wide" cx="180" cy="150" r="132"/>
  <circle class="sx-ring__mid"  cx="180" cy="150" r="104"/>
  <circle class="sx-ring__free" cx="180" cy="150" r="70" fill="url(#sx-ring-fill)"/>

  <circle class="sx-ring__base"  cx="180" cy="150" r="7"/>
  <circle class="sx-ring__halo"  cx="180" cy="150" r="13"/>

  <g class="sx-ring__spoke">
    <path d="M180 150H250"/><path d="M250 143v14"/><path d="M180 143v14"/>
  </g>
  <path class="sx-ring__spoke-out" d="M250 150h62"/>

  <g class="sx-ring__pins">
    <circle cx="128" cy="104" r="4"/><circle cx="226" cy="196" r="4"/>
    <circle cx="150" cy="202" r="4"/><circle cx="238" cy="106" r="4"/>
    <circle cx="96"  cy="186" r="4"/><circle cx="268" cy="152" r="4"/>
    <circle cx="180" cy="46"  r="4"/><circle cx="92"  cy="92"  r="4"/>
    <circle cx="276" cy="238" r="4"/><circle cx="110" cy="252" r="4"/>
  </g>
</svg>`
}

export function renderArea() {
  return `
<section class="sx-section sx-area" id="area" aria-labelledby="sx-area-h">
  <div class="wrap sx-area__grid">

    <div class="sx-area__copy reveal">
      <p class="eyebrow">${AREA.eyebrow}</p>
      <h2 class="sx-h2" id="sx-area-h">${AREA.title}</h2>
      <p>${AREA.body}</p>
      <ul class="sx-area__legend">
        <li class="sx-area__key sx-area__key--base">
          <strong>Base</strong>
          <span>Where the truck starts the day</span>
        </li>
        <li class="sx-area__key sx-area__key--free">
          <strong>First ${TRAVEL.freeRadiusMiles} miles &mdash; free</strong>
          <span>No travel charge at all inside this ring</span>
        </li>
        <li class="sx-area__key sx-area__key--wide">
          <strong>Statewide beyond</strong>
          <span>$${TRAVEL.perMile.toFixed(2)} per mile round trip, in the quote before you agree</span>
        </li>
      </ul>
    </div>

    <figure class="sx-area__fig reveal">
      ${radiusDiagram()}
      <figcaption class="sx-area__cap">
        Not to scale, and not a map &mdash; just how the travel charge works.
      </figcaption>
    </figure>

  </div>
</section>`
}
