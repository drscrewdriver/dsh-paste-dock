# CODE-METRICS.md — dsh-paste-dock 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.ts）；生成时间：2026-11-27T18:05:36.016Z
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
| scripts/test-host-compatibility.ts | stopProcess | 195 | 10 | 12 |
| scripts/test-host-compatibility.ts | findNpm | 127 | 8 | 13 |
| scripts/release.ts | sh | 87 | 6 | 6 |
| scripts/hosts.ts | assertHostPeers | 48 | 5 | 5 |
| smoke.mjs | refuses | 58 | 4 | 4 |
| scripts/test-host-compatibility.ts | pinHostDependencies | 111 | 3 | 4 |
| scripts/release.ts | errText | 79 | 3 | 2 |
| scripts/release.ts | incVersion | 241 | 3 | 2 |
| scripts/test-host-compatibility.ts | (anonymous) | 51 | 3 | 2 |
| scripts/test-host-compatibility.ts | (anonymous) | 117 | 3 | 2 |
| scripts/release.ts | gitOk | 103 | 2 | 1 |
| scripts/test-host-compatibility.ts | firstLine | 31 | 2 | 1 |
| scripts/test-host-compatibility.ts | cordisPin | 81 | 2 | 1 |
| scripts/test-host-compatibility.ts | (anonymous) | 185 | 2 | 1 |
| scripts/test-host-compatibility.ts | observe | 405 | 2 | 1 |
| scripts/test-host-compatibility.ts | (anonymous) | 491 | 2 | 1 |
| smoke.mjs | get | 46 | 2 | 1 |
| scripts/hosts.ts | (anonymous) | 49 | 1 | 0 |
| scripts/release.ts | (anonymous) | 54 | 1 | 0 |
| scripts/release.ts | log | 67 | 1 | 0 |
| scripts/release.ts | ok | 68 | 1 | 0 |
| scripts/release.ts | fail | 69 | 1 | 0 |
| scripts/release.ts | (anonymous) | 306 | 1 | 0 |
| scripts/release.ts | (anonymous) | 321 | 1 | 0 |
| scripts/sync-hosts.ts | (anonymous) | 27 | 1 | 0 |
| scripts/sync-hosts.ts | (anonymous) | 63 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 39 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 77 | 1 | 0 |
| scripts/test-host-compatibility.ts | hostCordisOverrides | 102 | 1 | 0 |
| scripts/test-host-compatibility.ts | run | 161 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 167 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 175 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 176 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 179 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 180 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 181 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 199 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 204 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 208 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 212 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 226 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 228 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 288 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 299 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 400 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 402 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 415 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 419 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 437 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 535 | 1 | 0 |
| scripts/test-host-compatibility.ts | (anonymous) | 544 | 1 | 0 |
| smoke.mjs | fail | 10 | 1 | 0 |
| smoke.mjs | list | 49 | 1 | 0 |
| smoke.mjs | (anonymous) | 69 | 1 | 0 |
| smoke.mjs | (anonymous) | 70 | 1 | 0 |
| smoke.mjs | get | 71 | 1 | 0 |
| smoke.mjs | list | 71 | 1 | 0 |
| smoke.mjs | get | 74 | 1 | 0 |
| smoke.mjs | (anonymous) | 118 | 1 | 0 |

## 4. 口径与说明

- 圈复杂度：1 + if/for/while/do/switch-case/catch/三元 + 逻辑运算符（&& \|\| ??）；阈值 ≤10。
- 认知复杂度：**近似** Sonar 口径（控制流 1+嵌套深度、break/continue +1、逻辑运算符 +1）；阈值 ≤15——数值与官方可能差 1-2 分。
- 门禁：超限函数数 > 0 或存在解析失败文件 → `npm run metrics` exit 1（CI 硬门禁）。
- 与 eslint 的分工：eslint 报静态错误、复杂度只 warn；本脚本承担硬门禁。
