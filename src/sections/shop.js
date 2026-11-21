export function renderShop() {
  return `
<section class="sx-section sx-shop" id="shop" aria-labelledby="sx-shop-h">
  <div class="wrap">
    <div class="sx-section__head reveal">
      <p class="eyebrow">Supplies</p>
      <h2 class="sx-h2" id="sx-shop-h">The stuff I keep on the truck</h2>
      <p class="sx-section__lede">
        Water care, koi food and the few bits of gear worth owning. Nothing here
        is exclusive &mdash; you can buy all of it yourself. It is on the site so you
        do not have to make a second trip, and so the price is visible before you ask.
      </p>
    </div>

    <!-- Filled by src/shop/ — do not populate from sections/ -->
    <div id="shop-mount"></div>
  </div>
</section>`
}
