# CODE-METRICS.md — dsh-paste-dock 代码度量报告（防屎山 P2）

> 生成命令：`npm run metrics`（node tools/metrics.mjs）；生成时间：2026-11-05T06:26:29.440Z
> 度量对象：`src/**/*.js`（web client 半身）+ `scripts/**/*.mjs` + `smoke.mjs`；`src/*.ts` 由 tsc 守门、`tests/` 自证、构建产物不度量。
> 阈值：圈复杂度 ≤10、认知复杂度 ≤15（超限 = 红名单，metrics exit 1）。

## 1. 总览

- 度量文件数：6；函数总数：58；**超限函数数：0**
- 圈复杂度最高：9；认知复杂度最高：13

## 2. 超限红名单（重构/拆分优先级）

**无（当前基线健康）**

## 3. 全量函数清单

| 文件 | 函数 | 行 | 圈复杂度 | 认知复杂度 |
|---|---|---|---|---|
| scripts/test-host-compatibility.mjs | stopProcess | 184 | 9 | 11 |
| scripts/test-host-compatibility.mjs | findNpm | 122 | 8 | 13 |
| scripts/release.mjs | sh | 72 | 6 | 6 |
| scripts/hosts.mjs | assertHostPeers | 41 | 5 | 5 |
| smoke.mjs | refuses | 58 | 4 | 4 |
| scripts/test-host-compatibility.mjs | pinHostDependencies | 107 | 3 | 4 |
| scripts/release.mjs | incVersion | 226 | 3 | 2 |
| scripts/test-host-compatibility.mjs | (anonymous) | 51 | 3 | 2 |
| scripts/test-host-compatibility.mjs | (anonymous) | 112 | 3 | 2 |
| scripts/release.mjs | gitOk | 88 | 2 | 1 |
| scripts/test-host-compatibility.mjs | firstLine | 31 | 2 | 1 |
| scripts/test-host-compatibility.mjs | cordisPin | 81 | 2 | 1 |
| scripts/test-host-compatibility.mjs | (anonymous) | 174 | 2 | 1 |
| scripts/test-host-compatibility.mjs | observe | 345 | 2 | 1 |
| scripts/test-host-compatibility.mjs | (anonymous) | 431 | 2 | 1 |
| smoke.mjs | get | 46 | 2 | 1 |
| scripts/hosts.mjs | (anonymous) | 42 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 52 | 1 | 0 |
| scripts/release.mjs | log | 65 | 1 | 0 |
| scripts/release.mjs | ok | 66 | 1 | 0 |
| scripts/release.mjs | fail | 67 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 291 | 1 | 0 |
| scripts/release.mjs | (anonymous) | 306 | 1 | 0 |
| scripts/sync-hosts.mjs | (anonymous) | 20 | 1 | 0 |
| scripts/sync-hosts.mjs | (anonymous) | 53 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 39 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 77 | 1 | 0 |
| scripts/test-host-compatibility.mjs | hostCordisOverrides | 102 | 1 | 0 |
| scripts/test-host-compatibility.mjs | run | 155 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 156 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 164 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 165 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 168 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 169 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 170 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 187 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 192 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 196 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 200 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 213 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 215 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 231 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 242 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 340 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 342 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 355 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 359 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 377 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 474 | 1 | 0 |
| scripts/test-host-compatibility.mjs | (anonymous) | 483 | 1 | 0 |
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
