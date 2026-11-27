# CODE-METRICS.md — dsh-paste-dock 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.ts）；生成时间：2026-11-27T18:08:23.069Z
> 度量对象：`scripts/**/*.ts` + `smoke.ts`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。解析器 = typescript 编译器 API（espree 不吃类型注解）。
> 阈值：圈复杂度 ≤10、认知复杂度 ≤15（超限 = 红名单，metrics exit 1）。

## 1. 总览

- 度量文件数：6；函数总数：59；**超限函数数：0**
- 圈复杂度最高：10；认知复杂度最高：13

## 2. 超限红名单（重构/拆分优先级）

**无（当前基线健康）**

## 3. 全量函数清单

| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |
|---|---|---|---|---|
| scripts/test-host-compatibility.ts | stopProcess | 196 | 10 | 12 |
| scripts/test-host-compatibility.ts | findNpm | 128 | 8 | 13 |
| scripts/release.ts | sh | 87 | 6 | 6 |
| scripts/hosts.ts | assertHostPeers | 48 | 5 | 5 |
| smoke.ts | refuses | 60 | 4 | 4 |
| scripts/test-host-compatibility.ts | pinHostDependencies | 112 | 3 | 4 |
| scripts/release.ts | errText | 79 | 3 | 2 |
| scripts/release.ts | incVersion | 241 | 3 | 2 |
| scripts/test-host-compatibility.ts | (anonymous) | 52 | 3 | 2 |
| scripts/test-host-compatibility.ts | (anonymous) | 118 | 3 | 2 |
| scripts/release.ts | gitOk | 103 | 2 | 1 |
| scripts/test-host-compatibility.ts | firstLine | 32 | 2 | 1 |
| scripts/test-host-compatibility.ts | cordisPin | 82 | 2 | 1 |
| scripts/test-host-compatibility.ts | (anonymous) | 186 | 2 | 1 |
| scripts/test-host-compatibility.ts | observe | 412 | 2 | 1 |
| scripts/test-host-compatibility.ts | (anonymous) | 498 | 2 | 1 |
| smoke.ts | get | 48 | 2 | 1 |
| scripts/hosts.ts | (anonymous) | 49 | 1 | 0 |
| scripts/release.ts | (anonymous) | 54 | 1 | 0 |
| scripts/release.ts | log | 67 | 1 | 0 |
| scripts/release.ts | ok | 68 | 1 | 0 |
| scripts/release.ts | fail | 69 | 1 | 0 |
| scripts/release.ts | (anonymous) | 306 | 1 | 0 |
| scripts/release.ts | (anonymous) | 321 | 1 | 0 |
| scripts/sync-hosts.ts | (anonymous) | 27 | 1 | 0 |
| scripts/sync-hosts.ts | (anonymous) | 63 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 40 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 78 | 1 | 0 |
| scripts/test-host-compatibility.ts | hostCordisOverrides | 103 | 1 | 0 |
| scripts/test-host-compatibility.ts | run | 162 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 168 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 176 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 177 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 180 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 181 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 182 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 200 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 205 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 209 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 213 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 227 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 229 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 289 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 300 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 407 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 409 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 422 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 426 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 444 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 542 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 551 | 1 | 0 |
| smoke.ts | fail | 12 | 1 | 0 |
| smoke.ts | list | 51 | 1 | 0 |
| smoke.ts | (anonymous) | 71 | 1 | 0 |
| smoke.ts | (anonymous) | 72 | 1 | 0 |
| smoke.ts | get | 73 | 1 | 0 |
| smoke.ts | list | 73 | 1 | 0 |
| smoke.ts | get | 76 | 1 | 0 |
| smoke.ts | (anonymous) | 120 | 1 | 0 |

## 4. 口径与说明

- 圈复杂度：1 + if/for/while/do/switch-case/catch/三元 + 逻辑运算符（&& \|\| ??）；阈值 ≤10。
- 认知复杂度：**近似** Sonar 口径（控制流 1+嵌套深度、break/continue +1、逻辑运算符 +1）；阈值 ≤15——数值与官方可能差 1-2 分。
- 门禁：超限函数数 > 0 或存在解析失败文件 → `npm run metrics` exit 1（CI 硬门禁）。
- 与 eslint 的分工：eslint 报静态错误、复杂度只 warn；本脚本承担硬门禁。
