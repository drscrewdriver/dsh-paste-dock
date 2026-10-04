// 默认只校验;--write 从 hosts.mjs 单一事实源同步发布元数据。
// 覆盖写点(本仓全景,见迁移包 findings §1.2):
//   1. package.json peerDependencies —— dsh-* 两条 peer ← peerRange
//   2. package.json engines.dsh —— 补建首例:无 dsh 字段时写入,同 peerRange
//      (engines 是加载器预检闸门,与 peer 安装闸门必须同口径,INDEX §C)
//   3. package.json devDependencies —— dsh-* 钉点 ← developmentHost
//   4. README.md peer 范围句 —— 脚本托管,禁止手改
// engines.node 与其余字段一律不动。
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { supportedHosts, peerRange, developmentHost, assertHostPeers } from './hosts.mjs'

const manifestUrl = new URL('../package.json', import.meta.url)
const original = await readFile(manifestUrl, 'utf8')
const manifest = JSON.parse(original)

assert.equal(new Set(supportedHosts).size, supportedHosts.length, 'supportedHosts 有重复版本')
assert(supportedHosts.includes(developmentHost), 'developmentHost 不在 supportedHosts 内')

const dshPeerNames = Object.keys(manifest.peerDependencies ?? {}).filter((name) =>
  name.startsWith('@deepseek-ai/dsh-'),
)
assert(dshPeerNames.length > 0, 'peerDependencies 缺少 @deepseek-ai/dsh-* 条目')

for (const name of dshPeerNames) {
  manifest.peerDependencies[name] = peerRange
}
// 契约断言校验同步后的产物(spec §3.1:两条 peer 同串),不是同步前的旧值。
assertHostPeers(manifest.peerDependencies)
// engines.dsh 补建:本仓 engines 原本只有 node。保持 node 原样,只托管 dsh 键。
manifest.engines ??= {}
manifest.engines.dsh = peerRange
for (const name of Object.keys(manifest.devDependencies ?? {})) {
  if (name.startsWith('@deepseek-ai/dsh-')) manifest.devDependencies[name] = developmentHost
}

const expected = JSON.stringify(manifest, null, 2) + '\n'
const write = process.argv.includes('--write')
if (write) await writeFile(manifestUrl, expected)
else {
  assert.deepEqual(
    JSON.parse(original),
    manifest,
    'package.json 与 hosts.mjs 不一致;运行 node scripts/sync-hosts.mjs --write',
  )
}

// README 兼容句(单句托管,迁移包 findings §1.1-4:本仓无 zh-CN、无版本表)。
const readmeUrl = new URL('../README.md', import.meta.url)
const readme = await readFile(readmeUrl, 'utf8')
const readmePattern = /^peer 范围 `[^`]+`.*$/m
const readmeLine =
  `peer 范围 ${supportedHosts.map((v) => '`' + v + '`').join(' || ')} ` +
  '枚举白名单——由 scripts/hosts.mjs 经 `node scripts/sync-hosts.mjs --write` 下发,' +
  '与 `engines.dsh` 同源;dsh 挂载前逐包 semver 校验,不满足整包拒载,勿手改。'
assert(readmePattern.test(readme), 'README.md 缺少 peer 范围句')
if (write) await writeFile(readmeUrl, readme.replace(readmePattern, readmeLine))
else
  assert.equal(
    readme.match(readmePattern)[0],
    readmeLine,
    'README.md 兼容句需要同步;运行 node scripts/sync-hosts.mjs --write',
  )

console.log(
  write
    ? `已下发:peer×${dshPeerNames.length} + engines.dsh + devDeps 钉点 ${developmentHost} + README 句`
    : '校验通过:package.json / README.md 与 hosts.mjs 一致',
)
