/**
 * SHARED CONTRACT — the small supplies shop. Read-only for feature modules.
 * Stock levels are honest: this is a one-man operation, not a warehouse.
 */
export const SUPPLY_CATEGORIES = [
  { key: 'water',  label: 'Water Care' },
  { key: 'food',   label: 'Koi Food' },
  { key: 'gear',   label: 'Gear & Parts' },
]

export const SUPPLIES = [
  { id: 'dechlor-32', icon: 'bottle-drop', category: 'water', name: 'Dechlorinator', size: '32 oz', price: 19,
    blurb: 'Kills the chlorine in tap water before it kills your fish. Treats 1,900 gal.', emoji: '💧' },
  { id: 'bacteria-qt', icon: 'bottle-culture', category: 'water', name: 'Beneficial Bacteria', size: '1 qt', price: 34,
    blurb: 'The good bugs that eat fish waste. Dose monthly in warm weather.', emoji: '🧪' },
  { id: 'test-kit', icon: 'test-vials', category: 'water', name: 'Master Test Kit', size: '5-in-1', price: 42,
    blurb: 'Ammonia, nitrite, nitrate, pH, hardness. The one tool worth owning.', emoji: '🧫' },
  { id: 'algae-fix', icon: 'algae-rock', category: 'water', name: 'Algae Control', size: '32 oz', price: 26,
    blurb: 'For string algae on rocks and walls. Pond-safe at label dose.', emoji: '🌿' },

  { id: 'pellet-5', icon: 'pellet-bag', category: 'food', name: 'Staple Koi Pellets', size: '5 lb', price: 28,
    blurb: 'Everyday floating pellet. Good protein, does not cloud the water.', emoji: '🥣' },
  { id: 'pellet-wheat', icon: 'wheat-bag', category: 'food', name: 'Cold-Water Wheatgerm', size: '5 lb', price: 32,
    blurb: 'Easier to digest under 60°F. Switch to this in autumn.', emoji: '🌾' },
  { id: 'treat-silkworm', icon: 'silkworm', category: 'food', name: 'Silkworm Treats', size: '1 lb', price: 24,
    blurb: 'Hand-feeding treat. This is how koi learn to come when you walk up.', emoji: '🍡' },

  { id: 'net-fine', icon: 'koi-net', category: 'gear', name: 'Knotless Koi Net', size: '18 in', price: 38,
    blurb: 'Soft mesh that will not strip their slime coat. Do not use a cheap one.', emoji: '🥅' },
  { id: 'pads-3', icon: 'filter-pad', category: 'gear', name: 'Filter Pads', size: '3-pack', price: 26,
    blurb: 'Universal cut-to-fit coarse pads. Rinse, do not replace, when you can.', emoji: '🧽' },
  { id: 'air-kit', icon: 'air-pump', category: 'gear', name: 'Air Pump Kit', size: 'dual outlet', price: 89,
    blurb: 'Pump, tubing and two stones. Cheapest insurance against a summer fish kill.', emoji: '🫧' },
  { id: 'thermo', icon: 'thermometer', category: 'gear', name: 'Floating Thermometer', size: '6 in', price: 12,
    blurb: 'Water temperature decides when and what to feed. Guessing is how fish die.', emoji: '🌡️' },
]

export const SHOP_POLICY = {
  pickup: 'Free drop-off on any scheduled visit.',
  shipping: 'Flat $9 statewide shipping, or free over $125.',
  note: 'I keep small stock of what people actually need. If I have not got it, I will tell you where to get it cheaper.',
}
