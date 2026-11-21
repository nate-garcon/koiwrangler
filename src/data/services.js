/**
 * SHARED CONTRACT — single source of truth for what we sell and what it costs.
 * Read-only for feature modules: never hardcode a price in a component.
 *
 * NOTE FOR MICHAEL: these are sensible starting numbers, not gospel. Change a
 * number here and it updates the services list, the booking calculator and the
 * quote total everywhere at once.
 */

/** Pond size buckets. `key` is what the booking form stores. */
export const POND_SIZES = [
  { key: 'sm',  label: 'Small',  gallons: 'up to 500 gal',      hint: 'Patio or starter pond',        multiplier: 1 },
  { key: 'md',  label: 'Medium', gallons: '500 – 1,500 gal',    hint: 'Typical backyard koi pond',    multiplier: 1.55 },
  { key: 'lg',  label: 'Large',  gallons: '1,500 – 3,000 gal',  hint: 'Big garden or small business', multiplier: 2.35 },
  { key: 'xl',  label: 'X-Large',gallons: '3,000+ gal',         hint: 'Commercial / estate — custom', multiplier: null }, // null => quote only
]

/**
 * basePrice is the price for a SMALL pond; bigger ponds scale by multiplier.
 * unit: 'visit' | 'month' | 'hour' | 'flat'
 */
export const SERVICES = [
  {
    id: 'deep-clean',
    name: 'Full Pond Deep Clean',
    tagline: 'The big one. Drain, net the fish out safe, scrub it down, refill.',
    basePrice: 275,
    unit: 'visit',
    scales: true,
    duration: '4 – 7 hours',
    includes: [
      'Fish netted out into an aerated holding tank',
      'Pond drained and muck vacuumed out',
      'Walls and rocks scrubbed of algae',
      'Filter media rinsed and pump checked',
      'Refilled and dechlorinated, fish returned',
    ],
  },
  {
    id: 'keeping',
    name: 'Monthly Pond Keeping',
    tagline: 'Two visits a month so it never gets bad in the first place.',
    basePrice: 120,
    unit: 'month',
    scales: true,
    popular: true,
    duration: '2 visits / month',
    includes: [
      'Skim leaves and surface debris',
      'Vacuum the bottom muck',
      'Rinse filters, clear the skimmer basket',
      'Water test: ammonia, nitrite, nitrate, pH',
      'Plain-English report after every visit',
      'Cancel any time — no contract',
    ],
  },
  {
    id: 'fish-move',
    name: 'Fish Move-Out & Holding',
    tagline: 'Netting koi out and back without hurting them. Add-on or standalone.',
    basePrice: 95,
    unit: 'visit',
    scales: true,
    duration: '1 – 2 hours',
    includes: [
      'Soft knotless nets only',
      'Aerated holding tank with your own pond water',
      'Temperature matched before they go back',
      'Head count in and out, so nobody goes missing',
    ],
  },
  {
    id: 'filter',
    name: 'Filter & Pump Clean-Out',
    tagline: 'Flow gone weak? Strip, clean and reseat the hardware.',
    basePrice: 140,
    unit: 'visit',
    scales: true,
    duration: '1 – 3 hours',
    includes: [
      'Pump pulled, impeller cleared',
      'Filter pads rinsed or replaced (parts at cost)',
      'UV clarifier sleeve wiped, bulb hours checked',
      'Plumbing checked for leaks and blockages',
    ],
  },
  {
    id: 'seasonal',
    name: 'Seasonal Open / Close',
    tagline: 'Spring start-up or winter shutdown, done right.',
    basePrice: 185,
    unit: 'visit',
    scales: true,
    duration: '2 – 4 hours',
    includes: [
      'Nets, heaters and aerators in or out',
      'Pumps winterized or restarted',
      'Leaf-out and bottom clean before the freeze',
      'Equipment stored where you can find it next year',
    ],
  },
  {
    id: 'emergency',
    name: 'Emergency Call-Out',
    tagline: 'Pea-green water, dead pump, overflow. Same or next day.',
    basePrice: 150,
    unit: 'flat',
    scales: false,
    urgent: true,
    duration: 'Same or next day',
    includes: [
      'Call-out fee plus hourly labour — both shown live below',
      'You get told the running total before I start',
      'Pump and plumbing triage on site',
      'If it is a fish-health problem, I will say so and tell you who to call',
    ],
  },
]

/** Travel: statewide. First 60 miles from base are free. */
export const TRAVEL = {
  freeRadiusMiles: 60,
  perMile: 0.65,
  note: 'Statewide. First 60 miles free, then $0.65/mile round trip — quoted up front, never a surprise.',
}

export const HOURLY_LABOUR = 75

/** Helper: price for a service at a pond size. Returns null when it's quote-only. */
export function priceFor(serviceId, sizeKey) {
  const svc = SERVICES.find((s) => s.id === serviceId)
  if (!svc) return null
  if (!svc.scales) return svc.basePrice
  const size = POND_SIZES.find((p) => p.key === sizeKey)
  if (!size) return svc.basePrice
  if (size.multiplier === null) return null // X-Large -> custom quote
  return Math.round((svc.basePrice * size.multiplier) / 5) * 5
}

export function formatUSD(n) {
  return n == null ? 'Custom quote' : '$' + n.toLocaleString('en-US')
}
