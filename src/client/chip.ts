// chip.ts — the saved-paste reference: the composer's own atomic chip, else
// the text token. The chip payload, its serializer probe, and the ordinal
// counter for multiple pastes all live here.
import { PACKAGE, shared, type anyCtx } from './shared'
import { composerInsertion, inputForSession, needsBoundarySpace } from './composer'
import { pastesOf } from './registry'
import type { PasteEntry } from './shared'

/**
 * The reference line we drop into the composer. ONE source: the removal path
 * searches for exactly this string, so a second copy anywhere would silently
 * break anything that depends on it.
 *
 * FALLBACK FORM. The preferred insertion is the composer's own ATOMIC chip
 * (see insertReferenceChip). This text token is what a deployment without that
 * facade gets, or what a refused edit falls back to; it is plain draft text in
 * the composer and becomes the clickable chip once SENT.
 *
 * The shape is dsh's OWN reference grammar — a quoted `@"<path>"` token, zero
 * request tokens (dsh-file-reference): the transcript renderer scans user text
 * for it and turns it into a clickable file chip; the model reads the file
 * itself.
 *
 * The LEADING SPACE is load-bearing, not cosmetic. That scan accepts a token
 * only at the draft start or after whitespace (`(^|\s)`), so a paste dropped
 * straight after a word would stay dead text.
 *
 * The count stays OUTSIDE the token: it must not be swallowed by the quoted
 * path. `chars` counts UTF-16 code units — the unit is frozen: references
 * already sitting in old messages show numbers computed this way.
 */
export function pasteReference(path: string, chars: number): string {
  return ` @"${path}" (${chars} 字符)`
}

/** The chip payload for one saved paste (see the module doc in the tests). */
export function referenceChipOf(path: string, chars: number, seq?: number, preview?: string) {
  const mention = `@"${path}"`
  const name = path.split('/').filter(Boolean).at(-1) ?? path
  // Badge numbering (seq > 1) is the multiple-paste answer: identical `📄`
  // badges would be indistinguishable in the draft, so the second, third, …
  // paste carries its ordinal. The opening preview (头部几个字 + …) is the
  // content-level recognition ON TOP of the ordinal. Both are DISPLAY-only.
  const badge = seq === undefined || seq <= 1 ? '📄' : `📄${seq}`
  const marked = preview === undefined || preview === '' ? badge : `${badge} ${preview}…`
  return {
    source: 'reference',
    ref: mention,
    // Badge mode (the deployment default): the draft shows the smallest
    // possible atomic mark and the dock above the composer carries the full
    // card — filename, char count, path, remove, open. The label is DISPLAY
    // only either way; everything downstream (serialize → bare mention, the
    // draft text projection below) is identical in both modes.
    label: shared.chipBadge ? marked : `${name} · ${chars} 字符`,
    appearance: 'file',
    // NOT the bare mention: this string IS the draft projection, and dsh
    // persists exactly that as the session draft — so after a session switch
    // the chip returns as TEXT. Carrying the size keeps that text as
    // informative as the badge-less form. The model still gets the bare
    // mention: at send time the send path replaces this whole span with
    // `serializeReference`.
    clipboardText: pasteReference(path, chars).trimStart(),
  }
}

/**
 * The ordinal for the NEXT badge in this draft: one plus the count of paste
 * chips already present. Multiple pastes must stay distinguishable in the
 * draft itself — identical `📄` badges would not be. Unreadable state
 * answers 1: the first badge never shows a number.
 */
export function pasteSeqOf(sessionId: string): number {
  const input = inputForSession(sessionId)
  const occurrences = input?.state?.getSnapshot?.()?.occurrences
  if (!Array.isArray(occurrences)) return 1
  const entries = pastesOf(sessionId)
  let count = 0
  for (const occurrence of occurrences) {
    if (claimedPaste(entries, occurrence) !== undefined) count += 1
  }
  return count + 1
}

/**
 * One draft occurrence joined against the registry, or undefined when this
 * plugin does not claim it (not a reference occurrence, not one of ours).
 */
export function claimedPaste(
  entries: Map<string, PasteEntry>,
  occurrence: unknown,
): PasteEntry | undefined {
  const occ = occurrence as { source?: unknown; ref?: unknown } | null
  if (!occ || typeof occ.ref !== 'string') return undefined
  if (occ.source !== 'reference') return undefined
  return entries.get(occ.ref)
}

/**
 * Insert the saved paste as the composer's OWN atomic reference chip, so the
 * draft reads like dsh's own attachments instead of a path with a pill over it.
 *
 * What the chip buys, all of it dsh's own behaviour rather than ours: the node
 * is a Lexical DECORATOR, so arrows step over it and Backspace/Delete remove
 * it WHOLE; it renders `label`; and a click routes to the source's
 * `openReference`, which previews the current file contents in the Sidebar.
 *
 * Every piece is PROBED, never assumed, and the serializer probe is the
 * load-bearing one: a chip whose source has no registered serializer makes the
 * message unsendable ("no serializer for reference source"), which is far
 * worse than a plain-text reference. Missing facade, stale session, refused
 * edit or a throw all answer false, and the caller keeps the text path.
 */
export async function insertReferenceChip(
  ctx: anyCtx,
  sessionId: string,
  path: string,
  chars: number,
  preview?: string,
): Promise<boolean> {
  const parts = composerInsertion(ctx, sessionId)
  if (parts === null) return false
  const chip = referenceChipOf(path, chars, pasteSeqOf(sessionId), preview)
  try {
    // The submit path reads the same registry this asks, so a string answer is
    // the exact capability proof that sending will not throw later.
    const controller = ctx.get('inputTriggers')?.sessionOf?.(parts.scope)
    const signal = new AbortController().signal
    const modelText = await controller?.serializeReference?.('reference', chip.ref, signal)
    if (typeof modelText !== 'string') return false
    const composer = parts.input.for(parts.scope)
    // Put a real space into the draft when the caret follows a non-space (see
    // needsBoundarySpace). It has to be a CHARACTER of its own, never part of
    // the chip: the chip's span is replaced by the bare mention at send time.
    if (needsBoundarySpace() && typeof composer.insertText === 'function') {
      composer.insertText(' ', parts.actions.captureInsertion())
    }
    // Re-captured AFTER that edit: the space moved the draft revision, and
    // `insertReference` CAS-checks the span it is handed.
    const span = parts.actions.captureInsertion()
    return composer.insertReference(chip, span) === true
  } catch (error) {
    console.warn(
      `[${PACKAGE}] atomic reference chip unavailable, using the text reference instead:`,
      error,
    )
    return false
  }
}
