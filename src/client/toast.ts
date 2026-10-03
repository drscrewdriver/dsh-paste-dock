// toast.ts — the transient save toast, in dsh's own composer overlay seat.
import * as React from 'react'
import { PACKAGE, type anyCtx } from './shared'

/** How long one toast stays on screen. */
const TOAST_MS = 2600

// Live auto-dismiss timers. Collected so teardown can cancel them: a timer
// that survives unload would fire into a disposed plugin.
const toastTimers = new Set<ReturnType<typeof setTimeout>>()

// Snapshot handed to useSyncExternalStore: a NEW array only when it changes,
// the same reference otherwise (otherwise uSES re-renders forever).
interface ToastEntry {
  id: number
  text: string
  level: 'error' | 'info'
}
let toastList: ToastEntry[] = []
let toastSeq = 0
const toastListeners = new Set<() => void>()
const publishToasts = () => {
  for (const listener of toastListeners) listener()
}
const subscribeToasts = (listener: () => void) => {
  toastListeners.add(listener)
  return () => {
    toastListeners.delete(listener)
  }
}
const readToasts = () => toastList

/** Show one transient line in dsh's frame-wide overlay; auto-dismisses. */
export function showToast(text: string, level?: string): void {
  const id = (toastSeq += 1)
  toastList = [...toastList, { id, text, level: level === 'error' ? 'error' : 'info' }]
  publishToasts()
  const timer = setTimeout(() => {
    toastTimers.delete(timer)
    toastList = toastList.filter((entry) => entry.id !== id)
    publishToasts()
  }, TOAST_MS)
  toastTimers.add(timer)
}

/** Cancel every pending auto-dismiss (unload hygiene — see index.ts). */
export function clearToastTimers(): void {
  for (const timer of toastTimers) clearTimeout(timer)
  toastTimers.clear()
}

// The seat is dsh's own: `conversation.input.overlay` renders inside the
// composer card's zero-height anchor strip — dsh ships
// `.uV2eYG_overlayAnchor{height:0;position:absolute;inset:0 0 auto}`, i.e. a
// full-width strip pinned to the card's TOP edge. The only placement we add
// is inside that strip: pinned to its bottom edge (= the card's top edge)
// and growing upward, which floats the bubble just above the composer —
// where dsh's shipped input-bar toast sits. No invented screen coordinates:
// the card owns the horizontal position and the width.
const TOAST_CSS = [
  '.dsh-paste-dock-toasts{position:absolute;left:0;right:0;bottom:8px;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}',
  '.dsh-paste-dock-toast{box-sizing:border-box;max-width:100%;padding:8px 14px;border-radius:999px;',
  'border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35));',
  'background:var(--dsw-alias-bg-layer-1,rgba(28,28,30,.94));',
  'color:var(--dsw-alias-label-primary,#f5f5f5);font-size:13px;line-height:18px;',
  'box-shadow:0 6px 24px rgba(0,0,0,.18);animation:dsh-paste-dock-toast-in .16s ease-out}',
  '.dsh-paste-dock-toast-error{border-color:var(--dsw-alias-state-error-primary,#e5484d);',
  'color:var(--dsw-alias-state-error-primary,#e5484d)}',
  '@keyframes dsh-paste-dock-toast-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
].join('')

/** The overlay occupant: renders whatever the store currently holds. */
function ToastHost() {
  const items = React.useSyncExternalStore(subscribeToasts, readToasts)
  if (items.length === 0) return null
  return React.createElement(
    'div',
    { className: 'dsh-paste-dock-toasts' },
    items.map((entry) =>
      React.createElement(
        'div',
        {
          key: entry.id,
          role: 'status',
          className: `dsh-paste-dock-toast${entry.level === 'error' ? ' dsh-paste-dock-toast-error' : ''}`,
        },
        entry.text,
      ),
    ),
  )
}

/**
 * Best-effort toast surface: an additive entry in the composer card's own
 * overlay seat (`conversation.input.overlay`, replaceRisk "none" — a fresh
 * id sits BESIDE the shipped entries, never replacing them).
 *
 * Returns false when the surface is unavailable, in which case saves still
 * work and merely go unreported.
 */
export function mountToastSurface(ctx: anyCtx): boolean {
  if (React === null) return false
  const slotsService = ctx.get('slots')
  if (slotsService === undefined || typeof slotsService.inject !== 'function') return false
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = TOAST_CSS
    document.head.appendChild(style)
    return () => style.remove()
  })
  ctx.effect(() =>
    slotsService.inject('conversation.input.overlay', () =>
      slotsService.register(
        {
          name: 'conversation.input.overlay',
          id: PACKAGE,
          order: 100,
          label: 'dsh-paste-dock toasts',
        },
        ToastHost,
      ),
    ),
  )
  return true
}
