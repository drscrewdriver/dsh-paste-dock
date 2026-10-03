# dsh-paste-dock 发布检查清单(Release Checklist)

> 发版走 `npm run release`(自动控版本号/构建/测试/pack 核对 → PR → 合并后打 tag → OIDC publish,`next` 观察后人工转 `latest`)。

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
