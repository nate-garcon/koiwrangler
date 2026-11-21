/**
 * NISHIKIGOI — what the fish in the pond actually are.
 *
 * This section is about the FISH, not about the man cleaning the pond. It
 * makes no claim about Michael's knowledge, carries no credential and no
 * testimonial (see the contract at the top of src/data/content.js), and every
 * statement in it is either plain documented history or a general fact about
 * the varieties. Nothing here is mysticism, and nothing here is a boast.
 *
 * Why it earns its place on a pond-cleaning site: it is the argument for the
 * careful handling the customer is being charged for. A fish bred over two
 * hundred years, whose whole value sits in a few millimetres of skin, is not
 * a fish you chase round a pond with a knotted net. The handling section
 * (sections/handling.js) is the other half of that sentence.
 *
 * ARTWORK: one koi silhouette path, reused six times and clipped, with the
 * markings of each variety painted inside it. Inline SVG, no external assets,
 * no emoji. Colour comes from classes in styles/sections.css so the design
 * tokens stay the single source of truth (var() inside SVG presentation
 * attributes is flaky — same reason sections/area.js does it this way).
 */

/** Koi from above: nose at the left, peduncle and forked tail at the right. */
const BODY = 'M4 14C4.9 9.2 11 5.7 19 5C29 4.1 39.4 6.7 45.6 10.7'
  + 'C50.4 8.4 55.6 4.9 60.4 2.6C58.8 7.1 58 10.7 58 14'
  + 'C58 17.3 58.8 20.9 60.4 25.4C55.6 23.1 50.4 19.6 45.6 17.3'
  + 'C39.4 21.3 29 23.9 19 23C11 22.3 4.9 18.8 4 14Z'

/**
 * The varieties the 3D pond actually swims (src/three/koi.js VARIANTS), in
 * the order a koi show would walk you through them: the two white-ground
 * classics, the black-ground pair, then the two that carry no pattern to
 * speak of.
 *
 *   key   matches the pond's variant name, so the labels overlay and this
 *         list cannot drift apart
 *   gloss plain English, not a translation, except where the translation is
 *         the name's whole meaning (kohaku, sanke, bekko)
 *   marks inline SVG painted inside the clipped body
 */
const VARIETIES = [
  {
    key: 'kohaku',
    name: 'Kohaku',
    gloss: 'Red and white',
    body: 'A white fish with red markings over the back. The oldest of the '
      + 'modern varieties and still the one most shows are won with — judged on '
      + 'how clean the white is and how definite the edges of the red are.',
    marks: `
      <rect class="sx-var__ground sx-var__g-white" width="64" height="28"/>
      <ellipse class="sx-var__hi" cx="13" cy="12" rx="6.4" ry="5.6"/>
      <ellipse class="sx-var__hi" cx="28" cy="15" rx="7.6" ry="7"/>
      <ellipse class="sx-var__hi" cx="42" cy="12" rx="5.4" ry="5"/>`,
  },
  {
    key: 'sanke',
    name: 'Taisho Sanke',
    gloss: 'Three colours',
    body: 'A kohaku carrying a few black accents on the back, and never on the '
      + 'head. It was fixed as a variety during the Taisho era, which is where '
      + 'the first half of the name comes from.',
    marks: `
      <rect class="sx-var__ground sx-var__g-white" width="64" height="28"/>
      <ellipse class="sx-var__hi" cx="14" cy="12" rx="6" ry="5.2"/>
      <ellipse class="sx-var__hi" cx="29" cy="15" rx="7" ry="6.4"/>
      <ellipse class="sx-var__hi" cx="43" cy="12" rx="5" ry="4.6"/>
      <ellipse class="sx-var__sumi" cx="22" cy="8.4" rx="2.4" ry="1.7"/>
      <ellipse class="sx-var__sumi" cx="34" cy="19.4" rx="2.1" ry="1.5"/>
      <ellipse class="sx-var__sumi" cx="46" cy="9.4" rx="1.7" ry="1.3"/>`,
  },
  {
    key: 'showa',
    name: 'Showa',
    gloss: 'Black, with red and white',
    body: 'Black underneath, with red and white laid over the top of it — '
      + 'roughly the reverse of a sanke, and usually the highest-contrast fish '
      + 'in a pond. Named for the era it appeared in.',
    marks: `
      <rect class="sx-var__ground sx-var__g-ink" width="64" height="28"/>
      <ellipse class="sx-var__hi" cx="17" cy="13" rx="7" ry="6.4"/>
      <ellipse class="sx-var__hi" cx="36" cy="15" rx="6.8" ry="6"/>
      <ellipse class="sx-var__shiro" cx="26" cy="9" rx="4" ry="3"/>
      <ellipse class="sx-var__shiro" cx="47" cy="17.4" rx="3.4" ry="2.6"/>`,
  },
  {
    key: 'utsuri',
    name: 'Utsuri',
    gloss: 'Black with one other colour',
    body: 'A black fish wearing markings of exactly one other colour — white, '
      + 'red or yellow — in bands that step along the body. The white kind, '
      + 'shiro utsuri, is the one swimming on this page.',
    marks: `
      <rect class="sx-var__ground sx-var__g-white" width="64" height="28"/>
      <path class="sx-var__sumi" d="M11 2h7.5l-4 24H7Z"/>
      <path class="sx-var__sumi" d="M26 2h8l-3.4 24h-8Z"/>
      <path class="sx-var__sumi" d="M42 2h6.5l-3 24h-6.5Z"/>`,
  },
  {
    key: 'ogon',
    name: 'Ogon',
    gloss: 'A single metallic colour',
    body: 'One metallic colour over the whole fish and no pattern at all. '
      + 'There is nothing for the eye to be distracted by, so an ogon lives or '
      + 'dies on how even its skin is.',
    marks: `
      <rect class="sx-var__ground sx-var__g-gold" width="64" height="28"/>
      <path class="sx-var__sheen" d="M9 13.4C20 11.6 34 11.6 48 13.4"/>`,
  },
  {
    key: 'bekko',
    name: 'Bekko',
    gloss: 'Tortoiseshell',
    body: 'A plain red, white or yellow fish wearing nothing but black '
      + 'stepping-stone markings down the back. They are meant to read as '
      + 'spacing rather than as a pattern.',
    marks: `
      <rect class="sx-var__ground sx-var__g-cream" width="64" height="28"/>
      <ellipse class="sx-var__sumi" cx="16" cy="10.4" rx="3" ry="2.4"/>
      <ellipse class="sx-var__sumi" cx="27" cy="16.4" rx="3.2" ry="2.5"/>
      <ellipse class="sx-var__sumi" cx="38" cy="10.6" rx="2.8" ry="2.2"/>
      <ellipse class="sx-var__sumi" cx="48" cy="15.4" rx="2.2" ry="1.8"/>`,
  },
]

/** The dated spine of the story. Three entries, all plain history. */
const TIMELINE = [
  { year: 'Early 1800s',
    text: 'In the mountain villages of Niigata, carp kept as winter food start '
      + 'throwing the odd red or patched fish. Those get held back from the pot '
      + 'and bred to each other.' },
  { year: '1914',
    text: 'Niigata fish are shown at an exposition in Tokyo. Koi keeping stops '
      + 'being a local habit and spreads across Japan.' },
  { year: 'Today',
    text: 'The same districts — Ojiya, Yamakoshi — still breed. Fish are grown '
      + 'on through the summer in big mud ponds, harvested in autumn, and graded '
      + 'hard: most of a spawning never becomes anybody’s koi.' },
]

/** One chip. `key` makes the clip-path id unique in the document. */
function koiChip(v) {
  const id = `sx-var-clip-${v.key}`
  return `
      <svg class="sx-var__chip" viewBox="0 0 64 28" width="78" height="34"
           aria-hidden="true" focusable="false">
        <defs><clipPath id="${id}"><path d="${BODY}"/></clipPath></defs>
        <g clip-path="url(#${id})">${v.marks}</g>
        <path class="sx-var__edge" d="${BODY}"/>
        <circle class="sx-var__eye" cx="9.6" cy="12.2" r="1.15"/>
      </svg>`
}

export function renderHeritage() {
  const cards = VARIETIES.map((v, i) => `
    <li class="sx-var reveal" style="--sx-i:${i}">
      ${koiChip(v)}
      <h3 class="sx-var__name">${v.name}</h3>
      <p class="sx-var__gloss">${v.gloss}</p>
      <p class="sx-var__body">${v.body}</p>
    </li>`).join('')

  const timeline = TIMELINE.map((t) => `
      <li class="sx-her__beat">
        <span class="sx-her__year">${t.year}</span>
        <span class="sx-her__beattext">${t.text}</span>
      </li>`).join('')

  return `
<section class="sx-section sx-her" id="nishikigoi" aria-labelledby="sx-her-h">
  <div class="wrap">

    <div class="sx-section__head reveal">
      <p class="eyebrow">About the fish, not about me</p>
      <h2 class="sx-h2" id="sx-her-h">Nishikigoi: two centuries of somebody choosing</h2>
      <p class="sx-section__lede">
        Koi are nishikigoi &mdash; brocaded carp. They were bred out of plain
        food carp by rice farmers in the mountains of Niigata, in northern
        Japan, and nearly everything you like about the fish in your pond is
        the result of generations of people deciding which ones to keep.
      </p>
    </div>

    <div class="sx-her__grid">
      <div class="sx-her__prose reveal">
        <p>
          The ponds came first. Terraced rice needs irrigation water, and those
          ponds were stocked with common carp as a crop to eat through a long
          snowed-in winter. From the early 1800s the farmers up there began
          keeping back the fish that came out red, or white, or patched, and
          breeding them together. Colour was the only thing being selected for.
          Body shape, the way a pattern sits on the back, the finish of the
          skin &mdash; all of that came later, out of the same slow habit of
          keeping the best fish and passing it on.
        </p>
        <p>
          The vocabulary is worth knowing, because it is the vocabulary the
          varieties are named in: <em>hi</em> is the red, <em>sumi</em> is the
          black, <em>shiro</em> is the white. A variety is a particular
          arrangement of those over a particular ground colour, and a fish is
          judged on the pattern, the body and the quality of the skin &mdash;
          not just on being pretty.
        </p>
        <p>
          Which is why a koi is not a goldfish with better paint. A young fish
          of decent parentage runs into the hundreds of dollars; a finished
          show fish can be worth more than the car on the driveway, and the top
          auctions in Japan reach numbers that make the news. All of that value
          sits in a few millimetres of skin &mdash; and skin is the part a net
          touches.
        </p>
      </div>

      <ol class="sx-her__time reveal">${timeline}</ol>
    </div>

    <ul class="sx-her__vars" aria-label="Koi varieties swimming on this page">${cards}</ul>

    <p class="sx-her__foot rule-west">These are the patterns the pond draws</p>
  </div>
</section>`
}
