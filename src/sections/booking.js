import { BOOKING_INTRO, BRAND } from '../data/content.js'

export function renderBooking() {
  return `
<section class="sx-section sx-book" id="book" aria-labelledby="sx-book-h">
  <div class="wrap">
    <div class="sx-section__head reveal">
      <p class="eyebrow">${BOOKING_INTRO.eyebrow}</p>
      <h2 class="sx-h2" id="sx-book-h">${BOOKING_INTRO.title}</h2>
      <p class="sx-section__lede">${BOOKING_INTRO.body}</p>
      <p class="sx-book__alt">
        Rather talk to a person?
        <a href="${BRAND.phoneHref}">${BRAND.phone}</a>, ${BRAND.hours.toLowerCase()}.
      </p>
    </div>

    <!-- Filled by src/booking/ — do not populate from sections/ -->
    <div id="booking-mount"></div>
  </div>
</section>`
}
