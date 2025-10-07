# 修复指导文档（issue_tobe_fix.md）

> 目标：将当前 MCP 本地文件操作服务器从 MVP 提升到“安全、可扩展、可测试、可发布”的稳定版本。

---
## 1. 范围（Scope）
涵盖代码目录：`index.js`、`tools/*.js`、发布配置 `package.json`、即将新增的 `lib/`、`errors.js`、`responses.js`、测试目录 `__tests__/`、及未来 `schemas/`。

---
## 2. 优先级矩阵
| 级别 | 定义 | 响应时间 | 示例类别 |
|------|------|---------|----------|
| P0 | 安全 / 数据破坏 / 结构性不一致 | 立即（本迭代） | 路径校验、命令注入、统一错误结构 |
| P1 | 影响扩展性 / 体验的结构性问题 | 下一迭代 | schema 拆分、工具注册机制、测试基线 |
| P2 | 性能 / 规模化潜在风险 | 中期 | fileSearch 限制、流式 diff、并发 hash |
| P3 | 增强 / 长期价值 | 后续 | i18n、事件流 watch、任务持久化数据库化 |

---
## 3. 详细问题与修复指导

每条包含：ID、分类、标题、描述、影响、根因、修复步骤、验收标准、测试建议。

### SEC-001 路径解析与校验不一致
- 描述：`fileEdit` 直接使用传入路径；`fileOperation` 使用自定义 resolve。可能导致行为不一致或路径逃逸。
- 影响：安全（可能访问非预期目录），用户体验不一致。
- 根因：缺少统一路径工具。
- 修复步骤：
  1. 新增 `lib/pathUtils.js`：`resolveUserPath(inputPath, {workingDir, homeDir})` 与 `assertInHome(resolved)`。
  2. 所有工具替换手写逻辑。
  3. 在 `SecurityValidator` 中增加 `validateAndResolve(filePath, workingDir)` 返回绝对路径或抛异常。
- 验收标准：工具间相对/绝对路径行为一致；越界目录被拒绝并返回统一错误码 `E_PATH_DENIED`。
- 测试：`fileEdit` 对相对路径读取成功；对 `../../etc/hosts` 拒绝。
[状态] DONE：已存在 `lib/pathUtils.js` 且各主要工具通过 `securityValidator.resolveAndAssert` 或路径校验集中化；需要后续补一轮确认所有遗留工具（如 taskManager 及 environmentMemory）也统一使用。

### SEC-002 Shell 命令拼接风险（fileArchive）
- 描述：使用模板字符串拼接 `zip`/`tar`/`unzip`/`gunzip` 命令。
- 影响：命令注入风险（恶意文件名包含 `"; rm -rf ~;"` 等）。
- 根因：直接字符串拼接。
- 修复步骤：
  1. 引入 `child_process.spawn`，参数数组传递（已完成）。
  2. （可选）后续可替换为纯 Node 库：`tar`、`archiver`（暂不需要）。
  3. 增加对源/目标路径合法字符白名单校验：`^[A-Za-z0-9._\-/]+$`（已实现）。
  4. 统一错误输出结构，与 `output_format` 对齐（已实现 text/json）。
- 验收标准：任意包含空格、分号、管道等特殊字符的路径被拒绝；普通安全路径成功；无 shell 注入执行途径。
- 测试：构造含 `;` 的路径得到拒绝；合法路径归档/解压成功。
[状态] DONE：已使用 spawn + 正则白名单 + 统一错误消息；支持 `output_format=json|text`；后续如需支持包含空格路径，可通过安全参数数组并在白名单放宽策略时附加额外转义。 

### SEC-003 命令执行策略松散
- 描述：`commandExecution` 仅基于包含子串判定高危。
- 影响：可被大小写/分隔绕过；误报/漏报。
- 根因：未做 token 化与正则严格匹配。
- 修复步骤：
  1. 新增 `lib/commandPolicy.js`：`evaluate(command)` → `{level: 'deny'|'warn'|'allow', reason}`。
  2. 规则：正则 `\b(sudo|passwd|chown|chmod\s+777|rm\s+-rf)\b`。
  3. deny：直接 ToolError(`E_DANGEROUS_CMD`)；warn：要求 confirm。
- 验收标准：`sudo whoami` 被拒；`echo sudo` 不误拦截；`rm -rf /tmp/x` 需 confirm。
- 测试：三类命令单元测试 + 模拟 confirm=true。
[状态] DONE：`lib/commandPolicy.js` 已实现 deny/warn；`commandExecution` 对 warn 需 confirm，对 deny 抛错；尚缺自动化测试。

### SEC-004 递归权限修改缺少限制
- 描述：`filePermissions` `recursive=true` 时无限递归。
- 影响：误操作大目录（如用户 home 整体）。
- 修复步骤：
  1. 增加参数 `max_depth` 默认 5。
  2. 追踪深度，超出抛 `E_LIMIT_REACHED`。
- 验收标准：对嵌套 8 层目录修改时在第 6 层停止并报错。
[状态] DONE：`filePermissions` 已加入 `max_depth`（默认5）并抛 `E_LIMIT_REACHED`。

### SEC-005 Watch 行为平台差异未声明
- 描述：`fs.watch` recursive 在 Linux 不支持。
- 修复步骤：
  1. 检测 `supportsRecursiveWatch()`；否则回退非递归 + 目录枚举。
  2. 增加输出字段：`capabilities.recursive: true|false`。
[状态] DONE：已添加 `supportsRecursiveWatch()`（基于平台判定 macOS/Windows 支持递归，其它回退非递归），`watchPath` 调用根据支持与否设置 `recursive`；输出中新增 `capabilities.recursive`（text 模式显示“递归支持: 是/否(已降级为非递归监控)”；json 模式结构化返回）。后续可增强：运行时实际探测临时目录、递归差异模拟（Linux 上手动枚举子目录 watch）。

### ARCH-001 入口文件 schema 膨胀
- 描述：`index.js` 直接内嵌大数组。
- 修复步骤：
  1. `tools/<tool>.js` 导出 `{ descriptor, ToolClass }`。
  2. 新建 `tools/registry.js` 汇总。
  3. 入口：`const { descriptors, instances } = buildRegistry(securityValidator)`。
- 验收标准：`index.js` 中 schema 定义删除 >90%。
[状态] PARTIAL：已创建 `tools/registry.js`；但 `index.js` 仍内嵌 descriptors（未拆出每工具自描述 + 未使用 registry.descriptors 统一）；需后续抽离和精简。

### ARCH-002 响应/错误重复拼接
- 修复步骤：新增 `responses.js` / `errors.js`（参考下方示例）。
[状态] DONE：`responses.js` 与 `errors.js` 已存在并被多处工具使用；仍需一次全量审查遗留直接拼接文本的工具（fileHash、fileCompare 等）可优化为统一格式。

### ARCH-003 缺少生命周期钩子
- 修复步骤：
  1. 工具可选实现 `dispose()`。
  2. 服务器增加 `process.on('SIGINT')` 触发清理。
[状态] PENDING：未见统一生命周期管理与 `dispose()` 调用；`fileWatch` 有自有 cleanup() 但未集成。

### API-001 输出结构不统一
- 描述：有的仅 text，有的同时 text+json。
- 修复步骤：引入 `output_format`，允许值：`text|json|both`；默认 text；时间/任务工具增加 json；抽象公共输出辅助。
[状态] NEAR DONE：所有核心/辅助工具现已支持：fileArchive, fileOperation, fileHash, fileEdit, fileWatch, filePermissions, fileSearch, commandExecution, fileCompare, timeTool, environmentMemoryAdapter。新增 `lib/output.js` 统一 `buildOutput()`，并在 fileArchive/fileOperation/fileHash 等实现 both。剩余微调：
  - 统一未来新增工具引用 `lib/output.js` 而非自建逻辑。
  - 环境底层模块（environmentMemory.js）非直接工具，可忽略。
  - 后续可将 commandExecution 错误路径/need_confirm 也通过 buildOutput 重构（当前逻辑已结构化，属于可选收敛）。

### API-002 参数命名风格不统一
- 修复步骤：文档化约定：路径字段统一 `*_path`，目录 `*_dir`，工作目录 `working_dir`（兼容 `working_directory`），支持 alias；后续可抽象 alias 解析函数。
[状态] NEAR DONE：所有改造工具已提供 alias：
  - 路径/目录：path | file_path | dir_path（fileOperation, filePermissions, fileEdit 等）
  - 搜索：search_path | root_path
  - 比较：file1/file2 与 source_path/target_path 并存
  - 执行：working_directory | working_dir
  - 归档：source/destination（未来可考虑 source_path/dest_path alias，可选）
剩余细节：
  - 计划新增 `lib/argAliases.js` 抽离 alias 解析（尚未实现，不阻塞功能）。
  - 文档中补充统一规范示例表格（待撰写）。

### PERF-001 fileSearch 无限制
- 修复：增加：`max_depth`、`ignore`（数组 glob）、`timeout_ms`。
[状态] DONE：`fileSearch` 已实现 `max_depth`、`ignore`、`timeout_ms`、软超时标记。

### PERF-002 fileCompare 大文件内存占用
- 修复：使用 `readline` 逐行对比；仅保留差异数组。
[状态] PENDING：仍一次性读取全部内容到内存。

### PERF-003 fileHash 单文件模式
- 修复：支持数组：`paths: []`，并发使用 `Promise.allSettled`，返回多条哈希。
[状态] PENDING：当前只支持单文件 `path` 字段。

### TEST-001 缺少测试基线
- 修复：
  1. 引入 Jest。
  2. 目录：`__tests__/tools/*.test.js`。
  3. 至少：fileOperation、fileEdit、commandExecution、securityValidator、timeTool。
[状态] PENDING：尚未引入任何测试或 jest 配置。

### DX-001 缺少 CLI 帮助
- 修复：`--help` 列出工具；`--version` 读取 package.json。
[状态] PENDING：`bin/cli.js` 仅简单 require index，没有 help/version 逻辑。

### DX-002 缺少程序化 API
- 修复：`module.exports = { startServer, createServer }`；便于集成进其它 Node 进程。
[状态] PENDING：`index.js` 直接启动，无显式导出工厂函数。

### DX-003 缺少 CHANGELOG / 语义化版本
- 修复：采用 Conventional Commits + `npm run release`（semantic-release）。
[状态] DONE：`semantic-release` 已配置（package.json + .releaserc + scripts）；仍需 GitHub Actions 流水线与远程仓库配置来完成自动发布。

---
## 4. 实施阶段规划

### Phase 0（安全硬化 & 一致性）
- SEC-001/002/003/004
- ARCH-002（错误与响应抽象）
- API-001（最小统一：添加 output_format 支持）

### Phase 1（结构重构 & 测试）
- ARCH-001（拆分 registry）
- PERF-001（搜索限制）
- TEST-001（Jest 基线）
- DX-001/002（CLI + API）

### Phase 2（性能与扩展）
- PERF-002/003
- ARCH-003（生命周期）
- SEC-005（watch 能力检测）
- DX-003（release pipeline）

### Phase 3（长期增强）
- 任务持久化（sqlite/lowdb）
- i18n
- watch 事件流（实时推送）

并行注意：
- Phase 0 优先合并，后续分支基于其改动。
- 避免同时重构路径与测试基线（减少 merge 冲突）。

回滚策略：
- 每阶段完成后打标签：`v2.1.0-alpha.1`、`alpha.2` …
- 若高危回归：回退到上一标签并 cherry-pick 安全补丁。

---
## 5. 验收与质量门禁（Quality Gates）
| 维度 | 指标 | 阶段达标 | 工具 |
|------|------|----------|------|
| 构建 | `npm test` 成功 | Phase 1 起 | Jest |
| 覆盖率 | 行覆盖 ≥40%（Phase1）→60%（Phase2） | Phase1/2 | jest --coverage |
| 安全 | 命令策略/路径越界测试100%通过 | Phase0 | 专用用例 |
| Lint | ESLint 无 error | Phase1 | eslint |
| 版本 | 语义化 tag | Phase2 | semantic-release |

---
## 6. 检查清单（Checkpoint）
- [x] 路径工具统一 & 所有工具修正（主线工具完成，少量辅助工具后续确认）
- [x] 错误/响应抽象落地（errors/responses 已使用）
- [x] 命令策略独立模块化（commandPolicy）
- [x] 压缩/解压去 shell 注入风险（spawn + 字符白名单 + output_format 完成）
- [ ] Jest 基线 40% 覆盖（未开始）
- [ ] CLI `--help`/`--version`（未实现）
- [x] fileSearch 限制参数上线（已包含 depth/timeout/ignore）
- [x] CHANGELOG 自动生成（semantic-release 集成，待 CI）

---
## 7. 示例代码片段

### 7.1 `lib/pathUtils.js`
```javascript
const path = require('path');
const os = require('os');

function resolveUserPath(input, { workingDir } = {}) {
  const home = os.homedir();
  let base;
  if (path.isAbsolute(input)) base = input; else if (workingDir) base = path.join(workingDir, input); else base = path.join(home, input);
  return path.resolve(base);
}

function assertInHome(resolvedAbs) {
  const home = path.resolve(os.homedir()) + path.sep;
  if (!(resolvedAbs + path.sep).startsWith(home)) {
    const err = new Error('路径不允许');
    err.code = 'E_PATH_DENIED';
    throw err;
  }
  return resolvedAbs;
}

module.exports = { resolveUserPath, assertInHome };
```

### 7.2 `errors.js`
```javascript
class ToolError extends Error {
  constructor(code, message, meta = {}) { super(message); this.code = code; this.meta = meta; }
}
const ERR = {
  PATH_DENIED: (p) => new ToolError('E_PATH_DENIED', `路径不允许: ${p}`),
  NOT_FOUND: (p) => new ToolError('E_NOT_FOUND', `对象不存在: ${p}`),
  INVALID_ARGS: (m) => new ToolError('E_INVALID_ARGS', m),
  DANGEROUS_CMD: (c) => new ToolError('E_DANGEROUS_CMD', `危险命令: ${c}`),
  LIMIT_REACHED: (m) => new ToolError('E_LIMIT_REACHED', m)
};
module.exports = { ToolError, ERR };
```

### 7.3 `responses.js`
```javascript
function text(t) { return { content: [{ type: 'text', text: t }] }; }
function json(obj) { return { content: [{ type: 'json', json: obj }] }; }
function both(obj, label='') { return { content: [ { type:'text', text: label || JSON.stringify(obj, null, 2) }, { type:'json', json: obj } ] }; }
module.exports = { text, json, both };
```

### 7.4 命令策略 `lib/commandPolicy.js`
```javascript
const DENY = [/\bpasswd\b/i];
const WARN = [/\brm\s+-rf\b/i, /\bsudo\b/i, /\bchown\b/i, /chmod\s+777/i];

function evaluate(command) {
  const cmd = command.trim();
  if (DENY.some(r => r.test(cmd))) return { level: 'deny', reason: 'forbidden token' };
  if (WARN.some(r => r.test(cmd))) return { level: 'warn', reason: 'high risk' };
  return { level: 'allow' };
}
module.exports = { evaluate };
```

### 7.5 Jest 用例模板 `__tests__/fileOperation.test.js`
```javascript
const FileOperationTool = require('../tools/fileOperation');
const SecurityValidator = require('../tools/securityValidator');
const fs = require('fs');

describe('fileOperation', () => {
  const tool = new FileOperationTool(new SecurityValidator());
  const tmp = require('path').join(require('os').homedir(), 'test_mcp_file.txt');
  afterAll(()=> { try { fs.unlinkSync(tmp); } catch(e){} });

  test('write then read', async () => {
    await tool.handle({ operation:'write', path: tmp, content:'hello' });
    const res = await tool.handle({ operation:'read', path: tmp });
    expect(res.content[0].text).toMatch('hello');
  });
});
```

### 7.6 CLI `--help` 示例
```javascript
if (process.argv.includes('--help')) {
  console.log('Usage: local-file-operation-mcp [--help] [--version]');
  process.exit(0);
}
```

---
## 8. 风险与回滚
| 风险 | 缓解 | 回滚指标 |
|------|------|----------|
| 重构引入回归 | 单元测试 + 分阶段合并 | 新工具调用失败率上升 |
| 命令策略过严 | 提供 ENV 开关 `MCP_CMD_POLICY=permissive` | 用户反馈阻塞用例 |
| 路径策略误拒 | 日志记录所有拒绝 | 出现大量合法路径拒绝日志 |

---
## 9. 后续增强建议（Backlog）
- 速率限制（按工具/分钟）
- 指标采集：调用计数、失败率、耗时分布
- OpenTelemetry 导出（可选）
- Web UI（任务/监控）

---
## 10. 总结
本指导文档为从 MVP 向生产级演进的执行蓝图。建议先完成 Phase 0（约 1–2 天），再并行进行测试与结构重构。文档中的示例代码可直接落地为初始实现基础。
