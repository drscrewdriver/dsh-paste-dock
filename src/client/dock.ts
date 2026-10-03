// dock.ts — the paste dock: cards ABOVE the composer in dsh's
// `conversation.input.dock` strip.
//
// Every saved paste keeps its atomic chip in the draft (that is what makes the
// mention ride the message and the transcript render it as a clickable card —
// dsh has no public send hook, so the draft stays the transport), but the FULL
// display moves up here: one card per reference with the name, the preview,
// the char count, remove and open. The dock is a PROJECTION, not a store: it
// renders exactly the references still present in the draft (Backspace on a
// badge and its card is gone), and a card's ✕ folds the mention out of the
// draft again.
import * as React from 'react'
import { PACKAGE, shared } from './shared'
import type { InputFacade, PasteEntry, PasteOccurrence } from './shared'
import { facadeOfSession, pasteSessionIdOf } from './composer'
import { claimedPaste } from './chip'
import { pastesOf } from './registry'
import { showToast } from './toast'

/** Slot `inject` hook — see the long doc on injectPasteDock below. */
export function injectPasteDock(sessionId: unknown): Record<string, unknown> {
  try {
    const facade = facadeOfSession(String(sessionId))
    if (facade === null) return {}
    return { pasteInput: facade, pasteSessionId: pasteSessionIdOf(sessionId) }
  } catch {
    return {}
  }
}

/**
 * Expanded length of one occurrence in the CLIPBOARD projection. Chips sit in
 * the draft as a single character while their mention text is longer; dsh
 * publishes the expansion here when it knows it, and the removal below needs
 * it to fold clipboard coordinates back onto the edit spans the facade
 * accepts. Anything unusable answers 1 (no expansion).
 */
function occurrenceLength(occurrence: PasteOccurrence): number {
  const length = occurrence.length
  return typeof length === 'number' && Number.isSafeInteger(length) && length > 0 ? length : 1
}

interface MentionRange {
  start: number
  end: number
  clipboardEnd: number
}

/**
 * Fold the EXPANDED coordinates of every occurrence of `mention` onto the
 * DETECT projection the edit spans address, back-to-front. Answers null
 * when the occurrence list has a shape this function cannot understand —
 * BEFORE any edit happens, so a wrong guess can never delete a wrong span.
 */
function collectMentionRanges(
  snapshot: { occurrences?: PasteOccurrence[] },
  mention: string,
): MentionRange[] | null {
  if (!Array.isArray(snapshot.occurrences)) return null
  let expansion = 0
  const ranges: MentionRange[] = []
  for (const occurrence of snapshot.occurrences) {
    if (!occurrence || typeof occurrence.offset !== 'number') return null
    const length = occurrenceLength(occurrence)
    const start = occurrence.offset - expansion
    if (occurrence.source === 'reference' && occurrence.ref === mention) {
      ranges.push({ start, end: start + 1, clipboardEnd: occurrence.offset + length })
    }
    expansion += length - 1
  }
  return ranges
}

/** One back-to-front span deletion, re-reading the revision between cuts. */
function deleteRanges(input: InputFacade, ranges: MentionRange[]): boolean {
  for (const range of ranges) {
    const current = input.state?.getSnapshot?.()
    if (!current) return false
    if (current.draft?.[range.clipboardEnd] === ' ') range.end += 1
    const applied = input.insertText?.('', {
      start: range.start,
      end: range.end,
      draftRev: current.draftRev,
    })
    if (applied !== true) {
      input.notify?.('error', 'dsh-paste-dock: 草稿已变化，未能移除该引用，请手动删除')
      return false
    }
  }
  return true
}

/**
 * Remove every occurrence of one paste mention from the draft.
 *
 * Coordinates: `occurrences` address the EXPANDED draft (the clipboard
 * projection where a chip occupies its whole mention text), while an edit span
 * addresses the DETECT projection (every chip is one character). Ranges are
 * cut back-to-front so earlier deletions can never shift later spans; a single
 * trailing space goes with the mention. The file on disk is untouched — this
 * only unwires the reference from the draft.
 */
export function removePasteReference(sessionId: string, mention: string): boolean {
  const input = facadeOfSession(sessionId)
  const snapshot = input?.state?.getSnapshot?.()
  if (!input || !snapshot) return false
  const ranges = collectMentionRanges(snapshot, mention)
  if (ranges === null || ranges.length === 0) return false
  ranges.sort((a, b) => b.start - a.start)
  return deleteRanges(input, ranges)
}

/** better-sidebar's editor opener, when the service exposes one we know. */
function betterSidebarOpener(): ((path: string) => unknown) | null {
  const service = shared.betterSidebarService as Record<string, unknown> | null
  if (service === null || typeof service !== 'object') return null
  for (const name of ['openFile', 'openPath', 'open']) {
    if (typeof service[name] === 'function') {
      return (service[name] as (path: string) => unknown).bind(service)
    }
  }
  return null
}

/** The host's authenticated system-app opener (loopback only), or null. */
function hostOpener(): ((path: string) => Promise<void>) | null {
  const connection = shared.connection as { isLoopback?: boolean } | null
  const remote = shared.ctx?.remote as any
  const remoteOpen = remote?.session?.openWorkspacePath
  if (connection?.isLoopback !== true || typeof remoteOpen !== 'function') return null
  return (path: string) =>
    Promise.resolve(remoteOpen.call(remote.session, { path })).then((result: any) => {
      if (result && result.ok === false) {
        throw new Error(result?.error?.message || '宿主拒绝打开该路径')
      }
    })
}

export function canOpenPasteFiles(): boolean {
  return betterSidebarOpener() !== null || hostOpener() !== null
}

export function openPastePath(path: string): void {
  const viaSidebar = betterSidebarOpener()
  if (viaSidebar !== null) {
    try {
      const outcome = viaSidebar(path)
      if (outcome && typeof (outcome as Promise<void>).catch === 'function') {
        ;(outcome as Promise<void>).catch(() => {
          const viaHost = hostOpener()
          if (viaHost === null) {
            showToast('better-sidebar 打开失败，且当前部署不支持系统打开', 'error')
          } else {
            viaHost(path).catch((error) =>
              showToast(`打开失败：${error?.message || error}`, 'error'),
            )
          }
        })
      }
      return
    } catch {
      // The opener threw synchronously — fall through to the host route.
    }
  }
  const viaHost = hostOpener()
  if (viaHost !== null) {
    viaHost(path).catch((error) => showToast(`打开失败：${error?.message || error}`, 'error'))
    return
  }
  showToast('点击草稿中的 📄 徽标可在侧栏预览全文')
}

/**
 * Re-render trigger: subscribe to the draft revision so a Backspace on a
 * badge re-renders the dock on the next tick. Without `state.subscribe` this
 * reads one snapshot and never fires — the dock then renders once at mount
 * (degraded, still correct), never loops.
 */
function useDraftRevision(input: InputFacade | null): void {
  const state = input?.state ?? null
  const subscribe = React.useCallback(
    (listener: () => void) =>
      typeof state?.subscribe === 'function' ? state.subscribe!(listener) : () => {},
    [state],
  )
  const getSnapshot = React.useCallback(
    () => (state ? String(state.getSnapshot?.()?.draftRev ?? '') : ''),
    [state],
  )
  React.useSyncExternalStore(subscribe, getSnapshot, () => '')
}

/**
 * The cards one dock render shows: the draft's reference occurrences joined
 * against this plugin's registry, in draft order. Pure — every guard lives
 * here so the component below stays a flat render. Null = the input shape
 * is unreadable (hide the dock), [] = readable but empty.
 */
function visiblePasteCards(
  sessionId: string,
  input: InputFacade,
): { occurrence: PasteOccurrence; item: PasteEntry }[] | null {
  const occurrences = input?.state?.getSnapshot?.()?.occurrences
  if (!Array.isArray(occurrences)) return null
  const entries = pastesOf(sessionId)
  const visible: { occurrence: PasteOccurrence; item: PasteEntry }[] = []
  for (const occurrence of occurrences) {
    const item = claimedPaste(entries, occurrence)
    if (item !== undefined) visible.push({ occurrence, item })
  }
  return visible
}

/** One saved paste, drawn as a dock card. */
function DockCard({
  sessionId,
  mention,
  item,
  canOpen,
}: {
  sessionId: string
  mention: string
  item: PasteEntry
  canOpen: boolean
}) {
  const [busy, setBusy] = React.useState(false)
  function remove(): void {
    if (busy) return
    setBusy(true)
    try {
      removePasteReference(sessionId, mention)
    } finally {
      setBusy(false)
    }
  }
  return React.createElement(
    'div',
    { className: 'dsh-pd-card' },
    React.createElement('span', { className: 'dsh-pd-icon', 'aria-hidden': 'true' }, '📄'),
    React.createElement(
      'div',
      {
        className: 'dsh-pd-meta',
        title: canOpen ? item.path : `点击草稿中的 📄 徽标可在侧栏预览（${item.path}）`,
        onClick: () => canOpen && openPastePath(item.path),
      },
      React.createElement('div', { className: 'dsh-pd-name' }, item.name),
      React.createElement(
        'div',
        { className: 'dsh-pd-sub' },
        `${item.preview ? `${item.preview}… · ` : ''}${
          item.chars === undefined ? '' : `${item.chars} 字符 · `
        }${item.path}`,
      ),
    ),
    canOpen
      ? React.createElement(
          'button',
          {
            type: 'button',
            className: 'dsh-pd-button',
            title: '打开全文',
            onClick: () => openPastePath(item.path),
          },
          '打开',
        )
      : null,
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dsh-pd-button dsh-pd-remove',
        title: '从草稿移除（文件保留在 pastes/）',
        'aria-label': `移除 ${item.name}`,
        disabled: busy,
        onClick: remove,
      },
      '×',
    ),
  )
}

/**
 * The dock itself: `conversation.input.dock` renders above the composer, so
 * this is where "the display moved out of the text" physically lands. Its
 * working parts arrive through `injectPasteDock` — any shape this cannot
 * read renders null and the paste path above is untouched.
 */
function PasteDock(props: unknown) {
  // Hooks run unconditionally (a mid-flight `dock:false` config write must
  // not change the hook count between renders); gating happens after.
  const p = (props ?? {}) as { pasteInput?: InputFacade | null; pasteSessionId?: string | null }
  const input = p.pasteInput ?? null
  const sessionId = p.pasteSessionId ?? null
  useDraftRevision(input)
  if (!shared.dockEnabled || sessionId === null || !input) return null
  const visible = visiblePasteCards(sessionId, input)
  if (visible === null || visible.length === 0) return null
  const canOpen = canOpenPasteFiles()
  return React.createElement(
    'div',
    { className: 'dsh-pd-dock' },
    visible.map(({ occurrence, item }) =>
      React.createElement(DockCard, {
        key: `${occurrence.ref}@${occurrence.offset}`,
        sessionId,
        mention: occurrence.ref as string,
        item,
        canOpen,
      }),
    ),
  )
}

/** Idempotent stylesheet: one <style> tag, keyed, removed on teardown. */
function injectDockStyles(): void {
  if (document.getElementById('dsh-pd-styles') !== null) return
  const style = document.createElement('style')
  style.id = 'dsh-pd-styles'
  style.textContent = `
.dsh-pd-dock { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 2px 8px; }
.dsh-pd-card { display: flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: 8px; font-size: 12px; line-height: 1.4; min-width: 0; width: auto; max-width: min(560px, 92%); background: rgba(255, 255, 255, 0.92); color: #1f2328; border: 1px solid rgba(31, 35, 40, 0.18); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12); backdrop-filter: blur(6px); }
@media (prefers-color-scheme: dark) { .dsh-pd-card { background: rgba(32, 33, 36, 0.92); color: #e8eaed; border-color: rgba(232, 234, 237, 0.2); } }
.dsh-pd-icon { flex: none; }
.dsh-pd-meta { flex: 0 1 auto; min-width: 0; cursor: default; }
.dsh-pd-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-pd-sub { opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-pd-button { flex: none; border: none; background: transparent; color: inherit; opacity: 0.7; cursor: pointer; font: inherit; font-size: 12px; padding: 2px 6px; border-radius: 6px; }
.dsh-pd-button:hover { opacity: 1; background: rgba(127, 127, 127, 0.2); }
.dsh-pd-remove { font-size: 14px; line-height: 1; }
.dsh-pd-button:disabled { opacity: 0.35; cursor: default; }
`
  document.head.appendChild(style)
}

/**
 * Additive entry in the composer dock strip; order 0 leads the band (the todo
 * entry also claims 0 — tie order is undefined in dsh, so this is a declared
 * intent, not a guarantee). Returns false when React or the slots service is
 * missing — saving never depends on it.
 */
export function mountPasteDock(ctx: any): boolean {
  if (React === null) return false
  const slots = ctx.get('slots')
  if (slots === undefined || typeof slots.inject !== 'function') return false
  ctx.effect(() => {
    injectDockStyles()
    return () => document.getElementById('dsh-pd-styles')?.remove()
  })
  ctx.effect(() =>
    slots.inject('conversation.input.dock', () =>
      slots.register(
        {
          name: 'conversation.input.dock',
          id: `${PACKAGE}:dock`,
          order: 0,
          registrant: PACKAGE,
          label: 'dsh-paste-dock cards',
          // The 0.1.7+ props contract: resolve the session's input facade
          // per rendered composer instead of betting on standard props.
          inject: injectPasteDock,
        },
        PasteDock,
      ),
    ),
  )
  console.log(`[${PACKAGE}] paste dock attached to conversation.input.dock (order 0)`)
  return true
}
