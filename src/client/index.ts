// index.ts — the client half's entry: name, inject, apply, teardown.
//
// Flow on a large paste into the composer:
//   capture-phase 'paste' → text >= minChars → intercept →
//   connection.rpc.call('/api', 'pasteStore/savePaste', { args }) →
//   host writes <workspace>/pastes/<timestamp>.txt →
//   a file-path reference lands in the composer (atomic chip with a minimal
//   badge, else the text token), the full card joins the dock above the
//   composer, and a transient toast reports the outcome in the composer card's
//   own overlay seat. On any failure the original text is inserted instead —
//   user data is never lost, the paste just falls back to normal behavior.
import { DEFAULT_MIN_CHARS, PACKAGE, shared, type ComposerTarget } from './shared'
import { currentSessionId, insertTextAtCaret, isComposerTarget } from './composer'
import { insertReferenceChip, pasteReference } from './chip'
import { previewOf, registerPaste } from './registry'
import { mountPasteDock } from './dock'
import { mountSettingsRow } from './settings'
import { adoptBetterSidebar, mountSidebarHint, offerSidebarHint } from './hint'
import { applyRemoteConfig, fetchHostConfig, savePaste } from './rpc'
import { clearToastTimers, mountToastSurface, showToast } from './toast'

/** The module-table id and console prefix (dsh.client platform: web). */
const name = PACKAGE

/** Wait until the connection carrier and the sessions runtime are live. */
const inject = ['sessions', 'connection']

/** The paste listener, so the teardown effect can remove exactly it. */
let activePasteListener: ((event: ClipboardEvent) => void) | null = null

function apply(ctx: any): void {
  const sessions = ctx.sessions
  const connection = ctx.connection
  shared.connection = connection ?? null
  shared.sessions = sessions ?? null
  shared.ctx = ctx

  ctx.inject(['betterSidebar'], (sidebarCtx: any) => {
    adoptBetterSidebar(sidebarCtx.get('betterSidebar') ?? null)
    return () => adoptBetterSidebar(null)
  })

  // The host is the authority. Until its answer lands — or if it never does —
  // the documented fallback (already sitting in `minChars`) stays in force, so
  // the paste listener is never blocked on a round trip.
  if (connection) {
    fetchHostConfig(connection)
      .then((remote) => applyRemoteConfig(remote, 'host'))
      .catch((error: unknown) => {
        console.warn(
          `[${PACKAGE}] host config unavailable — keeping the ${shared.minChars}-char fallback threshold:`,
          error,
        )
      })
  }

  if (!mountToastSurface(ctx)) {
    console.warn(
      `[${PACKAGE}] toast surface unavailable — saves still work, just without the on-screen confirmation`,
    )
  }
  // Unload hygiene: pending auto-dismiss timers must not fire into the
  // disposed plugin, so they are all cancelled when this fiber tears down.
  ctx.effect(() => () => {
    clearToastTimers()
  })
  if (!mountSettingsRow(ctx)) {
    console.warn(
      `[${PACKAGE}] settings row unavailable — minChars stays adjustable via cordis.patch.yml only`,
    )
  }
  if (!mountSidebarHint(ctx)) {
    console.warn(
      `[${PACKAGE}] sidebar hint unavailable — pastes still save; only the one-shot hint is skipped`,
    )
  }
  if (!mountPasteDock(ctx)) {
    console.warn(
      `[${PACKAGE}] paste dock unavailable — pastes still save; the draft chip is the only surface`,
    )
  }
  // Unload hygiene for the module-level handles the dock reads: a disposed
  // plugin must not keep a stale facade path alive.
  ctx.effect(() => () => {
    shared.ctx = null
    shared.betterSidebarService = null
  })
  console.log(
    `[${PACKAGE}] client paste listener ready — waiting for the optional betterSidebar service`,
  )

  const onPaste = (event: ClipboardEvent): void => {
    const target = event.target
    if (!isComposerTarget(target)) return
    const clipboard = event.clipboardData
    if (!clipboard) return
    const text = clipboard.getData('text/plain')
    if (!text || text.length < shared.minChars) return

    // Hardening: if the injected services never arrived, warn loudly and
    // fall back to plain paste instead of a silent TypeError mid-listener.
    if (!sessions || !connection) {
      console.warn(
        `[${PACKAGE}] sessions/connection services unavailable — large paste falls back to raw text (check dsh.client.inject in package.json, restart dsh, hard-refresh)`,
      )
      return
    }

    // The session that owns this composer; no session means no workspace to
    // write into — plain paste. Resolved through the ONE helper, which knows
    // both lines (0.1.5 list.current, 0.1.7 slot identity).
    const sessionId = currentSessionId()
    if (sessionId === null) return

    // Intercept: the large chunk lands in a file and the composer gets
    // a path reference (attachment behavior).
    event.preventDefault()
    event.stopImmediatePropagation()

    savePaste(connection, sessionId, text)
      .then(async (result) => {
        // The head-of-text preview rides the registry (dock card) and the chip
        // label — the recognition two pastes need to tell each other apart.
        // Display only; never enters the mention or the file.
        const preview = previewOf(text)
        registerPaste(sessionId, result, preview)
        // Preferred: the composer's own atomic chip — one Backspace to remove,
        // click to preview. The helper never throws (it answers false), so the
        // catch below stays reserved for a genuine save failure.
        if (await insertReferenceChip(ctx, sessionId, result.path, result.chars, preview)) {
          console.log(
            `[${PACKAGE}] saved paste (${result.chars} chars) -> ${result.path} as an atomic reference chip`,
          )
          showToast(`已保存为 ${result.path}（${result.chars} 字符）`)
          offerSidebarHint()
          return
        }
        // Fallback: plain draft text (older dsh lines, a busy composer, or a
        // lost span race). Same mention, so the model text is identical.
        const ref = pasteReference(result.path, result.chars)
        insertTextAtCaret(target as ComposerTarget, ref)
        console.log(`[${PACKAGE}] saved paste (${result.chars} chars) -> ${result.path}`)
        showToast(`已保存为 ${result.path}（${result.chars} 字符）`)
      })
      .catch((error: unknown) => {
        // Never lose user data: on failure insert the original text — and
        // report what actually happened, rather than assuming it worked.
        console.error(`[${PACKAGE}] paste save failed, falling back to raw text:`, error)
        const inserted = insertTextAtCaret(target as ComposerTarget, text)
        showToast(
          inserted
            ? '大段粘贴保存失败，已按原样粘贴回输入框'
            : '大段粘贴保存失败，也没能自动插回输入框——内容还在剪贴板，请手动 Ctrl+V 重试',
          'error',
        )
      })
  }

  document.addEventListener('paste', onPaste, true)
  activePasteListener = onPaste
  ctx.effect(() => () => {
    if (activePasteListener !== null) {
      document.removeEventListener('paste', activePasteListener, true)
      activePasteListener = null
    }
  })
  console.log(
    `[${PACKAGE}] client paste listener attached — threshold ${DEFAULT_MIN_CHARS} chars until the host's config arrives`,
  )
}

export { name, inject, apply }
