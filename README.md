# dsh-paste-dock

> DeepSeek Harness 插件:大段文本粘贴自动存为 `pastes/*.txt`,完整信息移到**输入框上方的 dock 卡片**,草稿里只留一枚可辨识的最小徽标。

## 它做什么

1. **大段粘贴转附件**:在输入框粘贴超过阈值(默认 500 字符)的文本时,客户端拦截粘贴,经 RPC 交给宿主写入当前会话工作区的 `pastes/<时间戳>.txt`(默认上限 1 MiB,CRLF/BOM/UTF-8 逐字节保真);保存失败自动把原文插回输入框并如实说明。宿主同时注册 `save_paste` 工具作纪律兜底。

2. **草稿内只留可辨识的最小徽标**:输入框里插入的是 dsh 原生原子引用 chip(与官方附件同一套节点),默认显示为 `📄 开头几个字…`(多粘贴依次为 `📄2`、`📄3`…,带各自开头预览)——
   - Backspace/Delete 一次整删,无逐字删除中间态;
   - 点击徽标,dsh 内核把它路由到右侧栏预览(装了 dsh-better-sidebar 可编辑);
   - 发送路径零改动:chip 序列化成裸 `@"pastes/x.txt"`,**不增加请求 token**,模型自己读文件;已发送消息渲染成同一张可点卡片。

3. **输入框上方 dock**(order 0,居中卡片):完整信息在 `conversation.input.dock` 槽位——📄、文件名、`开头预览… · N 字符 · 路径`、**✕ 从草稿移除**(文件保留)、**打开全文**(装了 dsh-better-sidebar 走它的编辑器;本机 loopback 部署可经宿主用系统应用打开;都没有时提示点击草稿徽标预览)。
   - dock 是草稿引用的**投影**:草稿里删掉徽标,卡片同步消失;卡片 ✕,草稿里的 mention 同步删除;
   - 只认领本插件创建的引用,手输的 `@"pastes/…"` 不会被认领;
   - 注册表镜像 sessionStorage,会话切走再切回卡片仍在;整页刷新后引用仍有效,但 dock 可能忘记卡片元数据。

4. **facade 缺失自动降级**:老 dsh 线或输入框正忙时,退回文本引用 ` @"pastes/x.txt" (N 字符)`——发送后同样渲染成可点卡片,dock 也能识别它。

## 安装

```sh
# 本地目录安装(在本仓库父目录执行):
dsh plugin --profile web add ./dsh-paste-dock
dsh --profile web          # 重启后控制台可见 [dsh-paste-dock] …
```

npm 发布后可 `dsh plugin --profile <p> add dsh-paste-dock`。桌面版需在它自己的 profile 上单独安装一次。

## 配置(cordis.patch.yml,部署默认;改完重启 dsh,无需重建)

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `minChars` | 500 | 大段粘贴阈值(UTF-16 code units)。用户可在 Settings → General 覆盖(即时生效) |
| `maxBytes` | 1048576 | 单次粘贴字节上限,宿主强制;硬顶 64 MiB |
| `chipBadge` | `true` | 草稿 chip 显示为最小徽标;`false` 恢复 `文件名 · N 字符` 完整 label |
| `dock` | `true` | 输入框上方 dock;`false` 不注入槽位(保存功能不受影响) |

客户端 bundle 拿不到 row config,以上值经 `pasteStore/getConfig` RPC 下发,本地默认仅兜底。

## 建议搭配 AGENTS.md 纪律

```markdown
## dsh-paste-dock 纪律
用户粘贴大段文字(约 500 字符以上)时:若输入框钩子未拦截,主动调用 save_paste 工具
把文本存入 pastes/<时间戳>.txt,并在回复中引用该工作区相对路径,不要复述原文。
```

## 已知限制

- **切会话后 chip 退化为文本引用**:dsh 的草稿镜像只存文本(上游宿主限制),退化后的 `@"…" (N 字符)` 仍可发送、仍渲染成卡片,dock 也能识别。
- **better-sidebar 编辑保存 400**:上游 [DSH-better-sidebar#646](https://github.com/omdsh-dev/DSH-better-sidebar/issues/646)(相对/绝对路径不一致),与本插件无关;从它的文件树打开同一文件即可保存。
- **dock 卡片的"打开"**:better-sidebar 探测走 `openFile`/`openPath`/`open` 方法名,服务未暴露时落到宿主 `openWorkspacePath`(仅 loopback)。
- 普通文件/图片粘贴**不接管**:DSH 原生附件管线已覆盖。

## 开发

```sh
pnpm install            # 或 npx pnpm@10 install --frozen-lockfile
npm run build:all       # tsc(宿主) + tsdown(client 单 bundle)→ dist/,同步 lib/(双份入库)
npm test                # node --test(112 项:宿主单测 + 客户端源级契约守卫)
npm run typecheck       # 宿主 + 客户端两套 tsconfig 严格检查
npm run lint && npm run format:check && npm run privacy && npm run metrics
```

源码结构:`src/index.ts` + `src/typert.host.ts`(宿主半身,tsc);`src/client/*.ts`(web 半身,按 shared/rpc/composer/chip/registry/dock/toast/hint/settings 分模块,tsdown 打成单文件 `dist/client.js`,保持 `window.__ModuleLoader__.load` 装载契约)。

peer 范围 `^0.1.5-rc.1 || ^0.2.0-rc.2` 两段并列——别改回单段或开区间,dsh 挂载前逐包 semver 校验,不满足整包拒载。

## License

MIT — Copyright (c) 2026 drscrewdriver
