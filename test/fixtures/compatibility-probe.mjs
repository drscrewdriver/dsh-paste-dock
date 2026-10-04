// 隔离兼容探针:仅由 scripts/test-host-compatibility.mjs 经 --patch 挂载。
// webServer 是唯一硬注入(所有已验证宿主线都有);其余服务全部运行时探测,
// 缺席记为 false/'unknown' 而不是让探针挂载失败——矩阵要区分
// "宿主没有该服务"和"探针自身起不来"这两种完全不同的结论。
export const inject = ['webServer']

const msg = (error) => String((error && (error.message || error.stack)) || error)

export function apply(ctx) {
  // 服务取出:先 ctx.get(字符串键,cordis Service 以名为键注册),再退属性访问。
  const pick = (...keys) => {
    for (const key of keys) {
      try {
        const value = typeof ctx.get === 'function' ? ctx.get(key) : undefined
        if (value) return value
      } catch {}
      try {
        if (ctx[key]) return ctx[key]
      } catch {}
    }
    return undefined
  }

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: '/__paste-dock-compat',
      async handler(_req, res) {
        const out = { pid: process.pid, checks: {} }
        const c = out.checks
        try {
          // 1. pasteStore 服务(插件宿主半身的唯一 Service)。
          const store = pick('pasteStore')
          c.pasteStore = !!store

          // 2. getConfig 往返:插件配置解析 + volatile 读出的一条龙。
          if (store) {
            try {
              const cfg = await store.getConfig()
              c.getConfig = {
                ok: true,
                minChars: cfg?.minChars,
                maxBytes: cfg?.maxBytes,
                chipBadge: cfg?.chipBadge,
                dock: cfg?.dock,
                minCharsSource: cfg?.minCharsSource,
              }
            } catch (error) {
              c.getConfig = { ok: false, error: msg(error) }
            }
          }

          // 3. save_paste 工具登记(host inject=['tools'] 的存在性断言)。
          //    真实 API 是 tools.get(name)(插件启动自检同款);list 形状仅作旧线回退。
          try {
            const tools = pick('tools')
            if (typeof tools?.get === 'function') {
              c.savePasteTool = tools.get('save_paste') !== undefined
              c.toolQuery = 'get'
            } else {
              const raw =
                typeof tools?.list === 'function'
                  ? await tools.list()
                  : (tools?.tools ?? tools?.registry ?? undefined)
              const names = Array.isArray(raw)
                ? raw.map((t) => (typeof t === 'string' ? t : (t?.name ?? t?.id)))
                : raw && typeof raw === 'object'
                  ? Object.keys(raw)
                  : undefined
              c.savePasteTool = names ? names.includes('save_paste') : 'unknown-shape'
              c.toolQuery = 'list-fallback'
            }
          } catch (error) {
            c.savePasteTool = 'error: ' + msg(error)
          }

          // 4. setMinChars 往返:设置写入路径(0.1.5 存宿主 settings 文档,
          //    0.1.7 投影进 profile patch)。两线都可能无 settings provider——
          //    那是记录在案的合法结论,不算格子失败;写完清回 null 还原。
          if (store && typeof store.setMinChars === 'function') {
            try {
              const after = await store.setMinChars(300)
              c.setMinChars = {
                ok: true,
                minChars: after?.minChars,
                minCharsSource: after?.minCharsSource,
              }
              if (after?.minChars === 300) await store.setMinChars(null)
            } catch (error) {
              c.setMinChars = { ok: false, error: msg(error) }
            }
          } else {
            c.setMinChars = { ok: false, error: 'setMinChars 方法不存在' }
          }

          // 5. client inject 目标在宿主侧的对应物(存在性记录,逐线对比)。
          c.sessions = !!pick('sessions')
          c.connection = !!pick('connection')

          // 6. savePaste 全链路(尽力而为):workspaceRegistry 里找带会话的
          //    工作区;没有就尝试 agents.create 造一个(参照 skills-manager
          //    探针);再没有就 skipped——裸启动无会话不算失败,算未覆盖。
          //    registry/sessions 的键名与 list 原样转储,给逐线 API 差异留证据。
          if (store) {
            try {
              const registry = pick('workspaceRegistry')
              c.workspaceRegistryKeys =
                registry && typeof registry === 'object' ? Object.keys(registry) : String(registry)
              const list = () =>
                typeof registry?.list === 'function' ? registry.list() : undefined
              c.workspaceList = (() => {
                try {
                  return JSON.parse(
                    JSON.stringify(list() ?? null, (k, v) => (typeof v === 'function' ? 'fn' : v)),
                  )
                } catch {
                  return 'unserializable'
                }
              })()
              let target = (list() ?? []).find((w) => w?.sessionIds?.length)
              if (!target) {
                const agents = pick('agents')
                if (typeof agents?.create === 'function') {
                  const create = () =>
                    agents.create({
                      sessionId: 'paste-dock-compat',
                      meta: { cwd: process.cwd() },
                      agentOptions: { provider: 'deepseek', model: 'deepseek-chat' },
                    })
                  await (typeof agents.withoutInitiator === 'function'
                    ? agents.withoutInitiator(create)
                    : create())
                  c.agentCreated = true
                  target = (list() ?? []).find((w) => w?.sessionIds?.length)
                } else {
                  c.agentCreateError = 'agents.create 不可用'
                }
              }
              if (!target) {
                const sessions = pick('sessions')
                c.sessionsKeys =
                  sessions && typeof sessions === 'object'
                    ? Object.keys(sessions)
                    : String(sessions)
              }
              if (target) {
                const saved = await store.savePaste(
                  'compat probe paste 内容\n第二行',
                  target.sessionIds[0],
                )
                c.savePaste = { ok: true, ...saved }
              } else {
                c.savePaste = {
                  ok: false,
                  skipped: 'probe time 无带会话的 workspace(agents.create 不注册 workspace)',
                }
              }
            } catch (error) {
              c.savePaste = { ok: false, error: msg(error) }
            }
          }

          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(out))
        } catch (error) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ fatal: msg(error) }))
        }
      },
    }),
  )
}
