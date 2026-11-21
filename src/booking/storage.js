/**
 * Draft persistence. One namespaced key, and every single touch of
 * localStorage is wrapped: Safari private mode throws on write, and some
 * hardened browsers throw on read too.
 */
const KEY = 'kw.booking.draft.v1'

export function loadDraft() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveDraft(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* private mode / quota — a lost draft is not worth an error */
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
