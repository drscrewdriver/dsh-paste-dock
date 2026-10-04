// 单一事实源:本插件支持的全部宿主 rc。
// 升级流程:supportedHosts 增删版本 → node scripts/sync-hosts.mjs --write
// → 矩阵绿(scripts/test-host-compatibility.mjs)→ 发版。
// peer / engines.dsh / devDeps 钉点 / README 兼容句一律由 sync-hosts 下发,禁止手改。
//
// 为什么是精确枚举而不是 semver 区间:semver 预发布只能被同 [major,minor,patch]
// 三元组的比较器匹配,任何跨线写法(如 `^0.1.5-rc.1 || ^0.2.0-rc.2`)都会把
// 中间线(整条 0.1.7)静默排除——枚举串是"实测过的宿主白名单",不是范围声明。
export const supportedHosts = Object.freeze([
  // 0.1.0 线(5 rc)
  '0.1.0-rc.2',
  '0.1.0-rc.3',
  '0.1.0-rc.6',
  '0.1.0-rc.7',
  '0.1.0-rc.8',
  // 0.1.1 线(2 rc)
  '0.1.1-rc.1',
  '0.1.1-rc.2',
  // 0.1.2 线(1 rc)
  '0.1.2-rc.1',
  // 0.1.5 线(3 rc,历史已验证线)
  '0.1.5-rc.1',
  '0.1.5-rc.2',
  '0.1.5-rc.3',
  // 0.1.7 线(2 rc,v0.1.3 的 peer 曾静默漏掉整条线)
  '0.1.7-rc.1',
  '0.1.7-rc.2',
  // 0.2.0 线(2 rc)
  '0.2.0-rc.1',
  '0.2.0-rc.2',
])
export const peerRange = supportedHosts.join(' || ')
export const developmentHost = '0.2.0-rc.2' // devDependencies 全部钉这里

// 本仓契约断言(sync-hosts 调用)。参考仓模板的 requiredHostPeers 清单在本仓
// 收窄为不变式:每条 dsh-* peer 都必须同串且等于 peerRange(spec §3.1 要求
// 两条 peer 同串)。无 dsh-* peer 时不做断言,保持导出可选。
export function assertHostPeers(peers) {
  const dshPeers = Object.entries(peers ?? {}).filter(([name]) =>
    name.startsWith('@deepseek-ai/dsh-'),
  )
  if (dshPeers.length === 0) return // 可选导出:无 dsh-* peer 时不做断言
  for (const [name, range] of dshPeers) {
    if (range !== peerRange) {
      throw new Error(`peer ${name} 与 peerRange 不一致;运行 node scripts/sync-hosts.mjs --write`)
    }
  }
}
