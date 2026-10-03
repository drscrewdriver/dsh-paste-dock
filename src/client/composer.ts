// composer.ts — the composer surface: paste-target detection, caret insertion,
// the slot latches, and the facade walk that resolves one session's input.
import { shared, type ComposerTarget, type InputFacade, type anyCtx } from './shared'

/**
 * Is this paste target the dsh composer surface?
 * dsh <= 0.1.1 rendered the composer as a <textarea>; dsh >= 0.1.5 renders
 * it as a Lexical contenteditable div. Both carry `data-phase` and sit inside
 * the input scroll wrapper ([data-input-scroll]), so key on editable-ness plus
 * those anchors instead of the tag name alone.
 */
export function isComposerTarget(target: unknown): target is ComposerTarget {
  const el = target as EventTarget | null
  if (!el || (el as Node).nodeType !== 1) return false
  const t = el as ComposerTarget
  const editable = t.tagName === 'TEXTAREA' || t.isContentEditable === true
  if (!editable) return false
  if (t.hasAttribute('data-phase')) return true
  return t.closest('[data-input-scroll]') !== null
}

/**
 * Fallback insertion for a contenteditable composer: splice a text node at
 * the live selection and emit a bubbling input event so editor listeners
 * (Lexical's beforeinput/input pipeline) stay in sync.
 */
function insertIntoContentEditable(target: ComposerTarget, text: string): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  if (!target.contains(range.commonAncestorContainer)) return false
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  try {
    target.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
    )
  } catch {
    target.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return true
}

/**
 * execCommand('insertText') — the one insertion primitive that works for
 * both the legacy <textarea> and the current contenteditable composer.
 */
function insertViaExecCommand(text: string): boolean {
  try {
    return document.execCommand('insertText', false, text) === true
  } catch {
    return false
  }
}

/**
 * Insert text at the caret. execCommand is the primary path; setRangeText
 * covers textarea/input engines without it; the Selection API covers the
 * contenteditable composer when execCommand is unavailable.
 *
 * Returns whether the text really landed. The save-failure path has to know:
 * reporting "pasted as-is" when nothing was inserted is a false promise.
 */
export function insertTextAtCaret(target: ComposerTarget, text: string): boolean {
  target.focus()
  let inserted = insertViaExecCommand(text)
  if (!inserted && typeof target.setRangeText === 'function') {
    const start = target.selectionStart ?? (target.value as string).length
    const end = target.selectionEnd ?? start
    target.setRangeText(text, start, end, 'end')
    inserted = true
  }
  if (!inserted && target.isContentEditable === true) {
    inserted = insertIntoContentEditable(target, text) === true
  }
  return inserted === true
}

/**
 * Does the mention need a separating space in front of it?
 *
 * Both of dsh's reference scans anchor on `(^|\s)`: the composer's
 * TEXT_REF_RE/FOLDER_REF_RE and the transcript's projectUserText. A chip whose
 * mention ends up glued to the character in front of it is invisible to BOTH,
 * so the paste renders as dead plain text. The character is read from the
 * composer DOM because the facade hands out draft SPANS, not draft text.
 * `true` is the fail-safe answer: an extra space is harmless, a missing
 * boundary costs the whole feature.
 */
export function needsBoundarySpace(): boolean {
  const root = document.querySelector('[data-input-scroll] [contenteditable="true"]')
  const selection = window.getSelection()
  if (root === null || selection === null || selection.rangeCount === 0) return true
  const caret = selection.getRangeAt(0)
  if (!root.contains(caret.startContainer)) return true
  const before = document.createRange()
  before.selectNodeContents(root)
  before.setEnd(caret.startContainer, caret.startOffset)
  const text = before.toString()
  if (text === '') return false
  return !/\s/u.test(text.slice(-1))
}

/**
 * The agent session on screen right now, or null when there is none.
 *
 * Two shapes across lines: dsh 0.1.5 rode the selection on the list snapshot
 * (`list.getSnapshot().current`); 0.1.7 moved the selection out of
 * ClientSessions, but every `scope: 'session'` slot component is handed the
 * Session identity as a prop instead — the hint latches it into
 * `shared.slotSessionId`, and the paste path reads THAT here.
 */
export function currentSessionId(): string | null {
  const sessions = shared.sessions as any
  const current = sessions?.list?.getSnapshot?.().current
  if (current) return String(current)
  return shared.slotSessionId
}

/**
 * Resolve the composer's insertion parts for one session, or null when any of
 * them is missing. The session PAIRING is checked first: actions latched from
 * another session can never address this one's composer.
 */
export function composerInsertion(ctx: anyCtx, sessionId: string) {
  if (shared.slotInput === null) return null
  if (shared.slotInput.sessionId !== sessionId) return null
  const input = ctx.get('conversation')?.input
  if (!input) return null
  const scope = (shared.sessions as any)?.scope?.(sessionId)
  if (!scope) return null
  return { input, scope, actions: shared.slotInput.actions }
}

/** The one scope walk, or null. */
export function sessionScopeOf(sessionId: string): any {
  return (shared.sessions as any)?.scope?.(sessionId) ?? null
}

/** The composer input facade for one resolved scope, or null. */
export function inputFacadeOf(scope: unknown): InputFacade | null {
  const conversation = shared.ctx?.get?.('conversation')
  return conversation?.input?.for?.(scope) ?? null
}

/** The one facade walk every dsh line agrees on, or null. */
export function facadeOfSession(sessionId: string): InputFacade | null {
  const scope = sessionScopeOf(sessionId)
  return scope === null ? null : inputFacadeOf(scope)
}

/** The session's input facade, or null (try/catch — scope may refuse). */
export function inputForSession(sessionId: string): InputFacade | null {
  try {
    return facadeOfSession(sessionId)
  } catch {
    return null
  }
}

/** Slot session identity → string, or null when the slot shipped none. */
export function pasteSessionIdOf(sessionId: unknown): string | null {
  return sessionId === undefined || sessionId === null ? null : String(sessionId)
}
