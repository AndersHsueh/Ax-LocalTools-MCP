# MCP Tools 开发规范 (tools_dev_guide.md)

> 目的：为“开发模型 / 人类贡献者”提供一份严格、统一、可执行的指南，确保新增或修改 `tools/*.js` 时在安全性、参数一致性、输出结构、可测试性与可维护性方面达到项目标准。
>
> 适用范围：`/tools` 目录下的所有工具模块（文件操作、比较、搜索、权限、命令执行、环境记忆等），以及未来扩展的新工具。

---
## 目录
1. 设计原则
2. 目录与文件结构约定
3. 命名与导出规范
4. 参数(Inputs) 设计规范
5. 输出(Output) 设计规范
6. 错误与异常处理
7. 安全策略嵌入点
8. 性能与资源使用要求
9. 生命周期与清理 (可选)
10. 工具注册流程 (registry)
11. 单元测试与最小可测试面
12. 代码模板（推荐起步骨架）
13. 常见反模式与禁止事项
14. 变更检查清单 (PR Checklist)
15. 进阶：多文件/异步流式工具建议

---
## 1. 设计原则
- **安全优先**：所有路径/命令/外部进程输入必须经过验证或白名单策略。
- **幂等/可预期**：同样的输入得到固定语义的输出；避免隐式副作用 (除明确声明的写操作)。
- **参数与输出一致性**：统一使用 `output_format` 与 alias 解析；返回结构化 JSON + 可读文本（在需要时）。
- **易测试**：核心逻辑保持纯函数或最小副作用；可通过 mock 注入（如 `securityValidator`）。
- **最小依赖**：优先使用 Node 内置模块；第三方库需在文档与 PR 中说明必要性。
- **渐进增强**：初始实现可只支持 `text|json`，若有分析型结果建议支持 `both`。

---
## 2. 目录与文件结构约定
- 每个工具单文件：`tools/<ToolName>.js`，类名与文件名驼峰对应：`FileSearchTool` → `fileSearch.js`。
- 可选子模块或辅助逻辑放入 `lib/`：如 `lib/output.js`、`lib/commandPolicy.js`、`lib/pathUtils.js`。
- 不在工具文件内定义通用函数（除非明确仅该工具专用），通用函数应抽离。

---
## 3. 命名与导出规范
- 单工具导出：`module.exports = <ToolClass>`。
- 类名格式：`<PrimaryConcept>Tool`（例如：`FileCompareTool`）。
- 保留构造函数签名：`constructor(securityValidator) { ... }`，以便注册器统一注入安全策略对象。
- 工具内部主入口：`async handle(args)`。
- 复杂工具可拆内部私有方法，使用前缀 `_` 或保持文件内作用域函数。

---
## 4. 参数(Inputs) 设计规范
### 4.1 通用字段
| 字段 | 含义 | 规范 | 备注 |
|------|------|------|------|
| `output_format` | 输出格式 | `text` / `json` / `both` | 默认 `text` 或视工具特性默认 `both` (如 timeTool) |
| `working_dir` | 工作目录 | 与 `working_directory` 兼容 | 读取/执行类工具使用 |
| `path` / `file_path` | 文件路径 | 允许 alias | 二选一即可；内部归一为变量 `target` |
| `dir_path` | 目录路径 | alias | 需在文档中声明同属路径类 |
| `<name>_path` / `<name>_dir` | 资源路径 | 命名模式 | 新增语义化操作建议采用 |

### 4.2 Alias 解析
- 使用逻辑：`const target = path || file_path || dir_path;`。
- 若工具涉及两个路径（比较场景），使用：`left = file1 || source_path; right = file2 || target_path;`。
- 缺失核心路径参数时应抛：`ERR.INVALID_ARGS('缺少...')`。

### 4.3 校验
- 路径必须调用：`this.securityValidator.isPathAllowed(target)` 或 `resolveAndAssert()`。
- 数值型参数（如 `max_depth`, `timeout_ms`, `duration`）需：
  - 解析为整数：`const depth = Number(max_depth) || 5;`
  - 校验范围：`if (depth < 0 || depth > 64) throw ERR.INVALID_ARGS('max_depth 超出范围');`。
- 布尔参数统一解析：`const recursive = !!recursive;`（若允许字符串）则辅助函数转换。

---
## 5. 输出(Output) 设计规范
### 5.1 统一构造
- 使用 `lib/output.js`：
```javascript
const { buildOutput } = require('../lib/output');
return buildOutput(output_format, textMessage, jsonObject);
```
- `text`：面向人类可读摘要；
- `json`：结构化字段，便于上层调用模型自动解析；
- `both`：两者并存，顺序固定：text → json。

### 5.2 JSON 内容建议
| 元字段 | 说明 | 示例 |
|--------|------|------|
| `action` | 动作标识 | `read`, `write`, `search`, `chmod` |
| `path` / `source` / `target` | 主路径 | `/Users/me/file.txt` |
| `duration_ms` | 耗时 (可选) | 12 |
| `stats` / `diff_stats` | 统计对象 | `{ added: 2 }` |
| `matches`, `truncated`, `timed_out` | 搜索类 | 布尔/数值 |
| `policy` | 策略评估 | `{ level:'warn', reason:'...'}` |

### 5.3 截断策略
- 大文本输出（`stdout`, `stderr`, 或匹配详情）应提供上限参数（如 `stdout_max`）。
- 截断使用后缀：`... <truncated N chars>`。

---
## 6. 错误与异常处理
- 使用 `errors.js` 中 ERR 工厂：`ERR.INVALID_ARGS(msg)`、`ERR.PATH_DENIED(p)`、`ERR.NOT_FOUND(p)`、`ERR.DANGEROUS_CMD(cmd)`、`ERR.LIMIT_REACHED(msg)`。
- 原则：
  1. 逻辑/输入校验失败 → `E_INVALID_ARGS`
  2. 路径/权限策略 → `E_PATH_DENIED`
  3. 对象不存在 → `E_NOT_FOUND`
  4. 风险策略拒绝 → `E_DANGEROUS_CMD`
  5. 资源/递归限制 → `E_LIMIT_REACHED`
- 捕获块中仅翻译已知错误；未知错误封装：`throw ERR.INVALID_ARGS('操作失败: ' + error.message)`。

---
## 7. 安全策略嵌入点
| 场景 | 需求 | 处理方式 |
|------|------|----------|
| 路径访问 | 禁止越界 Home | `securityValidator.isPathAllowed()` / `resolveAndAssert()` |
| 命令执行 | 策略评估 | `commandPolicy.evaluate()`；处理 deny/warn |
| 外部进程 | 禁命令注入 | 使用 `spawn` 参数数组，路径正则白名单 |
| 递归操作 | 限制深度 | `max_depth` + 计数器，溢出抛 `E_LIMIT_REACHED` |
| 超时任务 | 防卡死 | `setTimeout` 标记 `cancelled` 并提前结束 |

---
## 8. 性能与资源使用要求
- 避免一次性加载超大文件（>10MB）进行全文 diff：应逐行/流式（未来 PERF 优化）。
- 并发 I/O 推荐 `Promise.allSettled`（hash 多文件等）。
- 搜索类工具强制参数：`max_results`、`max_depth`、`timeout_ms`。
- 避免在循环内重复创建 RegExp（预编译）。

---
## 9. 生命周期与清理 (可选)
- 若工具持有资源（watcher / interval / 缓存）：
  - 提供 `dispose()` 方法释放；
  - 在服务器统一入口（未来实现）集中调用。
- 不持有长期资源的工具可省略。

---
## 10. 工具注册流程 (registry)
1. 创建工具文件：`tools/newTool.js`。
2. 在 `tools/registry.js` 中导入并加入导出的 `map` 或 `list`（当前结构若未完全抽离，保持与现状一致）。
3. 为工具撰写 `descriptor`（若使用）：
```javascript
// 未来 schema 模式（示例）
const descriptor = {
  name: 'file_search',
  description: '搜索文件内容',
  input: { pattern: 'string', search_path: 'string' },
  output: { matches: 'number', results: 'array' }
};
```
4. 确保构造：`new ToolClass(securityValidator)`。
5. 运行本地集成（待 CLI --help 完成后可验证列出）。

---
## 11. 单元测试与最小可测试面
| 工具类型 | 必测场景 | 关键断言 |
|----------|----------|----------|
| 读写类(fileOperation) | read/write/delete/list | 返回 JSON 字段正确；路径拒绝 |
| 编辑类(fileEdit) | 替换/插入/删除 | 行数变化正确；错误行号抛异常 |
| 搜索(fileSearch) | timeout/ignore/结果截断 | `timed_out` 标记；`matches` 计数 |
| 权限(filePermissions) | 递归深度限制 | 超深度抛 `E_LIMIT_REACHED` |
| 命令(commandExecution) | warn/deny/confirm | warn 时 need_confirm；deny 抛错 |
| 监控(fileWatch) | 递归能力输出 | `capabilities.recursive` 字段存在 |
| 比较(fileCompare) | diff_stats | added/removed/modified 统计准确 |
| 时间(timeTool) | 不同 format | ISO vs UNIX 输出差异 |

测试建议：
- 使用临时目录（`os.tmpdir()` + 随机前缀）。
- 清理：`afterAll` 删除产生的文件。
- 覆盖率第一阶段目标：≥40%。

---
## 12. 代码模板（推荐）
```javascript
const { buildOutput } = require('../lib/output');
const { ERR } = require('../errors');

class ExampleTool {
  constructor(securityValidator) { this.securityValidator = securityValidator; }

  async handle(args) {
    const { path: file_path, output_format = 'text' } = args;
    const target = file_path; // 或 path || file_path || dir_path
    if (!target) throw ERR.INVALID_ARGS('缺少 path 参数');
    if (!this.securityValidator.isPathAllowed(target)) throw ERR.PATH_DENIED(target);

    const started = Date.now();
    // ...执行业务逻辑...
    const data = { action: 'example', path: target, duration_ms: Date.now() - started };
    return buildOutput(output_format, `示例操作成功: ${target}`, data);
  }
}

module.exports = ExampleTool;
```

---
## 13. 常见反模式与禁止事项
| 反模式 | 原因 | 替代做法 |
|--------|------|----------|
| 直接字符串拼接 shell 命令 | 注入风险 | `spawn(cmd, args, { cwd })` |
| 未校验路径直接 fs 访问 | 越界访问风险 | `resolveAndAssert()` |
| 大量重复输出拼接 | 难统一/本地化 | `buildOutput()` |
| 在工具内写死 JSON.parse/JSON.stringify 作为唯一输出 | 缺少 text 可读性 | 提供 `text|json|both` |
| 无超时的长阻塞操作 | Hang 风险 | 增加 `timeout_ms`/取消标记 |
| 深度递归无上限 | 资源放大 | `max_depth` 参数 |
| 捕获所有错误后静默返回 | 隐藏失败 | 抛对应 ERR 码 |

---
## 14. 变更检查清单 (PR Checklist)
- [ ] 是否添加/复用 `output_format` 并支持至少 `text` + `json`？
- [ ] 是否使用 `buildOutput()` 而非手写重复结构？
- [ ] 是否做了路径/参数合法性校验？
- [ ] 是否引用 `securityValidator` 进行路径安全判断？
- [ ] 是否为潜在危险操作加了限制（depth/timeout/size）？
- [ ] 是否提供了 diff_stats / matches 等核心统计字段（若适用）？
- [ ] 错误是否使用 `ERR.*` 工厂？
- [ ] 是否避免引入不必要的第三方依赖？
- [ ] 是否具备最小单元测试或列出后续测试计划？
- [ ] 文档/注释是否解释了关键参数与行为？

---
## 15. 进阶：多文件/异步流式工具建议
- 可将长时任务拆分：启动 → 返回任务ID → 轮询/事件流（未来支持）。
- 使用 Node 流（`fs.createReadStream`、`readline`）处理大文件。
- 对 stdout/stderr 可能非常大的命令：考虑分页或临时文件引用。
- 若产生临时文件：统一写入 `os.tmpdir()` 子目录，完成后清理。

---
## 附录：快速规范对照表
| 维度 | 要点 | 示例 |
|------|------|------|
| 参数 alias | path/file_path/dir_path | `const target = path || file_path || dir_path;` |
| 输出统一 | buildOutput | `buildOutput(fmt, msg, data)` |
| 错误 | ERR 工厂 | `throw ERR.INVALID_ARGS('原因')` |
| 安全 | 校验路径 + 策略 | `isPathAllowed`, `commandPolicy` |
| 性能 | 上限/超时/深度 | `max_results`, `timeout_ms`, `max_depth` |
| 测试 | 最小覆盖 | diff_stats / matches / depth limit |

> 遵循本指南可显著降低后续重构和安全审计成本。新增工具合并前务必逐条对照第 14 节 Checklist。
