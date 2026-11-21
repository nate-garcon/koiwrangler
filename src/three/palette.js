/**
 * palette.js — the hero's colours, mirrored from src/styles/tokens.css.
 * Kept as hex numbers so they can go straight into THREE.Color.
 * If tokens.css changes, change these to match (we must not edit that file).
 */
export const PALETTE = {
  night900: 0x060d15,
  night800: 0x0a1420,
  night700: 0x0e1e2e,
  night600: 0x13293c,
  night500: 0x1b3a52,

  brass300: 0xe8c879,
  brass400: 0xd8a94a,
  brass500: 0xc9922f,

  koiOrange: 0xe8692a,
  koiRed: 0xc2342a,
  koiWhite: 0xf7f3ee,
  koiInk: 0x1a1512,

  leather700: 0x432914,
  moon: 0x9fb3c4,

  // Fog / water endpoints: above the surface vs. deep under it.
  fogAbove: 0x0a1420,
  fogUnder: 0x0d2334
}

/** `#rrggbb` string for canvas 2D work. */
export function css (hex) {
  return '#' + hex.toString(16).padStart(6, '0')
}
