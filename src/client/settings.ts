// settings.ts — the General-settings rows (threshold + sidebar integration).
// Both read and write go through our own pasteStore RPC, so the rows never
// need the browser-side settings service.
import * as React from 'react'
import { PACKAGE, shared, type anyCtx } from './shared'
import { applyRemoteConfig, callPasteStore, fetchHostConfig } from './rpc'
import { subscribeSidebar, readSidebar } from './hint'

// dsh's own seat for "a single setting that needs no page of its own". Its
// doc is explicit that the row draws its own internals — copy, current value
// and write path are all ours — because the section projects no label and
// passes no props.
const ROW_CSS = [
  '.dsh-paste-dock-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:8px 0}',
  '.dsh-paste-dock-row-main{display:flex;flex-direction:column;gap:2px;min-width:0}',
  '.dsh-paste-dock-row-label{font-size:13px;line-height:20px}',
  '.dsh-paste-dock-row-hint{font-size:12px;line-height:16px;opacity:.75}',
  '.dsh-paste-dock-row-note{font-size:12px;line-height:16px;margin-top:2px;color:var(--dsw-alias-state-business-primary,inherit)}',
  '.dsh-paste-dock-row-controls{display:flex;align-items:center;gap:8px;flex:none}',
  '.dsh-paste-dock-row-input{box-sizing:border-box;width:104px;padding:4px 8px;border-radius:8px;font:inherit;font-size:13px;',
  'border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.35));',
  'background:var(--dsw-specific-input-major,transparent);color:inherit}',
  '.dsh-paste-dock-row-button{padding:4px 10px;border:0;border-radius:8px;font:inherit;font-size:12px;cursor:pointer;',
  'background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:inherit}',
  '.dsh-paste-dock-row-button:disabled{opacity:.5;cursor:default}',
].join('')

interface RemoteConfig {
  minChars: number
  maxBytes?: number
  minCharsSource?: string
  deploymentMinChars?: number
  canConfigure?: boolean
}

/** One line explaining where the effective value comes from, and what blocks saving. */
function thresholdHint(remote: RemoteConfig | null): string {
  if (remote === null) return '正在读取 host 配置…'
  if (remote.canConfigure === false) {
    return '当前 dsh 无法在界面保存该值 —— 请改 cordis.patch.yml 的 minChars 并重启 dsh'
  }
  if (remote.minCharsSource === 'user') {
    return `已自定义；部署默认值 ${remote.deploymentMinChars} 字符（cordis.patch.yml）`
  }
  return '跟随 cordis.patch.yml 的部署默认值'
}

/** The preference row: current value, save, and reset back to the deployment default. */
function SettingsMinCharsRow() {
  const [remote, setRemote] = React.useState<RemoteConfig | null>(null)
  const [draft, setDraft] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const adopt = React.useCallback((next: RemoteConfig, message: string) => {
    setRemote(next)
    setDraft(String(next.minChars))
    setNote(message)
    applyRemoteConfig(next as unknown as Record<string, unknown>, 'settings')
  }, [])

  React.useEffect(() => {
    let mounted = true
    if (shared.connection === null) {
      setNote('connection 未就绪 —— 刷新页面后重试')
      return undefined
    }
    fetchHostConfig(shared.connection)
      .then((payload) => {
        if (mounted) adopt(payload as unknown as RemoteConfig, '')
      })
      .catch((reason: Error) => {
        if (mounted) setNote(`读取 host 配置失败：${reason.message}`)
      })
    return () => {
      mounted = false
    }
  }, [adopt])

  const write = (value: number | null): void => {
    if (shared.connection === null) return
    setBusy(true)
    setNote('')
    callPasteStore<RemoteConfig>(shared.connection, 'pasteStore/setMinChars', { value }, 5000)
      .then((payload) => adopt(payload, value === null ? '已恢复部署默认值' : '已保存，立即生效'))
      .catch((reason: Error) => setNote(`保存失败：${reason.message}`))
      .finally(() => setBusy(false))
  }

  const editable = remote !== null && remote.canConfigure !== false
  const submit = (): void => {
    const parsed = Number(draft)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setNote('请输入正整数（字符数）')
      return
    }
    write(parsed)
  }

  return React.createElement(
    'div',
    { className: 'dsh-paste-dock-row' },
    React.createElement(
      'div',
      { className: 'dsh-paste-dock-row-main' },
      React.createElement('div', { className: 'dsh-paste-dock-row-label' }, '大段粘贴阈值'),
      React.createElement(
        'div',
        { className: 'dsh-paste-dock-row-hint' },
        `粘贴达到该字符数时保存为 pastes/ 附件，输入框里只留一行引用。${thresholdHint(remote)}`,
      ),
      note === ''
        ? null
        : React.createElement('div', { className: 'dsh-paste-dock-row-note' }, note),
    ),
    React.createElement(
      'div',
      { className: 'dsh-paste-dock-row-controls' },
      React.createElement('input', {
        className: 'dsh-paste-dock-row-input',
        type: 'number',
        min: 1,
        step: 1,
        value: draft,
        disabled: !editable || busy,
        'aria-label': '大段粘贴阈值（字符）',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setDraft(event.target.value),
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === 'Enter') submit()
        },
      }),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh-paste-dock-row-button',
          disabled: !editable || busy,
          onClick: submit,
        },
        '保存',
      ),
      remote !== null && remote.minCharsSource === 'user'
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'dsh-paste-dock-row-button',
              disabled: busy,
              onClick: () => write(null),
            },
            '恢复默认',
          )
        : null,
    ),
  )
}

// The settings-row explainer copy, kept beside its row: this is where a user
// lands after dismissing (or never noticing) the one-shot hint.
const SIDEBAR_ROW_TEXT =
  '未检测到 dsh-better-sidebar —— 装它后点粘贴卡片会用它的编辑器打开并可直接编辑 pastes/ 文件；dsh 自带的侧栏只能浏览，不能改。'

// The missing integration, explained where a user would go looking for it. It
// disappears for good once better-sidebar is adopted — the same latch the hint
// uses — and subscribes to the same snapshot so it reacts to the async arrival.
function SettingsSidebarRow() {
  React.useSyncExternalStore(subscribeSidebar, readSidebar)
  if (shared.betterSidebarEverAdopted) return null
  return React.createElement(
    'div',
    { className: 'dsh-paste-dock-row' },
    React.createElement(
      'div',
      { className: 'dsh-paste-dock-row-main' },
      React.createElement('div', { className: 'dsh-paste-dock-row-label' }, '侧栏集成'),
      React.createElement('div', { className: 'dsh-paste-dock-row-hint' }, SIDEBAR_ROW_TEXT),
    ),
  )
}

/**
 * Additive entries in the General settings section (`settings.general.item`,
 * replaceRisk "none": fresh ids sit beside the shipped rows). Returns false
 * when the surface is unavailable — saving pastes never depends on it.
 */
export function mountSettingsRow(ctx: anyCtx): boolean {
  if (React === null) return false
  const slots = ctx.get('slots')
  if (slots === undefined || typeof slots.inject !== 'function') return false
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = ROW_CSS
    document.head.appendChild(style)
    return () => style.remove()
  })
  ctx.effect(() =>
    slots.inject('settings.general.item', () =>
      slots.register(
        {
          name: 'settings.general.item',
          // 30 = right after the shipped composer-enter row (20).
          id: PACKAGE,
          order: 30,
          label: '大段粘贴阈值',
        },
        SettingsMinCharsRow,
      ),
    ),
  )
  // A DISTINCT id: the same id at the same priority inside one list slot throws.
  ctx.effect(() =>
    slots.inject('settings.general.item', () =>
      slots.register(
        {
          name: 'settings.general.item',
          id: `${PACKAGE}:sidebar`,
          order: 31,
          label: '侧栏集成',
        },
        SettingsSidebarRow,
      ),
    ),
  )
  return true
}
