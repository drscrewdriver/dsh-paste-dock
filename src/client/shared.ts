// shared.ts — the client half's module-wide state and shared types.
//
// One mutable bag on purpose: the original monolith kept these as module-level
// `let`s, and every split module below reads the same live values (the Settings
// row writes `minChars`, the config RPC flips `chipBadge`, the latches arrive
// from slot renders). A single object survives any bundler's module handling
// with zero live-binding cleverness.

/** Console prefix and module-table id for the web client half. */
export const PACKAGE = 'dsh-paste-dock'

/** FALLBACK ONLY — the host owns the threshold over `pasteStore/getConfig`. */
export const DEFAULT_MIN_CHARS = 500
/** FALLBACK ONLY — same contract as the threshold. */
export const DEFAULT_CHIP_BADGE = true
/** FALLBACK ONLY — same contract as the threshold. */
export const DEFAULT_DOCK = true
/** RPC timeout: pastes must land quickly; failure falls back to raw text. */
export const RPC_TIMEOUT_MS = 15000
/**
 * The startup config fetch is best-effort: never stall the listener. 8000 rather
 * than 5000 because a cold start plus the FIRST RPC of the session measured
 * uncomfortably close to 5s — at 5000 the Settings row regularly lost the race
 * and rendered its failure state on a perfectly healthy host.
 */
export const CONFIG_TIMEOUT_MS = 8000
/**
 * Bound on the chip serializer. It sits ON the paste critical path: by the time
 * we await it the caller has already called preventDefault, so a serializer that
 * never settles leaves the user with no chip, no text and no message. Same order
 * of magnitude as the two bounds above — it is a local call.
 */
export const SERIALIZE_TIMEOUT_MS = 5000

/** One saved paste as the registry (and the dock) see it. */
export interface PasteEntry {
  path: string
  chars?: number
  name: string
  preview: string
}

/** The host's savePaste result, as the wire returns it. */
export interface SavedPasteResult {
  path: string
  chars: number
  bytes?: number
}

/** The composer surface a paste event fired on (textarea or contenteditable). */
export type ComposerTarget = HTMLElement & {
  isContentEditable?: boolean
  setRangeText?: (text: string, start: number, end: number, mode?: string) => void
  value?: string
  selectionStart?: number | null
  selectionEnd?: number | null
}

/** A dsh reference occurrence as the input facade publishes it. */
export interface PasteOccurrence {
  source?: unknown
  ref?: unknown
  offset?: number
  length?: number
}

/** The input facade's state snapshot — draft, revision, reference occurrences. */
export interface InputSnapshot {
  draft?: string
  draftRev?: unknown
  occurrences?: PasteOccurrence[]
}

/** Minimal structural shape of `conversation.input.for(scope)` we rely on. */
export interface InputFacade {
  state?: {
    getSnapshot?: () => InputSnapshot
    subscribe?: (listener: () => void) => () => void
  }
  insertText?: (text: string, span: { start: number; end: number; draftRev?: unknown }) => boolean
  notify?: (level: string, message: string) => void
  occurrences?: PasteOccurrence[]
  [key: string]: unknown
}

/** React as the platform seed word hands it over — present, or degraded. */
export type ReactLike = typeof import('react') | null

/**
 * The cordis plugin context, structurally. The host half calls a typed slice of
 * it; the client half only walks it with probes, so one honest `any` alias here
 * beats a fake interface that would rot with the next dsh line.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type anyCtx = any

// ---- live module state ------------------------------------------------------

export const shared = {
  /** Live threshold the paste listener reads (host authority, fallback above). */
  minChars: DEFAULT_MIN_CHARS,
  /** True: the draft chip renders as the minimal `📄` badge. */
  chipBadge: DEFAULT_CHIP_BADGE,
  /** False: the dock slot renders nothing (saving itself is unaffected). */
  dockEnabled: DEFAULT_DOCK,
  /**
   * True: this plugin intercepts NOTHING. Every paste goes straight to the
   * composer — no file, no chip, no card. The deliberate "leave me alone" switch
   * (deployment-wide), plus Shift for a one-off (see client/index.ts onPaste).
   */
  alwaysRaw: false,
  /** The connection carrier, captured in apply(). */
  connection: null as { rpc?: unknown; isLoopback?: boolean; [key: string]: unknown } | null,
  /** The sessions runtime, captured in apply(). */
  sessions: null as { scope?: unknown; list?: unknown; [key: string]: unknown } | null,
  /** The plugin context, captured in apply() for the dock's facade lookups. */
  ctx: null as anyCtx,
  /** The live better-sidebar service (null whenever it reloads or unloads). */
  betterSidebarService: null as unknown,
  /** NEVER-CLEARED latch: the inject callback passes null on every reload. */
  betterSidebarEverAdopted: false,
  /** The session identity the hint/slot latched (see composer.ts). */
  slotSessionId: null as string | null,
  /** The paired input actions latch (`{ sessionId, actions }`). */
  slotInput: null as { sessionId: string; actions: any } | null,
  /**
   * The last config payload the host CONFIRMED (written by rpc.applyRemoteConfig
   * only when the payload was usable). The Settings row renders from this on its
   * first paint, so a later failed re-read can never leave the row blank when a
   * good value was already known.
   */
  configCache: null as Record<string, unknown> | null,
}

/** The platform seed word: react may be missing — everything degrades. */
export let React: ReactLike = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  React = require('react') as ReactLike
} catch (error) {
  console.warn(`[${PACKAGE}] react unavailable — save toasts disabled:`, error)
}
