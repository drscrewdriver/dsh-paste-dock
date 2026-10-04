// 本地隔离宿主矩阵:对 supportedHosts 的每个 rc,在沙箱里装真实宿主、
// 经 peer 闸装插件、带探针启动宿主、HTTP 回读断言,证据落 .compat-results/<version>/。
//
// 用法(仓库根目录,先 npm run build:all):
//   node scripts/test-host-compatibility.mjs                  # 全部 supportedHosts
//   node scripts/test-host-compatibility.mjs 0.1.7-rc.2 ...   # 指定格
//   --keep   失败或加此旗标时保留沙箱;--serve 检查后保留宿主供浏览器验收
//
// 适配自 reffer-dsh-plugins/dsh-skills-manager 的同名脚本(执行体换成
// paste-dock 的探针断言);cordis 钉线规则同其 compat-dependencies.mjs:
// 0.1.7+ 线宿主依赖 cordis ~4.0.4,更早线锁 4.0.2——官方 cordis 插件最新版
// 只接受 ~4.0.4,旧宿主若浮动,HMR 服务不注册,补丁监听直接退出。
import { spawn } from 'node:child_process'
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  cp,
  realpath,
  access,
  rm,
  readdir,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, delimiter, relative, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { supportedHosts, peerRange } from './hosts.mjs'

const firstLine = (error) =>
  String(error?.message || error)
    .split('\n')[0]
    .slice(0, 200)

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const serve = args.includes('--serve')
const versions = args.filter((a) => !a.startsWith('--'))
const list = versions.length ? versions : [...supportedHosts]
for (const version of versions) {
  assert(
    supportedHosts.includes(version),
    `${version} 不在 supportedHosts 内(peerRange = ${peerRange})`,
  )
}
if (list.length > 1) {
  // 探索性矩阵:一格失败不停批,全格跑完再汇总(失败格的证据已各自落盘)。
  const failed = []
  for (const version of list) {
    const code = await new Promise((done, reject) => {
      const child = spawn(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          version,
          ...(keep ? ['--keep'] : []),
          ...(serve ? ['--serve'] : []),
        ],
        { stdio: 'inherit', windowsHide: true },
      )
      child.once('error', reject)
      child.once('exit', done)
    })
    if (code !== 0) failed.push(version)
  }
  console.log(
    failed.length
      ? `矩阵汇总:${list.length - failed.length}/${list.length} 绿;失败格:${failed.join(', ')}`
      : `矩阵汇总:${list.length}/${list.length} 全绿`,
  )
  process.exit(failed.length ? 1 : 0)
}
const [version] = list
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const peerNames = Object.keys(manifest.peerDependencies).filter((name) =>
  name.startsWith('@deepseek-ai/dsh-'),
)

function cordisPin(hostVersion) {
  const [triplet] = hostVersion.split('-')
  const [maj, min, patch] = triplet.split('.').map(Number)
  return [maj, min, patch] >= [0, 1, 7] ? '4.0.4' : '4.0.2'
}
const CORDIS_PLUGIN_PINS = {
  '4.0.2': {
    '@deepseek-ai/cordis-plugin-group': '1.0.2',
    '@deepseek-ai/cordis-plugin-hmr': '1.0.17',
    '@deepseek-ai/cordis-plugin-include': '1.0.7',
    '@deepseek-ai/cordis-plugin-loader': '1.0.3',
    '@deepseek-ai/cordis-plugin-timer': '1.1.4',
  },
  '4.0.4': {
    '@deepseek-ai/cordis-plugin-group': '1.0.4',
    '@deepseek-ai/cordis-plugin-hmr': '1.0.19',
    '@deepseek-ai/cordis-plugin-include': '1.0.9',
    '@deepseek-ai/cordis-plugin-loader': '1.0.5',
    '@deepseek-ai/cordis-plugin-timer': '1.1.6',
  },
}
function hostCordisOverrides(hostVersion) {
  const cordis = cordisPin(hostVersion)
  return { '@deepseek-ai/cordis': cordis, ...CORDIS_PLUGIN_PINS[cordis] }
}
// pnpm 的通配 override 不保证匹配传递依赖;解析每个包时统一官方版本。
function pinHostDependencies(manifest_, version_) {
  const pinned = { ...manifest_ }
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (!manifest_[field]) continue
    pinned[field] = Object.fromEntries(
      Object.entries(manifest_[field]).map(([name, range]) => [
        name,
        name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-') ? version_ : range,
      ]),
    )
  }
  return pinned
}

// 从 PATH shim 定位 npm 的 node 入口(Windows 无 pnpm 时经 npm exec 调 pnpm@10)。
async function findNpm() {
  for (const directory of (process.env.PATH || '').split(delimiter)) {
    const shim = join(directory, 'npm' + (process.platform === 'win32' ? '.cmd' : ''))
    try {
      const target = await realpath(shim)
      if (process.platform !== 'win32') return target
      for (const candidate of ['node_modules/npm/bin/npm-cli.js']) {
        const entry = resolve(dirname(target), candidate)
        try {
          await access(entry)
          return entry
        } catch {
          // 候选布局不存在,继续找下一个 PATH 目录。
        }
      }
    } catch {
      // 该 PATH 目录没有 npm shim。
    }
  }
  throw new Error('PATH 中找不到可运行的 npm 入口')
}
const npm = await findNpm()
const sandboxRoot = await mkdtemp(join(tmpdir(), 'dsh-paste-dock-compat-'))
const sandbox = join(sandboxRoot, version)
await mkdir(sandbox, { recursive: true })
const env = {
  ...process.env,
  DSH_HOME: join(sandbox, 'home'),
  USERPROFILE: join(sandbox, 'user'),
}
await mkdir(join(env.USERPROFILE), { recursive: true })
await mkdir(join(sandbox, 'workspace'), { recursive: true })

async function run(args_, cwd = sandbox, taskEnv = env, timeoutMs = 180000) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, args_, {
      cwd,
      env: taskEnv,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const timeout = setTimeout(() => {
      void stopProcess(child).catch((error) => console.error(error))
      reject(new Error(`命令超过 ${timeoutMs}ms:${args_.join(' ')}\n${output.slice(-4000)}`))
    }, timeoutMs)
    child.stdout.on('data', (data) => (output += data))
    child.stderr.on('data', (data) => (output += data))
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timeout)
      code === 0
        ? resolveRun(output)
        : reject(new Error(`${args_.join(' ')} (${code})\n${output.slice(-4000)}`))
    })
  })
}

// 仅终止本脚本启动的进程树;退出有界。
async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    await new Promise((done, reject) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      const timer = setTimeout(() => {
        killer.kill()
        reject(new Error('终止进程树超时'))
      }, 10000)
      killer.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      killer.once('exit', () => {
        clearTimeout(timer)
        done()
      })
    })
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((done) => {
      const timer = setTimeout(done, 10000)
      child.once('exit', () => {
        clearTimeout(timer)
        done()
      })
    })
  }
}

const report = { version, plugin: manifest.version, peerRange, sandbox, checks: [], warnings: [] }
let host
let hostLog = ''
let url
try {
  // 1. 沙箱:宿主 + 全部 dsh-* peer 同版本。
  const dependencies = Object.fromEntries([
    ['@deepseek-ai/dsh', version],
    ...peerNames.map((name) => [name, version]),
  ])
  await writeFile(
    join(sandbox, 'package.json'),
    JSON.stringify({ private: true, type: 'module', dependencies }, null, 2),
  )
  await writeFile(
    join(sandbox, 'pnpm-workspace.yaml'),
    `autoInstallPeers: true\nstrictPeerDependencies: false\noverrides:\n${Object.entries(
      hostCordisOverrides(version),
    )
      .map(([name, pinned]) => `  '${name}': '${pinned}'`)
      .join('\n')}\n`,
  )
  await writeFile(
    join(sandbox, '.pnpmfile.cjs'),
    `const pinHostDependencies = ${pinHostDependencies.toString()};\nmodule.exports = { hooks: { readPackage: pkg => pinHostDependencies(pkg, ${JSON.stringify(version)}) } };\n`,
    'utf8',
  )
  console.log(`${version}: 隔离安装 ${sandbox}`)
  const installLog = await run(
    [
      npm,
      'exec',
      '--yes',
      '--package=pnpm@10',
      '--',
      'pnpm',
      'install',
      '--ignore-scripts',
      '--registry=https://registry.npmjs.org/',
    ],
    sandbox,
    process.env,
    600000,
  )
  await writeFile(join(sandbox, 'install.log'), installLog)

  // 2. 版本断言:直接依赖与全部 @deepseek-ai+dsh* 传递依赖都不得混装其他版本。
  for (const [name, expected] of Object.entries(dependencies)) {
    const installed = JSON.parse(
      await readFile(join(sandbox, 'node_modules', name, 'package.json'), 'utf8'),
    )
    assert.equal(installed.version, expected, `${name} 不能由其他版本掩盖`)
  }
  for (const entry of await readdir(join(sandbox, 'node_modules', '.pnpm'))) {
    if (!entry.startsWith('@deepseek-ai+dsh')) continue
    const scope = join(sandbox, 'node_modules', '.pnpm', entry, 'node_modules', '@deepseek-ai')
    for (const item of await readdir(scope, { withFileTypes: true })) {
      if (!item.isDirectory() || !(item.name === 'dsh' || item.name.startsWith('dsh-'))) continue
      const installed = JSON.parse(await readFile(join(scope, item.name, 'package.json'), 'utf8'))
      assert.equal(installed.version, version, `${installed.name} 传递依赖不能混装其他宿主版本`)
    }
  }
  report.checks.push('精确版本的宿主、全部官方 peer 与传递依赖已安装')

  // 3. 打插件包,经宿主 CLI 装进 profile(peer 闸在此生效)。
  const pack = JSON.parse(
    await run(
      [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', sandbox],
      root,
      process.env,
      300000,
    ),
  )
  const cli = join(sandbox, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const pluginInstallLog = await run(
    [
      cli,
      'plugin',
      '--profile',
      'web',
      'add',
      join(sandbox, pack[0].filename),
      '--registry=https://registry.npmjs.org/',
    ],
    sandbox,
    env,
    600000,
  )
  await writeFile(join(sandbox, 'plugin-install.log'), pluginInstallLog)
  report.checks.push('插件包经 peer 闸装入 profile')

  // 4. 带探针启动宿主。
  await cp(join(root, 'test', 'fixtures', 'compatibility-probe.mjs'), join(sandbox, 'probe.mjs'))
  await writeFile(
    join(sandbox, 'probe.yml'),
    `- insert:\n    - id: paste-dock-compat-probe\n      name: ${JSON.stringify(pathToFileURL(join(sandbox, 'probe.mjs')).href)}\n`,
  )
  // 启动形态自动协商:旗标面随宿主线漂移——0.1.0-rc.8 起才有顶层
  // --port/--no-open;更早的 rc 顶层只认 --profile/--patch,web 子命令又
  // 拒收父级选项,只能裸启动(默认端口,可能开浏览器标签)。失败即换下一
  // 形态,只有最后一形态的失败才定局。
  const bootShapes = [
    [
      'A',
      [cli, '--profile', 'web', '--patch', join(sandbox, 'probe.yml'), '--port', '0', '--no-open'],
    ],
    ['C', [cli, '--profile', 'web', '--patch', join(sandbox, 'probe.yml')]],
  ]
  for (const [shape, cmd] of bootShapes) {
    hostLog = ''
    host = spawn(process.execPath, cmd, {
      cwd: join(sandbox, 'workspace'),
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      url = await new Promise((resolveUrl, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`宿主启动超时(形态 ${shape})\n${hostLog.slice(-4000)}`)),
          60000,
        )
        const observe = (data) => {
          hostLog += data
          const match = hostLog.match(/http:\/\/(?:127\.0\.0\.1|localhost):\d+(?:\/[^\s]*)?/)
          if (match) {
            clearTimeout(timeout)
            resolveUrl(match[0])
          }
        }
        host.stdout.on('data', observe)
        host.stderr.on('data', observe)
        host.once('error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
        host.once('exit', (code) => {
          clearTimeout(timeout)
          reject(new Error(`宿主提前退出 ${code}(形态 ${shape})\n${hostLog.slice(-2000)}`))
        })
      })
      report.bootShape = shape
      break
    } catch (error) {
      await stopProcess(host)
      host = undefined
      if (shape === 'C') throw error
      report.warnings.push(`形态 ${shape} 不被 ${version} 接受,换下一形态:${firstLine(error)}`)
    }
  }
  const base = new URL(url).origin
  const landing = await fetch(url, { redirect: 'manual' })
  const cookie = landing.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  report.checks.push('宿主启动并取得访问会话')

  // 5. 探针回读 + 断言。
  const response = await fetch(base + '/__paste-dock-compat', {
    headers: { cookie },
    signal: AbortSignal.timeout(45000),
  })
  const probeText = await response.text()
  assert.equal(response.status, 200, `探针端点 ${response.status}: ${probeText.slice(0, 2000)}`)
  const probe = JSON.parse(probeText)
  await writeFile(join(sandbox, 'probe.json'), JSON.stringify(probe, null, 2))
  const c = probe.checks ?? {}
  assert.equal(c.pasteStore, true, 'pasteStore 服务未挂载')
  assert.equal(c.getConfig?.ok, true, `getConfig 往返失败:${c.getConfig?.error}`)
  if (c.getConfig?.minChars !== 500)
    report.warnings.push(`bundle patch 配置未生效(minChars=${c.getConfig?.minChars},期望 500)`)
  if (c.savePasteTool !== true)
    throw new Error(
      `save_paste 工具未在 tools 注册表找到:${JSON.stringify(c.savePasteTool)}(query=${c.toolQuery})`,
    )
  report.checks.push(`pasteStore 挂载 + getConfig 往返 + save_paste 工具在册(${c.toolQuery})`)
  if (c.savePaste?.ok === true) {
    const savedPath = c.savePaste.absolutePath ?? c.savePaste.path
    if (c.savePaste.absolutePath) {
      const content = await readFile(c.savePaste.absolutePath, 'utf8')
      assert.match(content, /compat probe paste 内容/, '落盘内容与写入不一致')
    }
    report.checks.push(`savePaste 全链路落盘:${savedPath}(${c.savePaste.bytes} bytes)`)
  } else if (c.savePaste?.skipped) {
    report.warnings.push(`savePaste 全链路未覆盖:${c.savePaste.skipped}`)
  } else {
    throw new Error(`savePaste 全链路失败:${c.savePaste?.error}`)
  }
  if (c.setMinChars?.ok === true) {
    report.checks.push(
      `setMinChars 往返:写入后 minChars=${c.setMinChars.minChars}(${c.setMinChars.minCharsSource})`,
    )
  } else {
    report.warnings.push(`setMinChars 未验证:${c.setMinChars?.error}`)
  }
  report.clientInjectTargets = { sessions: c.sessions, connection: c.connection }
  if (!c.sessions || !c.connection)
    report.warnings.push(
      `client inject 目标缺失:sessions=${c.sessions} connection=${c.connection}(0.1.5- 前线的已知差异候选)`,
    )

  // 6. 宿主日志:typert codec 拒载与插件自身报错都是失败。
  const codecRejection = hostLog.match(/.*has no create\(\) factory.*/m)
  assert(!codecRejection, `typert-loader 拒载 codec:${codecRejection?.[0]}`)
  const pluginErrors = hostLog
    .split('\n')
    .filter(
      (line) =>
        line.includes('dsh-paste-dock') && /falling back|invalid|error|cannot|refused/i.test(line),
    )
  assert.equal(pluginErrors.length, 0, `宿主日志出现插件报错:\n${pluginErrors.join('\n')}`)
  report.checks.push('宿主日志无 codec 拒载、无插件报错')

  // 7. README 兼容句含本格版本(通用断言之四)。
  const readme = await readFile(join(root, 'README.md'), 'utf8')
  assert(readme.includes(`\`${version}\``), `README.md 兼容句未包含 ${version}`)
  report.checks.push('README 兼容句与本格版本一致')

  report.passed = true
} catch (error) {
  report.passed = false
  report.error = String((error && error.stack) || error)
  console.error(report.error)
} finally {
  try {
    await stopProcess(host)
  } catch (error) {
    report.passed = false
    report.error = String(error)
  }
  const evidence = join(root, '.compat-results', version)
  await mkdir(evidence, { recursive: true })
  await writeFile(join(evidence, 'result.json'), JSON.stringify(report, null, 2))
  await writeFile(
    join(evidence, 'host.log'),
    hostLog.replace(/\?token=[^\s]+/g, '?token=[redacted]'),
  )
  for (const name of ['install.log', 'plugin-install.log', 'probe.json']) {
    try {
      await cp(join(sandbox, name), join(evidence, name))
    } catch (error) {
      // finally 内不抛:证据缺失降级为警告,由 result.json 记录。
      if (error.code !== 'ENOENT') report.warnings.push(`证据 ${name} 拷贝失败:${error.message}`)
    }
  }
  console.log(
    `[${version}] ${report.passed ? 'PASS' : 'FAIL'} — ${report.checks.join(' | ')}${report.warnings.length ? ` | 警告:${report.warnings.join(' ; ')}` : ''}`,
  )
  if (serve && report.passed) {
    console.log(`浏览器验收:${url}`)
    await new Promise((resolveStop) => {
      process.once('SIGINT', resolveStop)
      process.once('SIGTERM', resolveStop)
    })
  }
  if (report.passed && !keep && !serve) {
    const rel = relative(tmpdir(), sandboxRoot)
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
      await rm(sandboxRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }).catch(
        () => {},
      )
    }
  } else if (!report.passed) {
    console.error(`沙箱保留(证据):${sandbox}`)
  }
}
process.exitCode = report.passed ? 0 : 1
