# dsh-paste-dock 发布检查清单(Release Checklist)

> 发版走 `npm run release`(自动控版本号/构建/测试/pack 核对 → PR → 合并后打 tag → OIDC publish,`next` 观察后人工转 `latest`)。

## 0.2.0 — 工具链与测试面全量 TypeScript 化(paste-dock-ts-rewrite 计划)

> 零行为变更的重构版。`src/` 本来已全部是 TS,本次清掉残留的 12 个 `.mjs` 与
> 2459 行 `.js` 测试,并把三套 tsconfig 的严格度一次性加严。不引入 tsx/ts-node——
> 工具链靠 Node 22 原生类型剥离直跑 `node tools/x.ts`。

### 改动面

- **rc.1** 新增 `tsconfig.tools.json`(NodeNext / noEmit / allowImportingTsExtensions / strict),10 个
  `scripts/`、`tools/` 文件 `.mjs`→`.ts` 并补类型;`tools/metrics` 解析器由 espree 换成已装的
  typescript 编译器 API(改名后 espree 不吃类型注解,而该门把解析失败判 exit 1);`ci.yml` 增加
  Node ≥ 22.18 断言与一个真跑 `.ts` 的探针,防镜像回落。
- **rc.2** `tests/release.test.js`→`.ts`,只补类型、断言零改动。
- **rc.3** `smoke.mjs`→`.ts`;`test/fixtures/compatibility-probe.mjs`→`.ts`,但宿主 loader 只吃 JS,
  故在拷贝边界剥类后仍写 `sandbox/probe.mjs`,挂载面扩展名与形状不变。
- **rc.4** 三配置同开 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `noImplicitOverride`;
  `noPropertyAccessFromIndexSignature` 实测 client 27 / tools 27 而拒开(数字与理由写在配置头注)。
- **rc.5** 删 `lib/` 镜像与 `scripts/sync-lib.ts`(证据:npm tarball 从不包含 lib、真装机目录均只有
  dist、profile 走 registry 钉版、本机无 dsh-super-injector 存迹),产物对拍改为 `git diff -- dist`。
- **rc.6** 纯 bump 片,无代码差异。

### 行为差异面(实测)

与 0.1.28 对比,`dist/index.js` 与 `dist/typert.host.js` **逐字节相同**;`dist/client.js` 只有
1 个 hunk、−2/+3 行,全在 `parseRegistryRow`:改为在 `chars` 非数字时**不写该键**而不是写
`undefined`(`exactOptionalPropertyTypes` 要求;而 `JSON.stringify` 本来就会丢弃 undefined 键,
所以真正落进 sessionStorage 的形状没变)。`npm pack` 清单与 0.1.28 逐条相同(32 → 32)。

### 门禁与计数器

三配置 typecheck / build / 产物对拍 / lint / format:check / metrics(0 超限) / **162 tests** /
smoke / privacy-scan / privacy-gate --selftest 全绿。`as any` 仓内仍为 5(全在 `src/`,新增 0)、
非空断言 0;全仓无 `enum`/`namespace`/参数属性。eslint 面收敛:espree 不能解析类型注解,工具面
改由 `tsconfig.tools.json` 守门,且 `lint` 目标写成显式文件名——`eslint .` 在零匹配时静默 exit 0。

### 发布

`0.2.0-rc.1` … `rc.6` 全部走 dist-tag `rc`(六个均带 provenance),`latest` 与全部 `dsh-*`
线标签未动;正式版发 `next`,观察后人工转 `latest`。

## 0.1.17 – 0.1.28:硬化 12 版(paste-dock-hardening 计划)

> 一子项一版,回滚粒度 = 改动粒度。每版先发 `-rc.1`(dist-tag `rc`)再发正式版
> (dist-tag `next`),`latest` 收尾一次性转正。

## 0.1.17 — D1 数据重复

粘贴已落盘后，后续 UI 步骤（showToast / offerSidebarHint）抛错，不得把原文重插输入框。

- `saved` 标志在 then 分支**第一句**置位（任何可能抛的 UI 步骤之前）
- catch 分流：已落盘 → 只报告文件、不碰输入框；真失败 → 仍回填原文（旧语义不回归）
- 新增 `safeToast`：`showToast` 要遍历 React 订阅者，任一抛错会冒到调用方

门禁:116 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.18 — D2 序列化无超时

`serializeReference` 必须有超时上界；挂起不得让粘贴静默消失。

- `SERIALIZE_TIMEOUT_MS = 5000`（shared.ts，与两条 RPC 上界同处）
- 超时定时器在 `finally` 里 `clearTimeout`（不泄漏）
- 超时落回既有的非字符串早退 → 走纯文本引用，用户至少看到 chip 或文本之一

门禁:120 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.19 — HD8 碰撞重试无界

`for (let n = 0; ; n += 1)` 在占满名字的目录里会把每次粘贴变成静默挂起。

- 导出 `MAX_COLLISION_ATTEMPTS = 1000`（诚实负载到不了，有限则可报告）
- 超限抛错，信息含上限与修法（删/改粘贴目录下的占位文件）
- 空目录与 `-1` 后缀路径不回归；占满 1000 名用例实测 1.0s

门禁:123 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.20 — HD4 设置自述不实

`readSettings` 只探 `get`，0.1.7+ 的 `describe().user` 读路径是死代码：值对、来源标签永远 `deployment`。

- `SettingsServiceLike` 补可选 `describe()`；`readSettings` 双探针（`get` → `describe().user`，各自 typeof 守卫）
- `canConfigure` 按线判定：`get` 存在即真（0.1.5 的 schemastery 无 `.volatile()`，也不需要），否则 `describe` + `schemaVolatileCapable`
- 两条旧断言把缺陷固定住了，已改成更严的新语义（不是删断言）

门禁:128 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.21 — HD5 线上枚举退化

`getConfigResult$schema` 写 `z.string()`，而宿主联合类型是 `'user' | 'deployment'` —— 联合在边界蒸发。

- `z.enum(['user', 'deployment'])` —— 唯一与 TS 联合逐字对齐的写法
- 客户端 `RemoteConfig.minCharsSource` 同步收窄
- 非法值经该 schema 解析即抛（行为测试用 zod 直证）

门禁:132 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.22 — HD6 两条权威

`save_paste` 工具闭包启动期 `maxBytes` 快照，而服务每次重读：一次配置写入只对一条路径生效。

- 导出 `liveMaxBytesOf(raw)`（读活盒 + 硬默认）
- 服务 `maxBytes()` 与工具都走它，删除重复实现
- 启动期局部量降级为纯日志用途

门禁:135 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.23 — HD7 守卫缺位

`savePaste` 承诺拒绝直调者的任何输入，却只守了 `text`；`sessionId` 直达工作区路由。

- `assertPasteCallArgs(text, sessionId)` 具名导出（服务类需要活的 cordis context，单测够不着 → 守卫做成可测纯函数）
- 调用点位于 `resolveWorkspaceDir` **之前**（坏 sessionId 不能先被拿去路由）
- 两条参数同款错误信息

门禁:139 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.24 — HD9 路径拼写

`isRegisteredWorkspace` 比原始拼写：`ws/./x`、`ws//x`、`ws/sub/../x` 都被判「未注册」。

- `normalize()` 放在斜杠清理之前
- win32 大小写归一如旧
- 刻意不用 `realpath`（每次调都敲文件系统、还会解析 symlink，改变「注册」语义）

门禁:143 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.25 — D3 静默失效

`composerInsertion` 以四种不同原因静默返回 `null`：chip 一直不工作与「刻意走文本」无法区分。

- 一次性闩锁 `insertionMissWarned`：每进程只说第一个原因一条 warn（逐次刷屏会淹没真错误，零条则无法调试）
- 四种原因文本互不相同
- `null` 契约不变

门禁:146 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.26 — #30 设置行被永久禁用

一次 `getConfig` 超时 → `remote` 永久 null，控件禁用、无重试入口，只能切会话重挂载；`AbortError` 原文展示。

- `shared.configCache`：最后一次**宿主确认**的配置；首屏直接用它
- 有界重试 1s / 3s，复用同一条加载路径（重试按钮也走它）
- `AbortError` 转可读中文；`CONFIG_TIMEOUT_MS` 5000 → 8000
- 失败态出「重试」按钮，且不再禁用控件
- 卸载同时 abort 在途请求 + 清待跑重试；迟到响应丢弃

门禁:152 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.27 — #27 目录与清理

粘贴永远落工作区 `pastes/`，无法挪走、无保留期 —— #27 的三条诉求在本仓全部复现。

- `pasteDir`：空=历史默认（不变）；相对=工作区内子目录；绝对=工作区外；含 `..` 直接报错
- `retainDays`：0=永不删（默认），上限 3650；保存成功后按需清理
- 清理范围极窄：只删本插件自己的 `YYYYMMDD-HHMMSSmmm[-label].txt`，不递归，同目录其他文件不动
- 落点在工作区外时引用改绝对路径（dsh 的 `@` 语法：相对从工作区根解析、绝对指向主机文件）—— spike PASS
- cordis.patch.yml + README（中/英/葡）补目录与清理一节，含 `.gitignore` / `.git/info/exclude` 配方

门禁:158 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.28 — spill#1 强制原文出口

超过阈值就拦，没有任何「这次别拦」或「以后都别拦」的出口。

- `alwaysRaw: true` —— 本插件不再拦截任何粘贴（不落盘/不出 chip/不进 dock）；普通配置项，非 volatile（部署级决定）
- 按住 `Shift` 粘贴 = 一次性绕过，无需改配置
- 两个判定都在 `preventDefault` **之前**（之后已经没有可跳过的了），各留一行 console
- typert 线上 schema 与 cordis.patch.yml 同步

门禁:162 tests / eslint 0 / metrics 0 / prettier / privacy PASS / smoke OK。

## 0.1.14 (2026-11-26)

**设置卡底栏 Star 快车道：★ 直接打开仓库页（不再只静默收起），隐藏独立成 ×。**

- 新增 `src/client/star-row-copy.ts`（由 `_tools/star-row/sync.mjs` 从 kit 真源生成，禁手改）：GitHub 图标 + owner/repo 链接 ｜ 求星话术 ｜ ★ CTA ｜ × 隐藏。
- **修 S 档旧缺陷**：点 ★ 此前写成 `starDismiss()`，与「别打扰我」合流，仓库页一次都没打开过。现在 ★ 走锚点 click 打开 `REPO_URL`（不写 dismissed），× 才写 `dsh.star.<ns>.dismissed=1` 并收话术与两钮；链接段永留。
- 真源 `STAR:EXTENDED` 段单源维护，A/L 档副本由 sync 整段剥除，已发布 A/L 仓零 diff。
- 文案 10 语按 `documentElement.lang` 前缀自选；样式只走 `--dsw-alias-*` 令牌与 `currentColor`，零硬色。

## v0.1.3(客户端 TS 化 + 源级守卫迁移,直发 `latest`)

- **web 半身 TS 化**:`src/client.js` 巨石(约 1700 行)拆为 `src/client/` 九个严格类型模块(shared/rpc/composer/chip/registry/dock/toast/hint/settings + index 入口),`tsc -p tsconfig.client.json` 严格检查;tsdown 打成**同一个** `__ModuleLoader__` 单文件 `dist/client.js`,装载契约与产物形状逐字节兼容。
- 守卫迁移:112 项测试中的客户端源级守卫全部重指向模块化源码;`insertTextAtCaret`/toast 定时器/会话闩锁等契约保持不变。
- 门禁:eslint 0 / metrics 0 超限 / prettier 0 / 112 tests / typecheck 双 tsconfig / smoke。

## v0.1.2(真机反馈四连修)

- dock 卡片不透明底 + 深浅色自适应;居中(order 0 + align center);粘贴开头预览贯通徽标与卡片;order 0。
- 112 tests / eslint 0 / metrics 0 超限。

## v0.1.1(桌面版首测无 dock 的修复)

- dock 改为 `inject(sessionId)` 自给自足模式(对齐 0.1.7+ 槽位契约):注册槽位自带 `inject` 钩子,自行 resolve 会话 facade 注入 props,不再依赖 0.1.2–0.1.5 时代的标准 props。
- 多粘贴徽标编号:`📄`/`📄2`/`📄3`…。

## v0.1.0(首发)

- 宿主:pasteStore 服务(savePaste/getConfig/setMinChars)+ `save_paste` 纪律工具,`pastes/<ts>.txt` 落盘(1 MiB 默认上限、CRLF/BOM/UTF-8 逐字节保真),100 项单测。
- 客户端:大段粘贴拦截(阈值宿主权威)+ dsh 原生原子引用 chip(裸 mention、零请求 token)+ 输入框上方 dock(注册表 ∩ occurrences 投影、移除跨度手术、打开链路、sessionStorage 会话镜像)。
- 部署开关:`minChars`/`maxBytes`/`chipBadge`/`dock`。
