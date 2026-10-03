// rpc.ts — the pasteStore wire layer: one RPC caller, the save call, the
// startup config fetch, and the config adoption both callers share.
import { CONFIG_TIMEOUT_MS, PACKAGE, RPC_TIMEOUT_MS, shared, type SavedPasteResult } from './shared'

/**
 * One `pasteStore` call over the existing connection RPC, with a timeout and
 * the gateway's ok/error envelope unwrapped. The single place the wire shape
 * is known, so the callers cannot drift apart; the endpoint stays a literal at
 * each call site, so the wire name is greppable where it is used.
 */
export async function callPasteStore<T = Record<string, unknown>>(
  connection: unknown,
  endpoint: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const conn = connection as { rpc?: { call?: Function } } | null
    const result = await conn?.rpc?.call?.('/api', endpoint, { args }, controller.signal)
    if (result && result.ok && result.value) return result.value as T
    const detail =
      result && result.error ? `${result.error.code}: ${result.error.message}` : 'unknown error'
    throw new Error(`${endpoint} failed: ${detail}`)
  } finally {
    clearTimeout(timer)
  }
}

/** Call the host pasteStore service over the existing connection RPC. */
export function savePaste(
  connection: unknown,
  sessionId: string,
  text: string,
): Promise<SavedPasteResult> {
  return callPasteStore<SavedPasteResult>(
    connection,
    'pasteStore/savePaste',
    { text, sessionId },
    RPC_TIMEOUT_MS,
  )
}

/**
 * Fetch the host's effective config. The paste decision has to be synchronous
 * (`preventDefault` must run inside the paste event itself), so this runs once
 * at startup instead of at paste time; the listener always reads whichever
 * value is current.
 */
export function fetchHostConfig(connection: unknown): Promise<Record<string, unknown>> {
  return callPasteStore(connection, 'pasteStore/getConfig', {}, CONFIG_TIMEOUT_MS)
}

/**
 * Adopt a config payload from the host. Shared by the startup fetch and the
 * Settings row, so both paths validate and report identically; returns false
 * when the payload is unusable and the previous value stays in force.
 */
export function applyRemoteConfig(remote: Record<string, unknown>, origin: string): boolean {
  let usable = false
  if (
    typeof remote.minChars === 'number' &&
    Number.isInteger(remote.minChars) &&
    remote.minChars > 0
  ) {
    shared.minChars = remote.minChars
    usable = true
  } else {
    console.warn(
      `[${PACKAGE}] ${origin} sent an unusable minChars (${JSON.stringify(remote.minChars)}) — keeping the ${shared.minChars}-char threshold`,
    )
  }
  // The display switches ride the same payload but fail INDEPENDENTLY of the
  // threshold: a payload with a bad minChars still carries usable booleans,
  // and a boolean must never be rejected just because the number was off.
  // Anything but a real boolean keeps the previous value (the fallback above).
  if (typeof remote.chipBadge === 'boolean') shared.chipBadge = remote.chipBadge
  if (typeof remote.dock === 'boolean') shared.dockEnabled = remote.dock
  if (usable) {
    console.log(
      `[${PACKAGE}] config from ${origin}: minChars=${remote.minChars} (${remote.minCharsSource}), maxBytes=${remote.maxBytes}, chipBadge=${shared.chipBadge}, dock=${shared.dockEnabled}`,
    )
  }
  return usable
}
