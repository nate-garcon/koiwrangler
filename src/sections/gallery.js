import { plateDirtyPond, plateKoi, plateTools } from './svg.js'

const PLATES = [
  { art: plateDirtyPond, cap: 'Before — the muck, the algae, the ditch smell' },
  { art: plateKoi, cap: 'After — clear water, fish counted back in' },
  { art: plateTools, cap: 'The kit — knotless nets, vacuum, holding tank' },
]

export function renderGallery() {
  const plates = PLATES.map((p, i) => `
    <li class="sx-plate reveal" style="--sx-i:${i}">
      <div class="sx-plate__frame">
        ${p.art()}
        <p class="sx-plate__badge">Photo pending</p>
      </div>
      <p class="sx-plate__cap">${p.cap}</p>
    </li>`).join('')

  return `
<section class="sx-section sx-gallery" id="gallery" aria-labelledby="sx-gallery-h">
  <div class="wrap">
    <div class="sx-section__head reveal">
      <p class="eyebrow">The honest gallery</p>
      <h2 class="sx-h2" id="sx-gallery-h">No photos yet, and no borrowed ones either</h2>
      <p class="sx-section__lede">
        Before / after photos land here after Michael's first few jobs. Until then
        these frames stay empty — stock pictures of someone else's pond would be a
        lie, and drawings at least admit what they are.
      </p>
    </div>
    <ul class="sx-gallery__grid">${plates}</ul>
    <p class="sx-gallery__foot rule-west">Drawn, not photographed</p>
  </div>
</section>`
}
