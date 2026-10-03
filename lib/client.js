window.__ModuleLoader__.load({ id: "dsh-paste-dock", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") {
		for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
			key = keys[i];
			if (!__hasOwnProp.call(to, key) && key !== except) {
				__defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
		}
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react, 1);

//#region src/client/shared.ts
/** Console prefix and module-table id for the web client half. */
const PACKAGE = "dsh-paste-dock";
/** FALLBACK ONLY — the host owns the threshold over `pasteStore/getConfig`. */
const DEFAULT_MIN_CHARS = 500;
/** FALLBACK ONLY — same contract as the threshold. */
const DEFAULT_CHIP_BADGE = true;
/** FALLBACK ONLY — same contract as the threshold. */
const DEFAULT_DOCK = true;
/** RPC timeout: pastes must land quickly; failure falls back to raw text. */
const RPC_TIMEOUT_MS = 15e3;
/** The startup config fetch is best-effort: never stall the listener. */
const CONFIG_TIMEOUT_MS = 5e3;
const shared = {
	/** Live threshold the paste listener reads (host authority, fallback above). */
	minChars: 500,
	/** True: the draft chip renders as the minimal `📄` badge. */
	chipBadge: true,
	/** False: the dock slot renders nothing (saving itself is unaffected). */
	dockEnabled: true,
	/** The connection carrier, captured in apply(). */
	connection: null,
	/** The sessions runtime, captured in apply(). */
	sessions: null,
	/** The plugin context, captured in apply() for the dock's facade lookups. */
	ctx: null,
	/** The live better-sidebar service (null whenever it reloads or unloads). */
	betterSidebarService: null,
	/** NEVER-CLEARED latch: the inject callback passes null on every reload. */
	betterSidebarEverAdopted: false,
	/** The session identity the hint/slot latched (see composer.ts). */
	slotSessionId: null,
	/** The paired input actions latch (`{ sessionId, actions }`). */
	slotInput: null
};
/** The platform seed word: react may be missing — everything degrades. */
let React = null;
try {
	React = require("react");
} catch (error) {
	console.warn(`[${PACKAGE}] react unavailable — save toasts disabled:`, error);
}

//#endregion
//#region src/client/composer.ts
/**
* Is this paste target the dsh composer surface?
* dsh <= 0.1.1 rendered the composer as a <textarea>; dsh >= 0.1.5 renders
* it as a Lexical contenteditable div. Both carry `data-phase` and sit inside
* the input scroll wrapper ([data-input-scroll]), so key on editable-ness plus
* those anchors instead of the tag name alone.
*/
function isComposerTarget(target) {
	const el = target;
	if (!el || el.nodeType !== 1) return false;
	const t = el;
	if (!(t.tagName === "TEXTAREA" || t.isContentEditable === true)) return false;
	if (t.hasAttribute("data-phase")) return true;
	return t.closest("[data-input-scroll]") !== null;
}
/**
* Fallback insertion for a contenteditable composer: splice a text node at
* the live selection and emit a bubbling input event so editor listeners
* (Lexical's beforeinput/input pipeline) stay in sync.
*/
function insertIntoContentEditable(target, text) {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return false;
	const range = selection.getRangeAt(0);
	if (!target.contains(range.commonAncestorContainer)) return false;
	range.deleteContents();
	const node = document.createTextNode(text);
	range.insertNode(node);
	range.setStartAfter(node);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
	try {
		target.dispatchEvent(new InputEvent("input", {
			bubbles: true,
			inputType: "insertText",
			data: text
		}));
	} catch {
		target.dispatchEvent(new Event("input", { bubbles: true }));
	}
	return true;
}
/**
* execCommand('insertText') — the one insertion primitive that works for
* both the legacy <textarea> and the current contenteditable composer.
*/
function insertViaExecCommand(text) {
	try {
		return document.execCommand("insertText", false, text) === true;
	} catch {
		return false;
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
function insertTextAtCaret(target, text) {
	target.focus();
	let inserted = insertViaExecCommand(text);
	if (!inserted && typeof target.setRangeText === "function") {
		const start = target.selectionStart ?? target.value.length;
		const end = target.selectionEnd ?? start;
		target.setRangeText(text, start, end, "end");
		inserted = true;
	}
	if (!inserted && target.isContentEditable === true) inserted = insertIntoContentEditable(target, text) === true;
	return inserted === true;
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
function needsBoundarySpace() {
	const root = document.querySelector("[data-input-scroll] [contenteditable=\"true\"]");
	const selection = window.getSelection();
	if (root === null || selection === null || selection.rangeCount === 0) return true;
	const caret = selection.getRangeAt(0);
	if (!root.contains(caret.startContainer)) return true;
	const before = document.createRange();
	before.selectNodeContents(root);
	before.setEnd(caret.startContainer, caret.startOffset);
	const text = before.toString();
	if (text === "") return false;
	return !/\s/u.test(text.slice(-1));
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
function currentSessionId() {
	const current = shared.sessions?.list?.getSnapshot?.().current;
	if (current) return String(current);
	return shared.slotSessionId;
}
/**
* Resolve the composer's insertion parts for one session, or null when any of
* them is missing. The session PAIRING is checked first: actions latched from
* another session can never address this one's composer.
*/
function composerInsertion(ctx, sessionId) {
	if (shared.slotInput === null) return null;
	if (shared.slotInput.sessionId !== sessionId) return null;
	const input = ctx.get("conversation")?.input;
	if (!input) return null;
	const scope = shared.sessions?.scope?.(sessionId);
	if (!scope) return null;
	return {
		input,
		scope,
		actions: shared.slotInput.actions
	};
}
/** The one scope walk, or null. */
function sessionScopeOf(sessionId) {
	return shared.sessions?.scope?.(sessionId) ?? null;
}
/** The composer input facade for one resolved scope, or null. */
function inputFacadeOf(scope) {
	return (shared.ctx?.get?.("conversation"))?.input?.for?.(scope) ?? null;
}
/** The one facade walk every dsh line agrees on, or null. */
function facadeOfSession(sessionId) {
	const scope = sessionScopeOf(sessionId);
	return scope === null ? null : inputFacadeOf(scope);
}
/** The session's input facade, or null (try/catch — scope may refuse). */
function inputForSession(sessionId) {
	try {
		return facadeOfSession(sessionId);
	} catch {
		return null;
	}
}
/** Slot session identity → string, or null when the slot shipped none. */
function pasteSessionIdOf(sessionId) {
	return sessionId === void 0 || sessionId === null ? null : String(sessionId);
}

//#endregion
//#region src/client/registry.ts
const pasteRegistry = /* @__PURE__ */ new Map();
const REGISTRY_KEY_PREFIX = "dsh-pd:reg:";
let sessionStorageUsable = null;
function sessionStore(sessionId) {
	if (sessionStorageUsable === false) return null;
	try {
		if (sessionStorageUsable === null) {
			const probe = `${REGISTRY_KEY_PREFIX}__probe`;
			sessionStorage.setItem(probe, "1");
			sessionStorage.removeItem(probe);
		}
		sessionStorageUsable = true;
	} catch {
		sessionStorageUsable = false;
		return null;
	}
	return sessionStorage.getItem(`${REGISTRY_KEY_PREFIX}${sessionId}`);
}
function pasteNameOf(path) {
	return path.split("/").filter(Boolean).at(-1) ?? path;
}
/**
* The head of the pasted text, collapsed to one line. This is the recognition
* the composer badge and the dock card both carry: two pastes with nothing but
* an identical 📄 (or a bare filename) between them are indistinguishable at a
* glance, while their openings usually are not. DISPLAY ONLY — it never enters
* the mention, the model text, or the file.
*/
function previewOf(text) {
	return String(text ?? "").replace(/\s+/gu, " ").trim().slice(0, 10);
}
/** Record one saved paste so the dock can claim its mention. */
function registerPaste(sessionId, result, preview) {
	if (!sessionId || !result?.path) return;
	const mention = `@"${result.path}"`;
	const entry = {
		path: result.path,
		chars: result.chars,
		name: pasteNameOf(result.path),
		preview: typeof preview === "string" ? preview : ""
	};
	let entries = pasteRegistry.get(sessionId);
	if (!entries) {
		entries = /* @__PURE__ */ new Map();
		pasteRegistry.set(sessionId, entries);
	}
	entries.set(mention, entry);
	try {
		sessionStorage.setItem(`${REGISTRY_KEY_PREFIX}${sessionId}`, JSON.stringify([...entries]));
	} catch {}
}
/** The registry for one session, hydrated from sessionStorage once. */
function pastesOf(sessionId) {
	let entries = pasteRegistry.get(sessionId);
	if (entries) return entries;
	entries = /* @__PURE__ */ new Map();
	pasteRegistry.set(sessionId, entries);
	hydrateEntries(entries, sessionId, sessionStore(sessionId));
	return entries;
}
/** One mirrored registry row → a dock entry, or null when malformed. */
function parseRegistryRow(entry) {
	if (entry === null || typeof entry !== "object") return null;
	const record = entry;
	if (typeof record.path !== "string") return null;
	return {
		path: record.path,
		chars: typeof record.chars === "number" ? record.chars : void 0,
		name: typeof record.name === "string" ? record.name : pasteNameOf(record.path),
		preview: typeof record.preview === "string" ? record.preview : ""
	};
}
/**
* Parse one sessionStorage mirror into `entries`. Corrupt or malformed rows
* are discarded and the mirror row is dropped: the mentions in the draft stay
* functional, only the dock misses their cards.
*/
function hydrateEntries(entries, sessionId, raw) {
	if (typeof raw !== "string" || raw === "") return;
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) throw new Error("registry mirror must be an entry array");
		for (const [mention, entry] of parsed) {
			if (typeof mention !== "string") continue;
			const row = parseRegistryRow(entry);
			if (row !== null) entries.set(mention, row);
		}
	} catch {
		try {
			sessionStorage.removeItem(`${REGISTRY_KEY_PREFIX}${sessionId}`);
		} catch {}
	}
}

//#endregion
//#region src/client/chip.ts
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
function pasteReference(path, chars) {
	return ` @"${path}" (${chars} 字符)`;
}
/** The chip payload for one saved paste (see the module doc in the tests). */
function referenceChipOf(path, chars, seq, preview) {
	const mention = `@"${path}"`;
	const name = path.split("/").filter(Boolean).at(-1) ?? path;
	const badge = seq === void 0 || seq <= 1 ? "📄" : `📄${seq}`;
	const marked = preview === void 0 || preview === "" ? badge : `${badge} ${preview}…`;
	return {
		source: "reference",
		ref: mention,
		label: shared.chipBadge ? marked : `${name} · ${chars} 字符`,
		appearance: "file",
		clipboardText: pasteReference(path, chars).trimStart()
	};
}
/**
* The ordinal for the NEXT badge in this draft: one plus the count of paste
* chips already present. Multiple pastes must stay distinguishable in the
* draft itself — identical `📄` badges would not be. Unreadable state
* answers 1: the first badge never shows a number.
*/
function pasteSeqOf(sessionId) {
	const occurrences = inputForSession(sessionId)?.state?.getSnapshot?.()?.occurrences;
	if (!Array.isArray(occurrences)) return 1;
	const entries = pastesOf(sessionId);
	let count = 0;
	for (const occurrence of occurrences) if (claimedPaste(entries, occurrence) !== void 0) count += 1;
	return count + 1;
}
/**
* One draft occurrence joined against the registry, or undefined when this
* plugin does not claim it (not a reference occurrence, not one of ours).
*/
function claimedPaste(entries, occurrence) {
	const occ = occurrence;
	if (!occ || typeof occ.ref !== "string") return void 0;
	if (occ.source !== "reference") return void 0;
	return entries.get(occ.ref);
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
async function insertReferenceChip(ctx, sessionId, path, chars, preview) {
	const parts = composerInsertion(ctx, sessionId);
	if (parts === null) return false;
	const chip = referenceChipOf(path, chars, pasteSeqOf(sessionId), preview);
	try {
		const controller = ctx.get("inputTriggers")?.sessionOf?.(parts.scope);
		const signal = new AbortController().signal;
		if (typeof await controller?.serializeReference?.("reference", chip.ref, signal) !== "string") return false;
		const composer = parts.input.for(parts.scope);
		if (needsBoundarySpace() && typeof composer.insertText === "function") composer.insertText(" ", parts.actions.captureInsertion());
		const span = parts.actions.captureInsertion();
		return composer.insertReference(chip, span) === true;
	} catch (error) {
		console.warn(`[${PACKAGE}] atomic reference chip unavailable, using the text reference instead:`, error);
		return false;
	}
}

//#endregion
//#region src/client/toast.ts
/** How long one toast stays on screen. */
const TOAST_MS = 2600;
const toastTimers = /* @__PURE__ */ new Set();
let toastList = [];
let toastSeq = 0;
const toastListeners = /* @__PURE__ */ new Set();
const publishToasts = () => {
	for (const listener of toastListeners) listener();
};
const subscribeToasts = (listener) => {
	toastListeners.add(listener);
	return () => {
		toastListeners.delete(listener);
	};
};
const readToasts = () => toastList;
/** Show one transient line in dsh's frame-wide overlay; auto-dismisses. */
function showToast(text, level) {
	const id = toastSeq += 1;
	toastList = [...toastList, {
		id,
		text,
		level: level === "error" ? "error" : "info"
	}];
	publishToasts();
	const timer = setTimeout(() => {
		toastTimers.delete(timer);
		toastList = toastList.filter((entry) => entry.id !== id);
		publishToasts();
	}, TOAST_MS);
	toastTimers.add(timer);
}
/** Cancel every pending auto-dismiss (unload hygiene — see index.ts). */
function clearToastTimers() {
	for (const timer of toastTimers) clearTimeout(timer);
	toastTimers.clear();
}
const TOAST_CSS = [
	".dsh-paste-dock-toasts{position:absolute;left:0;right:0;bottom:8px;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}",
	".dsh-paste-dock-toast{box-sizing:border-box;max-width:100%;padding:8px 14px;border-radius:999px;",
	"border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35));",
	"background:var(--dsw-alias-bg-layer-1,rgba(28,28,30,.94));",
	"color:var(--dsw-alias-label-primary,#f5f5f5);font-size:13px;line-height:18px;",
	"box-shadow:0 6px 24px rgba(0,0,0,.18);animation:dsh-paste-dock-toast-in .16s ease-out}",
	".dsh-paste-dock-toast-error{border-color:var(--dsw-alias-state-error-primary,#e5484d);",
	"color:var(--dsw-alias-state-error-primary,#e5484d)}",
	"@keyframes dsh-paste-dock-toast-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}"
].join("");
/** The overlay occupant: renders whatever the store currently holds. */
function ToastHost() {
	const items = react.useSyncExternalStore(subscribeToasts, readToasts);
	if (items.length === 0) return null;
	return react.createElement("div", { className: "dsh-paste-dock-toasts" }, items.map((entry) => react.createElement("div", {
		key: entry.id,
		role: "status",
		className: `dsh-paste-dock-toast${entry.level === "error" ? " dsh-paste-dock-toast-error" : ""}`
	}, entry.text)));
}
/**
* Best-effort toast surface: an additive entry in the composer card's own
* overlay seat (`conversation.input.overlay`, replaceRisk "none" — a fresh
* id sits BESIDE the shipped entries, never replacing them).
*
* Returns false when the surface is unavailable, in which case saves still
* work and merely go unreported.
*/
function mountToastSurface(ctx) {
	if (react === null) return false;
	const slotsService = ctx.get("slots");
	if (slotsService === void 0 || typeof slotsService.inject !== "function") return false;
	ctx.effect(() => {
		const style = document.createElement("style");
		style.textContent = TOAST_CSS;
		document.head.appendChild(style);
		return () => style.remove();
	});
	ctx.effect(() => slotsService.inject("conversation.input.overlay", () => slotsService.register({
		name: "conversation.input.overlay",
		id: PACKAGE,
		order: 100,
		label: "dsh-paste-dock toasts"
	}, ToastHost)));
	return true;
}

//#endregion
//#region src/client/dock.ts
/** Slot `inject` hook — see the long doc on injectPasteDock below. */
function injectPasteDock(sessionId) {
	try {
		const facade = facadeOfSession(String(sessionId));
		if (facade === null) return {};
		return {
			pasteInput: facade,
			pasteSessionId: pasteSessionIdOf(sessionId)
		};
	} catch {
		return {};
	}
}
/**
* Expanded length of one occurrence in the CLIPBOARD projection. Chips sit in
* the draft as a single character while their mention text is longer; dsh
* publishes the expansion here when it knows it, and the removal below needs
* it to fold clipboard coordinates back onto the edit spans the facade
* accepts. Anything unusable answers 1 (no expansion).
*/
function occurrenceLength(occurrence) {
	const length = occurrence.length;
	return typeof length === "number" && Number.isSafeInteger(length) && length > 0 ? length : 1;
}
/**
* Fold the EXPANDED coordinates of every occurrence of `mention` onto the
* DETECT projection the edit spans address, back-to-front. Answers null
* when the occurrence list has a shape this function cannot understand —
* BEFORE any edit happens, so a wrong guess can never delete a wrong span.
*/
function collectMentionRanges(snapshot, mention) {
	if (!Array.isArray(snapshot.occurrences)) return null;
	let expansion = 0;
	const ranges = [];
	for (const occurrence of snapshot.occurrences) {
		if (!occurrence || typeof occurrence.offset !== "number") return null;
		const length = occurrenceLength(occurrence);
		const start = occurrence.offset - expansion;
		if (occurrence.source === "reference" && occurrence.ref === mention) ranges.push({
			start,
			end: start + 1,
			clipboardEnd: occurrence.offset + length
		});
		expansion += length - 1;
	}
	return ranges;
}
/** One back-to-front span deletion, re-reading the revision between cuts. */
function deleteRanges(input, ranges) {
	for (const range of ranges) {
		const current = input.state?.getSnapshot?.();
		if (!current) return false;
		if (current.draft?.[range.clipboardEnd] === " ") range.end += 1;
		if (input.insertText?.("", {
			start: range.start,
			end: range.end,
			draftRev: current.draftRev
		}) !== true) {
			input.notify?.("error", "dsh-paste-dock: 草稿已变化，未能移除该引用，请手动删除");
			return false;
		}
	}
	return true;
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
function removePasteReference(sessionId, mention) {
	const input = facadeOfSession(sessionId);
	const snapshot = input?.state?.getSnapshot?.();
	if (!input || !snapshot) return false;
	const ranges = collectMentionRanges(snapshot, mention);
	if (ranges === null || ranges.length === 0) return false;
	ranges.sort((a, b) => b.start - a.start);
	return deleteRanges(input, ranges);
}
/** better-sidebar's editor opener, when the service exposes one we know. */
function betterSidebarOpener() {
	const service = shared.betterSidebarService;
	if (service === null || typeof service !== "object") return null;
	for (const name of [
		"openFile",
		"openPath",
		"open"
	]) if (typeof service[name] === "function") return service[name].bind(service);
	return null;
}
/** The host's authenticated system-app opener (loopback only), or null. */
function hostOpener() {
	const connection = shared.connection;
	const remote = shared.ctx?.remote;
	const remoteOpen = remote?.session?.openWorkspacePath;
	if (connection?.isLoopback !== true || typeof remoteOpen !== "function") return null;
	return (path) => Promise.resolve(remoteOpen.call(remote.session, { path })).then((result) => {
		if (result && result.ok === false) throw new Error(result?.error?.message || "宿主拒绝打开该路径");
	});
}
function canOpenPasteFiles() {
	return betterSidebarOpener() !== null || hostOpener() !== null;
}
function openPastePath(path) {
	const viaSidebar = betterSidebarOpener();
	if (viaSidebar !== null) try {
		const outcome = viaSidebar(path);
		if (outcome && typeof outcome.catch === "function") outcome.catch(() => {
			const viaHost = hostOpener();
			if (viaHost === null) showToast("better-sidebar 打开失败，且当前部署不支持系统打开", "error");
			else viaHost(path).catch((error) => showToast(`打开失败：${error?.message || error}`, "error"));
		});
		return;
	} catch {}
	const viaHost = hostOpener();
	if (viaHost !== null) {
		viaHost(path).catch((error) => showToast(`打开失败：${error?.message || error}`, "error"));
		return;
	}
	showToast("点击草稿中的 📄 徽标可在侧栏预览全文");
}
/**
* Re-render trigger: subscribe to the draft revision so a Backspace on a
* badge re-renders the dock on the next tick. Without `state.subscribe` this
* reads one snapshot and never fires — the dock then renders once at mount
* (degraded, still correct), never loops.
*/
function useDraftRevision(input) {
	const state = input?.state ?? null;
	const subscribe = react.useCallback((listener) => typeof state?.subscribe === "function" ? state.subscribe(listener) : () => {}, [state]);
	const getSnapshot = react.useCallback(() => state ? String(state.getSnapshot?.()?.draftRev ?? "") : "", [state]);
	react.useSyncExternalStore(subscribe, getSnapshot, () => "");
}
/**
* The cards one dock render shows: the draft's reference occurrences joined
* against this plugin's registry, in draft order. Pure — every guard lives
* here so the component below stays a flat render. Null = the input shape
* is unreadable (hide the dock), [] = readable but empty.
*/
function visiblePasteCards(sessionId, input) {
	const occurrences = input?.state?.getSnapshot?.()?.occurrences;
	if (!Array.isArray(occurrences)) return null;
	const entries = pastesOf(sessionId);
	const visible = [];
	for (const occurrence of occurrences) {
		const item = claimedPaste(entries, occurrence);
		if (item !== void 0) visible.push({
			occurrence,
			item
		});
	}
	return visible;
}
/** One saved paste, drawn as a dock card. */
function DockCard({ sessionId, mention, item, canOpen }) {
	const [busy, setBusy] = react.useState(false);
	function remove() {
		if (busy) return;
		setBusy(true);
		try {
			removePasteReference(sessionId, mention);
		} finally {
			setBusy(false);
		}
	}
	return react.createElement("div", { className: "dsh-pd-card" }, react.createElement("span", {
		className: "dsh-pd-icon",
		"aria-hidden": "true"
	}, "📄"), react.createElement("div", {
		className: "dsh-pd-meta",
		title: canOpen ? item.path : `点击草稿中的 📄 徽标可在侧栏预览（${item.path}）`,
		onClick: () => canOpen && openPastePath(item.path)
	}, react.createElement("div", { className: "dsh-pd-name" }, item.name), react.createElement("div", { className: "dsh-pd-sub" }, `${item.preview ? `${item.preview}… · ` : ""}${item.chars === void 0 ? "" : `${item.chars} 字符 · `}${item.path}`)), canOpen ? react.createElement("button", {
		type: "button",
		className: "dsh-pd-button",
		title: "打开全文",
		onClick: () => openPastePath(item.path)
	}, "打开") : null, react.createElement("button", {
		type: "button",
		className: "dsh-pd-button dsh-pd-remove",
		title: "从草稿移除（文件保留在 pastes/）",
		"aria-label": `移除 ${item.name}`,
		disabled: busy,
		onClick: remove
	}, "×"));
}
/**
* The dock itself: `conversation.input.dock` renders above the composer, so
* this is where "the display moved out of the text" physically lands. Its
* working parts arrive through `injectPasteDock` — any shape this cannot
* read renders null and the paste path above is untouched.
*/
function PasteDock(props) {
	const p = props ?? {};
	const input = p.pasteInput ?? null;
	const sessionId = p.pasteSessionId ?? null;
	useDraftRevision(input);
	if (!shared.dockEnabled || sessionId === null || !input) return null;
	const visible = visiblePasteCards(sessionId, input);
	if (visible === null || visible.length === 0) return null;
	const canOpen = canOpenPasteFiles();
	return react.createElement("div", { className: "dsh-pd-dock" }, visible.map(({ occurrence, item }) => react.createElement(DockCard, {
		key: `${occurrence.ref}@${occurrence.offset}`,
		sessionId,
		mention: occurrence.ref,
		item,
		canOpen
	})));
}
/** Idempotent stylesheet: one <style> tag, keyed, removed on teardown. */
function injectDockStyles() {
	if (document.getElementById("dsh-pd-styles") !== null) return;
	const style = document.createElement("style");
	style.id = "dsh-pd-styles";
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
`;
	document.head.appendChild(style);
}
/**
* Additive entry in the composer dock strip; order 0 leads the band (the todo
* entry also claims 0 — tie order is undefined in dsh, so this is a declared
* intent, not a guarantee). Returns false when React or the slots service is
* missing — saving never depends on it.
*/
function mountPasteDock(ctx) {
	if (react === null) return false;
	const slots = ctx.get("slots");
	if (slots === void 0 || typeof slots.inject !== "function") return false;
	ctx.effect(() => {
		injectDockStyles();
		return () => document.getElementById("dsh-pd-styles")?.remove();
	});
	ctx.effect(() => slots.inject("conversation.input.dock", () => slots.register({
		name: "conversation.input.dock",
		id: `${PACKAGE}:dock`,
		order: 0,
		registrant: PACKAGE,
		label: "dsh-paste-dock cards",
		inject: injectPasteDock
	}, PasteDock)));
	console.log(`[${PACKAGE}] paste dock attached to conversation.input.dock (order 0)`);
	return true;
}

//#endregion
//#region src/client/rpc.ts
/**
* One `pasteStore` call over the existing connection RPC, with a timeout and
* the gateway's ok/error envelope unwrapped. The single place the wire shape
* is known, so the callers cannot drift apart; the endpoint stays a literal at
* each call site, so the wire name is greppable where it is used.
*/
async function callPasteStore(connection, endpoint, args, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const result = await connection?.rpc?.call?.("/api", endpoint, { args }, controller.signal);
		if (result && result.ok && result.value) return result.value;
		const detail = result && result.error ? `${result.error.code}: ${result.error.message}` : "unknown error";
		throw new Error(`${endpoint} failed: ${detail}`);
	} finally {
		clearTimeout(timer);
	}
}
/** Call the host pasteStore service over the existing connection RPC. */
function savePaste(connection, sessionId, text) {
	return callPasteStore(connection, "pasteStore/savePaste", {
		text,
		sessionId
	}, RPC_TIMEOUT_MS);
}
/**
* Fetch the host's effective config. The paste decision has to be synchronous
* (`preventDefault` must run inside the paste event itself), so this runs once
* at startup instead of at paste time; the listener always reads whichever
* value is current.
*/
function fetchHostConfig(connection) {
	return callPasteStore(connection, "pasteStore/getConfig", {}, CONFIG_TIMEOUT_MS);
}
/**
* Adopt a config payload from the host. Shared by the startup fetch and the
* Settings row, so both paths validate and report identically; returns false
* when the payload is unusable and the previous value stays in force.
*/
function applyRemoteConfig(remote, origin) {
	let usable = false;
	if (typeof remote.minChars === "number" && Number.isInteger(remote.minChars) && remote.minChars > 0) {
		shared.minChars = remote.minChars;
		usable = true;
	} else console.warn(`[${PACKAGE}] ${origin} sent an unusable minChars (${JSON.stringify(remote.minChars)}) — keeping the ${shared.minChars}-char threshold`);
	if (typeof remote.chipBadge === "boolean") shared.chipBadge = remote.chipBadge;
	if (typeof remote.dock === "boolean") shared.dockEnabled = remote.dock;
	if (usable) console.log(`[${PACKAGE}] config from ${origin}: minChars=${remote.minChars} (${remote.minCharsSource}), maxBytes=${remote.maxBytes}, chipBadge=${shared.chipBadge}, dock=${shared.dockEnabled}`);
	return usable;
}

//#endregion
//#region src/client/hint.ts
const SIDEBAR_HINT_KEY = "dsh-paste-dock:sidebar-hint";
let sidebarHintSeen = null;
/** Has the one-shot hint been shown already? Cached — the hint re-renders often. */
function readSidebarHint() {
	if (sidebarHintSeen === null) try {
		sidebarHintSeen = window.localStorage.getItem(SIDEBAR_HINT_KEY) === "1";
	} catch (error) {
		console.warn(`[${PACKAGE}] localStorage unavailable — the sidebar hint may return:`, error);
		sidebarHintSeen = false;
	}
	return sidebarHintSeen;
}
/** Remember that the hint has been shown. Best effort: storage may be denied. */
function markSidebarHintSeen() {
	if (sidebarHintSeen === true) return;
	sidebarHintSeen = true;
	try {
		window.localStorage.setItem(SIDEBAR_HINT_KEY, "1");
	} catch (error) {
		console.warn(`[${PACKAGE}] could not persist the sidebar hint state:`, error);
	}
}
let sidebarState = {
	adopted: false,
	hintWanted: false
};
const sidebarListeners = /* @__PURE__ */ new Set();
function publishSidebar(next) {
	const merged = {
		...sidebarState,
		...next
	};
	if (merged.adopted === sidebarState.adopted && merged.hintWanted === sidebarState.hintWanted) return;
	sidebarState = merged;
	for (const listener of sidebarListeners) listener();
}
const subscribeSidebar = (listener) => {
	sidebarListeners.add(listener);
	return () => {
		sidebarListeners.delete(listener);
	};
};
const readSidebar = () => sidebarState;
const HINT_CSS = [
	".dsh-paste-dock-hint{position:absolute;left:50%;transform:translateX(-50%);bottom:40px;display:flex;",
	"align-items:center;gap:6px;padding:2px 8px;border-radius:8px;",
	"max-width:min(100%,var(--dsh-composer-card-max-width,640px));",
	"font-size:11px;line-height:16px;white-space:nowrap;pointer-events:auto;",
	"background:var(--dsw-alias-bg-layer-1,rgba(28,28,30,.72));",
	"color:var(--dsw-alias-label-primary,#f5f5f5);opacity:.85}",
	".dsh-paste-dock-hint-text{min-width:0;overflow:hidden;text-overflow:ellipsis}",
	".dsh-paste-dock-hint-close{flex:none;padding:0 4px;border:0;border-radius:999px;font:inherit;font-size:11px;",
	"cursor:pointer;background:transparent;color:inherit;opacity:.7}",
	".dsh-paste-dock-hint-close:hover{opacity:1}"
].join("");
const SIDEBAR_HINT_TEXT = "没装 dsh-better-sidebar（官方侧栏能看，装了能直接编辑）";
/**
* Should the one-shot "no sidebar" hint be offered? It fires for a paste that
* landed as an atomic chip, and only while the integration was NEVER there
* (see the never-cleared latch above).
*/
function shouldOfferSidebarHint() {
	if (shared.betterSidebarEverAdopted) return false;
	return !readSidebarHint();
}
/** Raise the one-shot hint. The slot marks it seen once it actually renders. */
function offerSidebarHint() {
	if (!shouldOfferSidebarHint()) return;
	publishSidebar({ hintWanted: true });
}
/** The one-shot annotation itself; rendering marks it seen (D1). */
function SidebarHint(props) {
	const { hintWanted } = react.useSyncExternalStore(subscribeSidebar, readSidebar);
	const [open, setOpen] = react.useState(false);
	const p = props ?? {};
	const offeredSession = p.sessionId;
	const offeredActions = p.inputActions;
	react.useEffect(() => {
		if (offeredSession === void 0 || offeredSession === null) return;
		shared.slotSessionId = String(offeredSession);
		shared.slotInput = offeredActions === void 0 || offeredActions === null ? null : {
			sessionId: shared.slotSessionId,
			actions: offeredActions
		};
	}, [offeredSession, offeredActions]);
	react.useEffect(() => {
		if (!hintWanted) return;
		markSidebarHintSeen();
		setOpen(true);
	}, [hintWanted]);
	if (!hintWanted || !open) return null;
	return react.createElement("div", { className: "dsh-paste-dock-hint" }, react.createElement("span", { className: "dsh-paste-dock-hint-text" }, SIDEBAR_HINT_TEXT), react.createElement("button", {
		type: "button",
		className: "dsh-paste-dock-hint-close",
		title: "知道了，不再提示",
		onClick: () => setOpen(false)
	}, "×"));
}
/**
* Additive entry in the composer overlay (an ambient annotation over the
* composer card). Returns false when the surface is unavailable.
*/
function mountSidebarHint(ctx) {
	if (react === null) return false;
	const slots = ctx.get("slots");
	if (slots === void 0 || typeof slots.inject !== "function") return false;
	ctx.effect(() => {
		const style = document.createElement("style");
		style.textContent = HINT_CSS;
		document.head.appendChild(style);
		return () => style.remove();
	});
	ctx.effect(() => slots.inject("conversation.input.overlay", () => slots.register({
		name: "conversation.input.overlay",
		id: `${PACKAGE}:hint`,
		order: 90,
		label: "dsh-paste-dock sidebar hint"
	}, SidebarHint)));
	return true;
}
/**
* Note whether the OPTIONAL betterSidebar service is around. A one-shot
* `ctx.get()` at activation is NOT enough: a service provided by a
* later-activating plugin is simply not there yet (measured).
*
* The live service IS kept (the dock card's open action prefers its editor);
* the never-cleared latch drives the one-shot hint and the settings row.
*/
function adoptBetterSidebar(service) {
	if (service !== null) shared.betterSidebarEverAdopted = true;
	shared.betterSidebarService = service;
	console.log(`[${PACKAGE}] betterSidebar ${service === null ? "gone" : "present"}`);
	publishSidebar({ adopted: shared.betterSidebarEverAdopted });
}

//#endregion
//#region src/client/settings.ts
const ROW_CSS = [
	".dsh-paste-dock-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:8px 0}",
	".dsh-paste-dock-row-main{display:flex;flex-direction:column;gap:2px;min-width:0}",
	".dsh-paste-dock-row-label{font-size:13px;line-height:20px}",
	".dsh-paste-dock-row-hint{font-size:12px;line-height:16px;opacity:.75}",
	".dsh-paste-dock-row-note{font-size:12px;line-height:16px;margin-top:2px;color:var(--dsw-alias-state-business-primary,inherit)}",
	".dsh-paste-dock-row-controls{display:flex;align-items:center;gap:8px;flex:none}",
	".dsh-paste-dock-row-input{box-sizing:border-box;width:104px;padding:4px 8px;border-radius:8px;font:inherit;font-size:13px;",
	"border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35));",
	"background:var(--dsw-specific-input-major,transparent);color:inherit}",
	".dsh-paste-dock-row-button{padding:4px 10px;border:0;border-radius:8px;font:inherit;font-size:12px;cursor:pointer;",
	"background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:inherit}",
	".dsh-paste-dock-row-button:disabled{opacity:.5;cursor:default}"
].join("");
/** One line explaining where the effective value comes from, and what blocks saving. */
function thresholdHint(remote) {
	if (remote === null) return "正在读取 host 配置…";
	if (remote.canConfigure === false) return "当前 dsh 无法在界面保存该值 —— 请改 cordis.patch.yml 的 minChars 并重启 dsh";
	if (remote.minCharsSource === "user") return `已自定义；部署默认值 ${remote.deploymentMinChars} 字符（cordis.patch.yml）`;
	return "跟随 cordis.patch.yml 的部署默认值";
}
/** The preference row: current value, save, and reset back to the deployment default. */
function SettingsMinCharsRow() {
	const [remote, setRemote] = react.useState(null);
	const [draft, setDraft] = react.useState("");
	const [note, setNote] = react.useState("");
	const [busy, setBusy] = react.useState(false);
	const adopt = react.useCallback((next, message) => {
		setRemote(next);
		setDraft(String(next.minChars));
		setNote(message);
		applyRemoteConfig(next, "settings");
	}, []);
	react.useEffect(() => {
		let mounted = true;
		if (shared.connection === null) {
			setNote("connection 未就绪 —— 刷新页面后重试");
			return;
		}
		fetchHostConfig(shared.connection).then((payload) => {
			if (mounted) adopt(payload, "");
		}).catch((reason) => {
			if (mounted) setNote(`读取 host 配置失败：${reason.message}`);
		});
		return () => {
			mounted = false;
		};
	}, [adopt]);
	const write = (value) => {
		if (shared.connection === null) return;
		setBusy(true);
		setNote("");
		callPasteStore(shared.connection, "pasteStore/setMinChars", { value }, 5e3).then((payload) => adopt(payload, value === null ? "已恢复部署默认值" : "已保存，立即生效")).catch((reason) => setNote(`保存失败：${reason.message}`)).finally(() => setBusy(false));
	};
	const editable = remote !== null && remote.canConfigure !== false;
	const submit = () => {
		const parsed = Number(draft);
		if (!Number.isInteger(parsed) || parsed <= 0) {
			setNote("请输入正整数（字符数）");
			return;
		}
		write(parsed);
	};
	return react.createElement("div", { className: "dsh-paste-dock-row" }, react.createElement("div", { className: "dsh-paste-dock-row-main" }, react.createElement("div", { className: "dsh-paste-dock-row-label" }, "大段粘贴阈值"), react.createElement("div", { className: "dsh-paste-dock-row-hint" }, `粘贴达到该字符数时保存为 pastes/ 附件，输入框里只留一行引用。${thresholdHint(remote)}`), note === "" ? null : react.createElement("div", { className: "dsh-paste-dock-row-note" }, note)), react.createElement("div", { className: "dsh-paste-dock-row-controls" }, react.createElement("input", {
		className: "dsh-paste-dock-row-input",
		type: "number",
		min: 1,
		step: 1,
		value: draft,
		disabled: !editable || busy,
		"aria-label": "大段粘贴阈值（字符）",
		onChange: (event) => setDraft(event.target.value),
		onKeyDown: (event) => {
			if (event.key === "Enter") submit();
		}
	}), react.createElement("button", {
		type: "button",
		className: "dsh-paste-dock-row-button",
		disabled: !editable || busy,
		onClick: submit
	}, "保存"), remote !== null && remote.minCharsSource === "user" ? react.createElement("button", {
		type: "button",
		className: "dsh-paste-dock-row-button",
		disabled: busy,
		onClick: () => write(null)
	}, "恢复默认") : null));
}
const SIDEBAR_ROW_TEXT = "未检测到 dsh-better-sidebar —— 装它后点粘贴卡片会用它的编辑器打开并可直接编辑 pastes/ 文件；dsh 自带的侧栏只能浏览，不能改。";
function SettingsSidebarRow() {
	react.useSyncExternalStore(subscribeSidebar, readSidebar);
	if (shared.betterSidebarEverAdopted) return null;
	return react.createElement("div", { className: "dsh-paste-dock-row" }, react.createElement("div", { className: "dsh-paste-dock-row-main" }, react.createElement("div", { className: "dsh-paste-dock-row-label" }, "侧栏集成"), react.createElement("div", { className: "dsh-paste-dock-row-hint" }, SIDEBAR_ROW_TEXT)));
}
/**
* Additive entries in the General settings section (`settings.general.item`,
* replaceRisk "none": fresh ids sit beside the shipped rows). Returns false
* when the surface is unavailable — saving pastes never depends on it.
*/
function mountSettingsRow(ctx) {
	if (react === null) return false;
	const slots = ctx.get("slots");
	if (slots === void 0 || typeof slots.inject !== "function") return false;
	ctx.effect(() => {
		const style = document.createElement("style");
		style.textContent = ROW_CSS;
		document.head.appendChild(style);
		return () => style.remove();
	});
	ctx.effect(() => slots.inject("settings.general.item", () => slots.register({
		name: "settings.general.item",
		id: PACKAGE,
		order: 30,
		label: "大段粘贴阈值"
	}, SettingsMinCharsRow)));
	ctx.effect(() => slots.inject("settings.general.item", () => slots.register({
		name: "settings.general.item",
		id: `${PACKAGE}:sidebar`,
		order: 31,
		label: "侧栏集成"
	}, SettingsSidebarRow)));
	return true;
}

//#endregion
//#region src/client/index.ts
/** The module-table id and console prefix (dsh.client platform: web). */
const name = PACKAGE;
/** Wait until the connection carrier and the sessions runtime are live. */
const inject = ["sessions", "connection"];
/** The paste listener, so the teardown effect can remove exactly it. */
let activePasteListener = null;
function apply(ctx) {
	const sessions = ctx.sessions;
	const connection = ctx.connection;
	shared.connection = connection ?? null;
	shared.sessions = sessions ?? null;
	shared.ctx = ctx;
	ctx.inject(["betterSidebar"], (sidebarCtx) => {
		adoptBetterSidebar(sidebarCtx.get("betterSidebar") ?? null);
		return () => adoptBetterSidebar(null);
	});
	if (connection) fetchHostConfig(connection).then((remote) => applyRemoteConfig(remote, "host")).catch((error) => {
		console.warn(`[${PACKAGE}] host config unavailable — keeping the ${shared.minChars}-char fallback threshold:`, error);
	});
	if (!mountToastSurface(ctx)) console.warn(`[${PACKAGE}] toast surface unavailable — saves still work, just without the on-screen confirmation`);
	ctx.effect(() => () => {
		clearToastTimers();
	});
	if (!mountSettingsRow(ctx)) console.warn(`[${PACKAGE}] settings row unavailable — minChars stays adjustable via cordis.patch.yml only`);
	if (!mountSidebarHint(ctx)) console.warn(`[${PACKAGE}] sidebar hint unavailable — pastes still save; only the one-shot hint is skipped`);
	if (!mountPasteDock(ctx)) console.warn(`[${PACKAGE}] paste dock unavailable — pastes still save; the draft chip is the only surface`);
	ctx.effect(() => () => {
		shared.ctx = null;
		shared.betterSidebarService = null;
	});
	console.log(`[${PACKAGE}] client paste listener ready — waiting for the optional betterSidebar service`);
	const onPaste = (event) => {
		const target = event.target;
		if (!isComposerTarget(target)) return;
		const clipboard = event.clipboardData;
		if (!clipboard) return;
		const text = clipboard.getData("text/plain");
		if (!text || text.length < shared.minChars) return;
		if (!sessions || !connection) {
			console.warn(`[${PACKAGE}] sessions/connection services unavailable — large paste falls back to raw text (check dsh.client.inject in package.json, restart dsh, hard-refresh)`);
			return;
		}
		const sessionId = currentSessionId();
		if (sessionId === null) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		savePaste(connection, sessionId, text).then(async (result) => {
			const preview = previewOf(text);
			registerPaste(sessionId, result, preview);
			if (await insertReferenceChip(ctx, sessionId, result.path, result.chars, preview)) {
				console.log(`[${PACKAGE}] saved paste (${result.chars} chars) -> ${result.path} as an atomic reference chip`);
				showToast(`已保存为 ${result.path}（${result.chars} 字符）`);
				offerSidebarHint();
				return;
			}
			const ref = pasteReference(result.path, result.chars);
			insertTextAtCaret(target, ref);
			console.log(`[${PACKAGE}] saved paste (${result.chars} chars) -> ${result.path}`);
			showToast(`已保存为 ${result.path}（${result.chars} 字符）`);
		}).catch((error) => {
			console.error(`[${PACKAGE}] paste save failed, falling back to raw text:`, error);
			const inserted = insertTextAtCaret(target, text);
			showToast(inserted ? "大段粘贴保存失败，已按原样粘贴回输入框" : "大段粘贴保存失败，也没能自动插回输入框——内容还在剪贴板，请手动 Ctrl+V 重试", "error");
		});
	};
	document.addEventListener("paste", onPaste, true);
	activePasteListener = onPaste;
	ctx.effect(() => () => {
		if (activePasteListener !== null) {
			document.removeEventListener("paste", activePasteListener, true);
			activePasteListener = null;
		}
	});
	console.log(`[${PACKAGE}] client paste listener attached — threshold ${500} chars until the host's config arrives`);
}

//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
return module.exports; } });