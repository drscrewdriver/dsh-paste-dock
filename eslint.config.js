// eslint.config.js — dsh-paste-dock ESLint 9/10 flat config（防屎山 P1 守门）
//
// 范围（白名单策略，2026-11-28 起随工具链 TS 化收口）：
//   eslint.config.js —— 本仓唯一剩下的纯 JS 文件，也是 lint 的唯一实际目标。
//
// 不 lint，且**不假装在 lint**：
//   src/**            —— host + web client 两个半身，全部 `.ts`，由
//                        `tsc -p tsconfig.json --noEmit` / `tsc -p tsconfig.client.json` 守门。
//   scripts/** tools/** smoke.ts —— 工具链，0.2.0-rc.1 起 `.mjs`→`.ts`，
//                        由 `tsc -p tsconfig.tools.json` 守门（见下方「为什么不是 eslint」）。
//   tests/**          —— node:test 契约/回归测试自证，不受 lint 约束（与 doc2md 口径一致）。
//   dist/             —— 构建产物（tools/metrics.ts 同样不度量）。
//
// 为什么工具面不能留在 eslint 里（实测，不是推测）：
//   eslint 核心的 espree 解析器不吃类型语法 —— 对 `const a: number = 1` 直接
//   `Parsing error: Unexpected token :`（eslint 10.10.0 实测）。要让 lint 覆盖 `.ts`
//   就得引入 @typescript-eslint/parser，而本仓从 P1 起就刻意「TS 由 tsc 守门、
//   不再引入 typescript-eslint」。引入新解析器是另一片的事，记录在
//   .agents/plans/paste-dock-ts-rewrite/findings.md。
//
// 为什么 `files` 要写成显式文件名而不是目录：
//   目录展开（`eslint .`）在**一个文件都不匹配时静默 exit 0** —— 门禁退化成装饰。
//   显式目标一旦落空，eslint 直接报「No files matching the pattern」，红给看得见。
//
// 规则：@eslint/js recommended + 核心复杂度守门（warn）。
//   硬门禁（超限函数必须为 0，exit 1）由 `npm run metrics`（tools/metrics.ts）承担——
//   与 doc2md 同一分工：lint 报静态错误，metrics 做复杂度红名单门禁。
import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

const COMMON = {
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: {
    ...js.configs.recommended.rules,
    complexity: ['warn', { max: 10 }],
  },
}

/** Node 端配置脚本（仓内唯一的纯 JS 面）。 */
const NODE = {
  files: ['eslint.config.js'],
  ...COMMON,
  languageOptions: { ...COMMON.languageOptions, globals: globals.node },
}

export default [
  { ignores: ['node_modules/**', 'dist/**', 'pastes/**', '*.tgz'] },
  NODE,
  prettier, // 关闭与 Prettier 冲突的规则（必须置尾）
]
