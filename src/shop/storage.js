/** Cart persistence. One namespaced key; every access guarded (private mode throws). */
const KEY = 'kw.cart.v1'

export function loadCart() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCart(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    /* ignore */
  }
}

export function clearCart() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
