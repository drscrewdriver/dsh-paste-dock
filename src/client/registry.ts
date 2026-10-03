// registry.ts — per-session registry of the pastes THIS plugin created.
//
// sessionId -> Map<mention `@"pastes/x.txt"`, PasteEntry>. The dock joins this
// registry against the draft's reference occurrences, so a `@"pastes/…"`
// mention the USER typed is never claimed — the dock manages what this plugin
// made, nothing else. Mirrored into sessionStorage so a session switch (where
// dsh restores the draft as TEXT and the chip's in-memory life ends) still
// finds the card metadata on return; a full page reload keeps the mention
// functional but the dock may forget the card.
import type { PasteEntry, SavedPasteResult } from './shared'

const pasteRegistry = new Map<string, Map<string, PasteEntry>>()
const REGISTRY_KEY_PREFIX = 'dsh-pd:reg:'
// Tri-state: null = not probed yet, false = storage refused (private mode).
let sessionStorageUsable: boolean | null = null

function sessionStore(sessionId: string): string | null {
  if (sessionStorageUsable === false) return null
  try {
    if (sessionStorageUsable === null) {
      const probe = `${REGISTRY_KEY_PREFIX}__probe`
      sessionStorage.setItem(probe, '1')
      sessionStorage.removeItem(probe)
    }
    sessionStorageUsable = true
  } catch {
    sessionStorageUsable = false
    return null
  }
  return sessionStorage.getItem(`${REGISTRY_KEY_PREFIX}${sessionId}`)
}

export function pasteNameOf(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

/**
 * The head of the pasted text, collapsed to one line. This is the recognition
 * the composer badge and the dock card both carry: two pastes with nothing but
 * an identical 📄 (or a bare filename) between them are indistinguishable at a
 * glance, while their openings usually are not. DISPLAY ONLY — it never enters
 * the mention, the model text, or the file.
 */
export function previewOf(text: unknown): string {
  return String(text ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 10)
}

/** Record one saved paste so the dock can claim its mention. */
export function registerPaste(sessionId: string, result: SavedPasteResult, preview: string): void {
  if (!sessionId || !result?.path) return
  const mention = `@"${result.path}"`
  const entry: PasteEntry = {
    path: result.path,
    chars: result.chars,
    name: pasteNameOf(result.path),
    preview: typeof preview === 'string' ? preview : '',
  }
  let entries = pasteRegistry.get(sessionId)
  if (!entries) {
    entries = new Map()
    pasteRegistry.set(sessionId, entries)
  }
  entries.set(mention, entry)
  try {
    sessionStorage.setItem(`${REGISTRY_KEY_PREFIX}${sessionId}`, JSON.stringify([...entries]))
  } catch {
    // Storage refused (quota/private mode): the in-memory map still covers
    // this page life.
  }
}

/** The registry for one session, hydrated from sessionStorage once. */
export function pastesOf(sessionId: string): Map<string, PasteEntry> {
  let entries = pasteRegistry.get(sessionId)
  if (entries) return entries
  entries = new Map()
  pasteRegistry.set(sessionId, entries)
  hydrateEntries(entries, sessionId, sessionStore(sessionId))
  return entries
}

/** One mirrored registry row → a dock entry, or null when malformed. */
function parseRegistryRow(entry: unknown): PasteEntry | null {
  if (entry === null || typeof entry !== 'object') return null
  const record = entry as Record<string, unknown>
  if (typeof record.path !== 'string') return null
  return {
    path: record.path,
    chars: typeof record.chars === 'number' ? record.chars : undefined,
    name: typeof record.name === 'string' ? record.name : pasteNameOf(record.path),
    preview: typeof record.preview === 'string' ? record.preview : '',
  }
}

/**
 * Parse one sessionStorage mirror into `entries`. Corrupt or malformed rows
 * are discarded and the mirror row is dropped: the mentions in the draft stay
 * functional, only the dock misses their cards.
 */
function hydrateEntries(
  entries: Map<string, PasteEntry>,
  sessionId: string,
  raw: string | null,
): void {
  if (typeof raw !== 'string' || raw === '') return
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('registry mirror must be an entry array')
    for (const [mention, entry] of parsed as [string, unknown][]) {
      if (typeof mention !== 'string') continue
      const row = parseRegistryRow(entry)
      if (row !== null) entries.set(mention, row)
    }
  } catch {
    try {
      sessionStorage.removeItem(`${REGISTRY_KEY_PREFIX}${sessionId}`)
    } catch {
      /* already unusable */
    }
  }
}
