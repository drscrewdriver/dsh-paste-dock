// hint.ts — better-sidebar presence, the one-shot sidebar hint, and the
// settings-visible state both key off. React components + slot mounting.
import * as React from 'react'
import { PACKAGE, shared, type anyCtx } from './shared'

// betterSidebarEverAdopted is the NEVER-CLEARED latch: the inject callback
// runs with null on every reload, so "absent right now" cannot tell "never
// installed" from "reloading" — the one-shot hint and the settings row key
// off THIS, not off the live reference (shared.betterSidebarService).

// The one-shot sidebar hint: D1 semantics, i.e. showing it once counts as seen,
// so it never nags twice. The General-settings row stays as the place to look
// the situation up later, which is why silencing the hint costs nothing.
const SIDEBAR_HINT_KEY = 'dsh-paste-dock:sidebar-hint'
// null = not read yet, so a denied storage is probed exactly once per page.
let sidebarHintSeen: boolean | null = null

/** Has the one-shot hint been shown already? Cached — the hint re-renders often. */
function readSidebarHint(): boolean {
  if (sidebarHintSeen === null) {
    try {
      sidebarHintSeen = window.localStorage.getItem(SIDEBAR_HINT_KEY) === '1'
    } catch (error) {
      // Private mode / disabled storage throws on access. The in-memory flag
      // still keeps this page quiet; the cost is one extra showing per reload.
      console.warn(`[${PACKAGE}] localStorage unavailable — the sidebar hint may return:`, error)
      sidebarHintSeen = false
    }
  }
  return sidebarHintSeen
}

/** Remember that the hint has been shown. Best effort: storage may be denied. */
function markSidebarHintSeen(): void {
  if (sidebarHintSeen === true) return
  sidebarHintSeen = true
  try {
    window.localStorage.setItem(SIDEBAR_HINT_KEY, '1')
  } catch (error) {
    console.warn(`[${PACKAGE}] could not persist the sidebar hint state:`, error)
  }
}

// What the sidebar surfaces re-render on: whether the optional integration was
// ever adopted, and whether the one-shot hint is currently wanted. ONE snapshot
// object, replaced only when a value really changes (a fresh object per render
// would make useSyncExternalStore loop forever).
let sidebarState = { adopted: false, hintWanted: false }
const sidebarListeners = new Set<() => void>()
export function publishSidebar(next: { adopted?: boolean; hintWanted?: boolean }): void {
  const merged = { ...sidebarState, ...next }
  if (merged.adopted === sidebarState.adopted && merged.hintWanted === sidebarState.hintWanted) {
    return
  }
  sidebarState = merged
  for (const listener of sidebarListeners) listener()
}
export const subscribeSidebar = (listener: () => void) => {
  sidebarListeners.add(listener)
  return () => {
    sidebarListeners.delete(listener)
  }
}
export const readSidebar = () => sidebarState

// The one-shot sidebar annotation — everything the pill left behind.
const HINT_CSS = [
  '.dsh-paste-dock-hint{position:absolute;left:50%;transform:translateX(-50%);bottom:40px;display:flex;',
  'align-items:center;gap:6px;padding:2px 8px;border-radius:8px;',
  'max-width:min(100%,var(--dsh-composer-card-max-width,640px));',
  'font-size:11px;line-height:16px;white-space:nowrap;pointer-events:auto;',
  'background:var(--dsw-alias-bg-layer-1,rgba(28,28,30,.72));',
  'color:var(--dsw-alias-label-primary,#f5f5f5);opacity:.85}',
  '.dsh-paste-dock-hint-text{min-width:0;overflow:hidden;text-overflow:ellipsis}',
  '.dsh-paste-dock-hint-close{flex:none;padding:0 4px;border:0;border-radius:999px;font:inherit;font-size:11px;',
  'cursor:pointer;background:transparent;color:inherit;opacity:.7}',
  '.dsh-paste-dock-hint-close:hover{opacity:1}',
].join('')

// The one-shot copy. ONE short line on purpose. It names the plugin rather
// than an install command: the install recipe is three profile-bound commands,
// which an annotation cannot carry without turning into noise.
const SIDEBAR_HINT_TEXT = '没装 dsh-better-sidebar（官方侧栏能看，装了能直接编辑）'

/**
 * Should the one-shot "no sidebar" hint be offered? It fires for a paste that
 * landed as an atomic chip, and only while the integration was NEVER there
 * (see the never-cleared latch above).
 */
function shouldOfferSidebarHint(): boolean {
  if (shared.betterSidebarEverAdopted) return false
  return !readSidebarHint()
}

/** Raise the one-shot hint. The slot marks it seen once it actually renders. */
export function offerSidebarHint(): void {
  if (!shouldOfferSidebarHint()) return
  publishSidebar({ hintWanted: true })
}

/** The one-shot annotation itself; rendering marks it seen (D1). */
function SidebarHint(props: unknown) {
  const { hintWanted } = React.useSyncExternalStore(subscribeSidebar, readSidebar)
  const [open, setOpen] = React.useState(false)
  // dsh 0.1.7 delivers the Session identity through these props; latch it for
  // the paste path (shared.slotSessionId). An effect, not a render-time write:
  // render stays free of side effects, and the latch is idempotent.
  const p = (props ?? {}) as { sessionId?: unknown; inputActions?: unknown }
  const offeredSession = p.sessionId
  const offeredActions = p.inputActions
  React.useEffect(() => {
    if (offeredSession === undefined || offeredSession === null) return
    shared.slotSessionId = String(offeredSession)
    // Paired latch: the actions belong to the session they were rendered for,
    // so a session switch cannot leave them addressable by the new one.
    shared.slotInput =
      offeredActions === undefined || offeredActions === null
        ? null
        : { sessionId: shared.slotSessionId, actions: offeredActions }
  }, [offeredSession, offeredActions])
  // D1: showing it counts as seen. Latched inside an effect, never during
  // render — a render-time write is a side effect and would run twice under
  // StrictMode.
  React.useEffect(() => {
    if (!hintWanted) return
    markSidebarHintSeen()
    setOpen(true)
  }, [hintWanted])
  if (!hintWanted || !open) return null
  return React.createElement(
    'div',
    { className: 'dsh-paste-dock-hint' },
    React.createElement('span', { className: 'dsh-paste-dock-hint-text' }, SIDEBAR_HINT_TEXT),
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dsh-paste-dock-hint-close',
        title: '知道了，不再提示',
        onClick: () => setOpen(false),
      },
      '×',
    ),
  )
}

/**
 * Additive entry in the composer overlay (an ambient annotation over the
 * composer card). Returns false when the surface is unavailable.
 */
export function mountSidebarHint(ctx: anyCtx): boolean {
  if (React === null) return false
  const slots = ctx.get('slots')
  if (slots === undefined || typeof slots.inject !== 'function') return false
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = HINT_CSS
    document.head.appendChild(style)
    return () => style.remove()
  })
  ctx.effect(() =>
    slots.inject('conversation.input.overlay', () =>
      slots.register(
        {
          name: 'conversation.input.overlay',
          // A DISTINCT id: the toast lives in this same slot, and a list slot
          // throws when a second entry reuses an id at the same priority.
          id: `${PACKAGE}:hint`,
          order: 90,
          label: 'dsh-paste-dock sidebar hint',
        },
        SidebarHint,
      ),
    ),
  )
  return true
}

/**
 * Note whether the OPTIONAL betterSidebar service is around. A one-shot
 * `ctx.get()` at activation is NOT enough: a service provided by a
 * later-activating plugin is simply not there yet (measured).
 *
 * The live service IS kept (the dock card's open action prefers its editor);
 * the never-cleared latch drives the one-shot hint and the settings row.
 */
export function adoptBetterSidebar(service: unknown): void {
  // Latch on the REAL service only: the dispose path passes null on every
  // reload, and a null there must never look like "was never installed".
  if (service !== null) shared.betterSidebarEverAdopted = true
  shared.betterSidebarService = service
  console.log(`[${PACKAGE}] betterSidebar ${service === null ? 'gone' : 'present'}`)
  // The settings row must re-render so its status line appears (or disappears)
  // with the service, and useSyncExternalStore compares snapshot identity.
  publishSidebar({ adopted: shared.betterSidebarEverAdopted })
}
