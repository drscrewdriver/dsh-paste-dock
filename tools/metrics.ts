// tools/metrics.ts — 复杂度度量报告 + 硬门禁（防屎山 P2）
//
// 运行：npm run metrics（或 node tools/metrics.ts）
// 产出：CODE-METRICS.md（每次运行覆盖写：基线 + 全量函数清单 + 超限红名单）
// 度量对象：src/**/*.js（web client 半身，历史遗留）+ scripts/**/*.ts + smoke.ts ——
//           与 eslint.config.js 的白名单口径一致（TS 面由 tsc 守门，这里只卡复杂度）；
//           src/*.ts 由 tsc 守门、tests/ 自证、dist/ 是构建产物，均不度量。
//
// 解析器（2026-11-28 起）：**typescript 编译器 API**，不再是 espree。
//   原因：被度量面已 TS 化，类型注解会让 espree 直接抛 Parsing error，
//   而「解析失败」在本门禁里是 exit 1（度量不可信）。曾用 ts.transpileModule 先剥
//   类型再喂 espree 做过对照——实测**不保行号**（多行签名被折叠、缩进被重写），
//   报告里的行号会失真。typescript 已是本仓 devDependency，零新增依赖。
//   等价性：切换时与 espree 版逐行对拍过函数清单（见 .agents/plans/paste-dock-ts-rewrite/findings.md）。
//
// 复杂度口径（与 eslint.config.js 的 `complexity` warn 规则对齐）：
//   - 圈复杂度（cyclomatic）：1 + 分支点（if/for/while/do/switch-case/catch/三元 + 逻辑运算符 && || ??）；
//     阈值 ≤10。
//   - 认知复杂度（cognitive）：近似 Sonar 口径——控制流结构 1+嵌套深度、break/continue +1、逻辑运算符 +1；
//     阈值 ≤15。⚠️ 近似实现，与 sonarjs 官方数值可能差 1-2 分。
//   - **嵌套函数体不计入外层函数**（标准口径）：每个函数独立度量——否则 `__ModuleLoader__`
//     的 factory 包装函数会把整包内层分支算到自己头上（假阳性）。
//
// 门禁：超限函数数 > 0，或存在解析失败文件（度量不可信）→ exit 1。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CYC_MAX = 10
const COG_MAX = 15

type Kind = ts.SyntaxKind
type Node = ts.Node

const SK = ts.SyntaxKind

/* ---------- AST 工具 ---------- */
const LOGICAL = new Set<Kind>([
  SK.AmpersandAmpersandToken,
  SK.BarBarToken,
  SK.QuestionQuestionToken,
])
const FN_KINDS = new Set<Kind>([
  SK.FunctionDeclaration,
  SK.FunctionExpression,
  SK.ArrowFunction,
  // 对象/类里的简写方法与存取器：espree 同样按 FunctionExpression 计入，口径不变。
  // （TS 5.6 已把 ClassMethod/ObjectMethod 合并进 MethodDeclaration，这里只有一个名。）
  SK.MethodDeclaration,
  SK.GetAccessor,
  SK.SetAccessor,
])
const CYC_POINTS = new Set<Kind>([
  SK.IfStatement,
  SK.ForStatement,
  SK.ForInStatement,
  SK.ForOfStatement,
  SK.WhileStatement,
  SK.DoStatement,
  SK.CatchClause,
  SK.ConditionalExpression,
])
const COG_STRUCT = new Set<Kind>([...CYC_POINTS, SK.SwitchStatement])
const COG_JUMP = new Set<Kind>([SK.BreakStatement, SK.ContinueStatement])

const isFunctionNode = (n: Node): boolean => FN_KINDS.has(n.kind)
/** 函数节点的方法体；存取器/箭头函数的 body 可能是表达式而非 Block。 */
const fnBody = (n: Node): Node | null => (n as { body?: Node }).body ?? null

/** 子节点，**跳过函数体以外的注释**（ts.forEachChild 本就不给 trivia）。 */
function childNodes(n: Node): Node[] {
  const out: Node[] = []
  ts.forEachChild(n, (c) => {
    out.push(c)
  })
  return out
}

function walkFiles(dir: string, exts: string[], out: string[]): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkFiles(p, exts, out)
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p)
  }
  return out
}

/** Identifier 的名字，非 Identifier 一律 null（与旧 identName 同口径）。 */
function identName(n: Node | undefined): string | null {
  return n && n.kind === SK.Identifier ? (n as ts.Identifier).text : null
}
/** 带 `.name` 的键节点（PropertyAssignment / MethodDeclaration / 类方法）。 */
function namedKey(n: Node | undefined): string | null {
  if (!n) return null
  return identName((n as { name?: Node }).name)
}

const PARENT_NAME_OF: Partial<Record<Kind, (p: Node) => string | null>> = {
  [SK.VariableDeclaration]: (p) => identName((p as ts.VariableDeclaration).name),
  [SK.PropertyAssignment]: (p) => namedKey(p),
  [SK.BinaryExpression]: (p) => namedKey((p as ts.BinaryExpression).left),
}

function fnName(node: Node, parent: Node | null): string {
  if (node.kind === SK.FunctionDeclaration) {
    const declared = identName((node as ts.FunctionDeclaration).name)
    if (declared) return declared
  }
  if (!parent) return '(anonymous)'
  const pick = PARENT_NAME_OF[parent.kind]
  return (pick ? pick(parent) : null) || namedKey(node) || '(anonymous)'
}

/* ---------- 圈复杂度：1 + 分支点 ---------- */
function countCycPoints(n: Node): number {
  let c = 0
  if (CYC_POINTS.has(n.kind)) c += 1
  if (n.kind === SK.CaseClause && (n as ts.CaseClause).expression) c += 1
  if (n.kind === SK.BinaryExpression && LOGICAL.has((n as ts.BinaryExpression).operatorToken.kind))
    c += 1
  for (const x of childNodes(n)) {
    // 嵌套函数体是独立度量单元，不计入外层函数的分（标准圈复杂度口径）。
    if (isFunctionNode(x)) continue
    c += countCycPoints(x)
  }
  return c
}
const cyclomatic = (node: Node): number => 1 + countCycPoints(node)

/* ---------- 认知复杂度（近似 Sonar） ---------- */
function nodeCogPoints(n: Node, nesting: number): number {
  let total = 0
  if (COG_STRUCT.has(n.kind)) total += 1 + nesting
  if (COG_JUMP.has(n.kind)) total += 1
  if (n.kind === SK.BinaryExpression && LOGICAL.has((n as ts.BinaryExpression).operatorToken.kind))
    total += 1
  return total
}

/** else-if 链不递增嵌套深度（Sonar 口径）。 */
function childNesting(parent: Node, child: Node, nextNest: number, nesting: number): number {
  const isElseIf =
    child === (parent as ts.IfStatement).elseStatement &&
    parent.kind === SK.IfStatement &&
    child.kind === SK.IfStatement
  return isElseIf ? nesting : nextNest
}

function cogVisit(n: Node, nesting: number): number {
  let total = nodeCogPoints(n, nesting)
  const nextNest = COG_STRUCT.has(n.kind) ? nesting + 1 : nesting
  for (const c of childNodes(n)) {
    // 嵌套函数体是独立度量单元，不计入外层函数的分（与圈复杂度口径一致）。
    if (isFunctionNode(c)) continue
    total += cogVisit(c, childNesting(n, c, nextNest, nesting))
  }
  return total
}
const cognitive = (node: Node): number => cogVisit(node, 0)

/* ---------- 目标收集 ---------- */
interface FuncRow {
  file: string
  name: string
  line: number
  cyclomatic: number
  cognitive: number
  overCyc?: boolean
  overCog?: boolean
}

const targets: string[] = []
const srcDir = path.join(ROOT, 'src')
const scriptsDir = path.join(ROOT, 'scripts')
const SOURCE_EXTS = ['.ts', '.mjs', '.js']
const smokeFile = SOURCE_EXTS.map((x) => path.join(ROOT, 'smoke' + x)).find((p) => fs.existsSync(p))
if (fs.existsSync(srcDir)) targets.push(...walkFiles(srcDir, ['.js'], []))
if (fs.existsSync(scriptsDir)) targets.push(...walkFiles(scriptsDir, ['.ts', '.mjs'], []).sort())
if (smokeFile) targets.push(smokeFile)

function collectFunctions(
  node: Node,
  parent: Node | null,
  sf: ts.SourceFile,
  out: FuncRow[],
): void {
  if (isFunctionNode(node)) {
    out.push({
      file: '',
      name: fnName(node, parent),
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      cyclomatic: cyclomatic(node),
      cognitive: cognitive(node),
    })
    collectFunctions(fnBody(node) || node, node, sf, out) // 内层函数同样计入（回调也是函数）
    return
  }
  for (const c of childNodes(node)) collectFunctions(c, node, sf, out)
}

const funcs: FuncRow[] = []
const parseErrors: { file: string; error: string }[] = []
for (const file of targets) {
  const source = fs.readFileSync(file, 'utf8')
  const fileName = file.split(path.sep).join('/')
  const scriptKind = /\.mjs$/.test(fileName)
    ? ts.ScriptKind.JS
    : /\.ts$/.test(fileName)
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind)
  const diag: readonly ts.DiagnosticWithLocation[] =
    (sf as unknown as { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] })
      .parseDiagnostics ?? []
  if (diag.length > 0) {
    const [first] = diag
    parseErrors.push({
      file: path.relative(ROOT, file).split(path.sep).join('/'),
      error: first ? ts.flattenDiagnosticMessageText(first.messageText, ' ') : 'parse failed',
    })
    continue
  }
  const fileFuncs: FuncRow[] = []
  collectFunctions(sf, null, sf, fileFuncs)
  for (const f of fileFuncs) {
    f.file = path.relative(ROOT, file).split(path.sep).join('/')
    f.overCyc = f.cyclomatic > CYC_MAX
    f.overCog = f.cognitive > COG_MAX
    funcs.push(f)
  }
}

const over = funcs.filter((f) => f.overCyc || f.overCog)

/* ---------- 报告 ---------- */
const lines: string[] = []
lines.push('# CODE-METRICS.md — dsh-paste-dock 代码度量报告（防屎山 P2）')
lines.push('')
lines.push(
  `> 生成命令：\`npm run metrics\`（node tools/metrics.ts）；生成时间：${new Date().toISOString()}`,
)
lines.push(
  '> 度量对象：`scripts/**/*.ts` + `smoke.ts`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。解析器 = typescript 编译器 API（espree 不吃类型注解）。',
)
lines.push(
  `> 阈值：圈复杂度 ≤${CYC_MAX}、认知复杂度 ≤${COG_MAX}（超限 = 红名单，metrics exit 1）。`,
)
lines.push('')
if (parseErrors.length > 0) {
  lines.push('## ⚠️ 解析失败文件（度量不可信，metrics 以 exit 1 失败）')
  lines.push('')
  for (const p of parseErrors) lines.push(`- ${p.file}：${p.error}`)
  lines.push('')
}
lines.push('## 1. 总览')
lines.push('')
lines.push(
  `- 度量文件数：${targets.length}；函数总数：${funcs.length}；**超限函数数：${over.length}**`,
)
lines.push(
  `- 圈复杂度最高：${funcs.length ? Math.max(...funcs.map((f) => f.cyclomatic)) : 0}；认知复杂度最高：${funcs.length ? Math.max(...funcs.map((f) => f.cognitive)) : 0}`,
)
lines.push('')
lines.push('## 2. 超限红名单（重构/拆分优先级）')
lines.push('')
if (over.length === 0) {
  lines.push('**无（当前基线健康）**')
} else {
  lines.push('| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |')
  lines.push('|---|---|---|---|---|')
  for (const f of over) {
    lines.push(
      `| ${f.file} | ${f.name} | ${f.line} | ${f.cyclomatic}${f.overCyc ? ' ⚠️' : ''} | ${f.cognitive}${f.overCog ? ' ⚠️' : ''} |`,
    )
  }
}
lines.push('')
lines.push('## 3. 全量函数清单')
lines.push('')
lines.push('| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |')
lines.push('|---|---|---|---|---|')
for (const f of [...funcs].sort(
  (a, b) => b.cyclomatic - a.cyclomatic || b.cognitive - a.cognitive,
)) {
  lines.push(`| ${f.file} | ${f.name} | ${f.line} | ${f.cyclomatic} | ${f.cognitive} |`)
}
lines.push('')
lines.push('## 4. 口径与说明')
lines.push('')
lines.push(
  `- 圈复杂度：1 + if/for/while/do/switch-case/catch/三元 + 逻辑运算符（&& \\|\\| ??）；阈值 ≤${CYC_MAX}。`,
)
lines.push(
  `- 认知复杂度：**近似** Sonar 口径（控制流 1+嵌套深度、break/continue +1、逻辑运算符 +1）；阈值 ≤${COG_MAX}——数值与官方可能差 1-2 分。`,
)
lines.push('- 门禁：超限函数数 > 0 或存在解析失败文件 → `npm run metrics` exit 1（CI 硬门禁）。')
lines.push('- 与 eslint 的分工：eslint 报静态错误、复杂度只 warn；本脚本承担硬门禁。')

const outPath = path.join(ROOT, 'CODE-METRICS.md')
fs.writeFileSync(outPath, lines.join('\n') + '\n')

console.log(`[metrics] 文件 ${targets.length}，函数 ${funcs.length}，超限 ${over.length}`)
for (const f of over) {
  console.log(
    `[metrics] OVER  ${f.file}:${f.line} ${f.name} cyc=${f.cyclomatic} cog=${f.cognitive}`,
  )
}
console.log(`[metrics] 报告已写 ${path.relative(ROOT, outPath)}`)
if (over.length > 0) process.exitCode = 1
if (parseErrors.length > 0) {
  console.log(`[metrics] 解析失败 ${parseErrors.length} 个文件——度量不可信 → exit 1`)
  process.exitCode = 1
}
