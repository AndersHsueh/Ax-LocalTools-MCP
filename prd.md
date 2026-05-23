# AX Local Operations MCP Server — 产品需求文档（PRD）

> **版本**: 当前主线  
> **传输协议**: MCP stdio  
> **运行环境**: Node.js ≥ 18，跨平台（Windows / macOS / Linux）

---

## 一、产品概述

AX Local Operations MCP Server 是一个基于 **Model Context Protocol（MCP）** 的本地工具服务，专为 LLM Agent（如 Claude、GPT、Qwen 等）设计，使 AI 模型能够通过标准化接口安全地操作本地文件系统、执行系统命令、管理任务和持久化环境信息。

服务以 **stdio 传输**运行，作为子进程被 MCP 客户端（如 Claude Desktop、opencode 等）启动，所有工具调用经由 JSON-RPC 协议传递。

### 核心设计原则

- **Agent 全控授权**：仅拒绝真正不可恢复的系统破坏操作（如格式化磁盘、`rm -rf /`），其余命令全部放行，不设摩擦确认。
- **跨平台一致性**：Windows 使用 PowerShell（优先 `pwsh`，fallback `powershell`），Unix 使用 `sh`，路径比较对 Windows 忽略大小写。
- **路径安全**：支持任意绝对路径，拒绝含隐藏目录组件（如 `/.secret/`）的路径；dotfile（`.env`、`.gitignore`）本身允许访问。
- **MCP 协议纯净**：所有日志、调试输出写入 `stderr` 或静默处理，不污染 stdio 通信流。
- **中文用户界面**：所有工具描述、错误消息均为中文。

---

## 二、系统架构

```
┌─────────────────────────────────────────────────────┐
│  MCP 客户端（Claude Desktop / opencode / Qwen 等）   │
└───────────────────────┬─────────────────────────────┘
                        │ JSON-RPC over stdio
┌───────────────────────▼─────────────────────────────┐
│  index.js — MCP 服务入口                             │
│  ┌──────────────────────────────────────────────┐   │
│  │  request interceptor                         │   │
│  │  • 扫描 args 中的工作目录命令并短路           │   │
│  │  • 自动注入 working_directory（若缺失）       │   │
│  └──────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│  tools/registry.js — 工具注册中心                    │
│  共享 SecurityValidator 单例                         │
│  14 个工具实例（Linux 额外 1 个 sudo_config）        │
└───────────┬─────────────────────────────────────────┘
            │
    ┌───────┴──────┐
    │  lib/ 共享库  │
    ├──────────────┤
    │ commandPolicy│ — 命令安全评估
    │ pathUtils    │ — 路径解析
    │ platformUtils│ — 平台检测单例
    │ output       │ — 统一输出格式
    └──────────────┘
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `index.js` | 服务入口、请求拦截、工作目录注入 |
| `tools/registry.js` | 全部工具的实例化与 MCP 描述符定义 |
| `tools/securityValidator.js` | 路径安全验证 |
| `lib/commandPolicy.js` | 命令安全策略（deny/allow） |
| `lib/platformUtils.js` | 平台检测单例（isWindows/isLinux/isMacOS） |
| `lib/output.js` | `buildOutput()` 统一输出构建 |
| `errors.js` | `ERR.*` 错误工厂 |

---

## 三、安全模型

### 路径安全

- `securityValidator.resolveAndAssert(filePath, workingDirectory)` — 解析并验证路径
- 若提供 `workingDirectory`，文件路径必须在其范围内
- 拒绝路径中任何目录组件以 `.` 开头（隐藏目录）
- 支持任意绝对路径，无 home 目录限制
- Windows 路径比较忽略大小写

### 命令安全

仅拒绝以下极危险操作（不可恢复）：

| 平台 | 被拒绝的操作 |
|------|-------------|
| Unix | `rm -rf /`、`rm -rf /*`、fork bomb、`dd` 写裸磁盘、`mkfs` |
| Windows | `format C:`、`del /s /q C:\Windows`、`rd /s /q C:\Windows`、`Remove-Item -Recurse C:\Windows` |

其余所有命令直接放行，不需要 `confirm: true`。

---

## 四、工具详细说明

所有工具均支持 `output_format` 参数：
- `text` — 人类可读的纯文本（默认）
- `json` — 结构化 JSON
- `both` — 同时返回两种格式

所有工具均接受 `working_directory`（或 `working_dir`）作为相对路径的基准。

---

### 1. `file_operation` — 文件基础操作

读取、写入、列出目录、创建目录、删除文件或目录。

**必填参数**: `operation`

| 参数 | 类型 | 说明 |
|------|------|------|
| `operation` | string | `read` / `write` / `list` / `create_dir` / `delete` |
| `path` | string | 文件或目录路径 |
| `content` | string | 写入内容（`write` 操作时使用） |
| `max_size` | number | 最大读取大小，默认 10MB |
| `working_directory` | string | 工作目录 |
| `output_format` | string | `text` / `json` / `both` |

**示例**:
```json
{ "operation": "read", "path": "src/index.js" }
{ "operation": "write", "path": "output.txt", "content": "Hello World" }
{ "operation": "list", "path": "src" }
{ "operation": "create_dir", "path": "dist/assets" }
{ "operation": "delete", "path": "temp.txt" }
```

---

### 2. `file_edit` — 文件行级编辑

在指定行位置删除、插入、替换或追加内容。自动检测并保留原文件的行尾风格（CRLF/LF）。

**必填参数**: `operation`, `path`

| 参数 | 类型 | 说明 |
|------|------|------|
| `operation` | string | `delete_lines` / `insert_lines` / `replace_lines` / `append_lines` |
| `path` | string | 文件路径 |
| `start_line` | number | 起始行号（从 1 开始） |
| `end_line` | number | 结束行号（从 1 开始） |
| `content` | string | 插入或替换的内容 |
| `encoding` | string | 文件编码，默认 `utf8` |

**示例**:
```json
{ "operation": "delete_lines", "path": "main.js", "start_line": 3, "end_line": 5 }
{ "operation": "insert_lines", "path": "main.js", "start_line": 10, "content": "// 新增注释" }
{ "operation": "replace_lines", "path": "config.json", "start_line": 2, "end_line": 4, "content": "  \"version\": \"2.0\"" }
{ "operation": "append_lines", "path": "log.txt", "content": "2026-05-23 操作完成" }
```

---

### 3. `file_search` — 文件内容搜索

在目录树中用正则表达式搜索文件内容，返回匹配的文件路径和行号。

**必填参数**: `search_path`, `pattern`

| 参数 | 类型 | 说明 |
|------|------|------|
| `search_path` | string | 搜索起始目录 |
| `pattern` | string | 正则表达式模式（不含 `g` 标志） |
| `file_types` | string | 文件扩展名过滤，如 `"js,ts,json"` |
| `case_sensitive` | boolean | 是否区分大小写，默认 `false` |
| `max_results` | number | 最大结果数，默认 100 |
| `max_depth` | number | 最大目录深度，默认 8 |
| `timeout_ms` | number | 超时时间（毫秒），默认 5000 |
| `ignore` | array | 忽略的文件/目录模式，如 `["node_modules", "*.log"]` |

**示例**:
```json
{ "search_path": "src", "pattern": "function\\s+\\w+", "file_types": "js,ts" }
{ "search_path": ".", "pattern": "TODO", "ignore": ["node_modules", ".git"] }
{ "search_path": "/project", "pattern": "error", "case_sensitive": false, "max_results": 50 }
```

---

### 4. `file_compare` — 文件差异比较

逐行比较两个文件，输出差异统计（新增/删除/修改行数）和详细对比。同时计算 MD5 哈希用于快速判断是否相同。

**必填参数**: `file1`, `file2`

| 参数 | 类型 | 说明 |
|------|------|------|
| `file1` | string | 第一个文件路径（也接受 `source_path`） |
| `file2` | string | 第二个文件路径（也接受 `target_path`） |
| `output_format` | string | `text` / `json` / `both` |

**示例**:
```json
{ "file1": "v1/config.json", "file2": "v2/config.json", "output_format": "json" }
```

**输出字段**: `identical`、`differences_count`、`diff_stats`（`added/removed/modified`）、`hashes`

---

### 5. `file_hash` — 文件哈希计算

计算文件的哈希值，用于完整性校验、去重检测等。

**必填参数**: `path`

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | string | 文件路径（也接受 `file_path`） |
| `algorithm` | string | `md5` / `sha1` / `sha256` / `sha512`，默认 `md5` |

**示例**:
```json
{ "path": "dist/app.js", "algorithm": "sha256", "output_format": "json" }
```

---

### 6. `file_permissions` — 文件权限管理

跨平台文件/目录权限设置：Unix 使用 `chmod`，Windows 使用 `icacls`。

**必填参数**: `path`

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | string | 文件或目录路径 |
| `mode` | string | Unix 权限模式，如 `"755"`、`"644"` |
| `permissions` | object | Windows 权限设置对象 |
| `recursive` | boolean | 是否递归处理子目录 |
| `max_depth` | number | 递归最大深度，默认 8 |

**示例**:
```json
{ "path": "deploy.sh", "mode": "755" }
{ "path": "project", "mode": "644", "recursive": true }
```

---

### 7. `file_archive` — 文件压缩/解压

压缩或解压文件/目录，支持 ZIP、TAR、GZ、TAR.GZ 格式。  
**注意**：Windows 需要在 PATH 中安装 `zip`/`unzip`/`tar`/`gzip`（Git Bash、WSL 或手动安装）。

**必填参数**: `operation`, `source`

| 参数 | 类型 | 说明 |
|------|------|------|
| `operation` | string | `compress`（压缩）/ `extract`（解压） |
| `source` | string | 源文件或目录路径 |
| `destination` | string | 目标路径（压缩包或解压目录） |
| `format` | string | `zip` / `tar` / `gz` / `tar.gz` |

**示例**:
```json
{ "operation": "compress", "source": "project", "destination": "backup.zip", "format": "zip" }
{ "operation": "extract", "source": "archive.tar.gz", "destination": "./extracted" }
```

---

### 8. `file_watch` — 文件系统监控

监控文件或目录的变化事件（创建、删除、修改）。跨平台实现：Windows/macOS 使用原生递归监控，Linux 使用手动递归监控。

**必填参数**: `path`

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | string | 监控的文件或目录路径 |
| `events` | string | 监控事件，逗号分隔：`create`、`delete`、`modify`，默认全部 |
| `duration` | number | 监控时长（秒），**`0` 表示持续监控直到进程退出** |
| `recursive` | boolean | 是否递归监控子目录，默认 `true` |
| `max_depth` | number | 最大递归深度，默认 10 |

**示例**:
```json
{ "path": "src", "events": "create,modify", "duration": 60 }
{ "path": "/var/log", "events": "modify", "duration": 0, "recursive": false }
```

---

### 9. `execute_command` — 命令执行

在系统 shell 中执行命令。Windows 使用 PowerShell（`pwsh` 优先），Unix 使用 `sh`。集成命令策略评估，仅拦截不可恢复的极危险操作。

**必填参数**: `command`

| 参数 | 类型 | 说明 |
|------|------|------|
| `command` | string | 要执行的命令（支持管道、重定向） |
| `working_directory` | string | 命令的工作目录 |
| `timeout_ms` | number | 超时时间（毫秒），默认 60000 |
| `stdout_max` | number | stdout 最大输出长度，默认 4000 字符 |
| `stderr_max` | number | stderr 最大输出长度，默认 2000 字符 |
| `confirm` | boolean | 确认执行（当前策略下不需要） |

**输出字段**: `status`、`exit_code`、`stdout`、`stderr`、`duration_ms`、`killed`（是否超时终止）、`truncated`

**示例**:
```json
{ "command": "git log --oneline -10", "working_directory": "/project" }
{ "command": "npm install", "working_directory": "D:/myapp", "timeout_ms": 120000 }
{ "command": "Get-Process | Where-Object CPU -gt 10", "output_format": "text" }
```

---

### 10. `task_manager` — 任务管理

创建和管理结构化任务，支持优先级、截止日期、子任务和进度跟踪。数据持久化存储于 `~/.local_file_operations/tasks/` 目录，不受 npm 更新影响。

**必填参数**: `operation`, `model_name`

| 参数 | 类型 | 说明 |
|------|------|------|
| `operation` | string | `create` / `list` / `update` / `complete` / `delete` / `get` / `clear` |
| `model_name` | string | 模型标识，用于隔离不同模型的任务数据，默认 `"default"` |
| `task_id` | string | 任务 ID（`update`、`complete`、`delete`、`get` 时使用） |
| `title` | string | 任务标题 |
| `description` | string | 任务详细描述 |
| `priority` | string | `low` / `medium` / `high` / `urgent` |
| `due_date` | string | 截止日期（ISO 8601） |
| `progress` | number | 完成进度（0-100） |
| `subtasks` | array | 子任务字符串列表 |

**示例**:
```json
{ "operation": "create", "model_name": "claude", "title": "重构认证模块", "priority": "high", "due_date": "2026-06-01" }
{ "operation": "list", "model_name": "claude" }
{ "operation": "update", "model_name": "claude", "task_id": "task_xxx", "progress": 75 }
{ "operation": "complete", "model_name": "claude", "task_id": "task_xxx" }
{ "operation": "clear", "model_name": "claude" }
```

---

### 11. `time_tool` — 时间工具

获取当前时间，支持多种格式和时区。纯只读操作。

| 参数 | 类型 | 说明 |
|------|------|------|
| `format` | string | `iso` / `unix` / `unix_ms` / `rfc3339` / `locale` |
| `time_zone` | string | IANA 时区名称，如 `"Asia/Shanghai"` |
| `include_milliseconds` | boolean | 是否包含毫秒 |

**示例**:
```json
{ "format": "iso", "time_zone": "Asia/Shanghai" }
{ "format": "unix_ms" }
{ "format": "locale", "time_zone": "America/New_York" }
```

---

### 12. `environment_memory` — 环境记忆

持久化存储键值对形式的环境信息，存储于 `~/.local_file_operations/.env`。  
首次运行时根据当前平台自动生成默认值（OS、CPU、内存、工作目录等）。

**必填参数**: `operation`

| 参数 | 类型 | 说明 |
|------|------|------|
| `operation` | string | `read`（读取全部）/ `update`（写入）/ `get`（读取单个） |
| `key` | string | 变量键名 |
| `value` | string | 变量值 |
| `description` | string | 变量描述 |

**内置默认变量**:

| 键 | 说明 |
|----|------|
| `LLM_CURRENT_PATH` | 当前用户 home 目录 |
| `DEFAULT_WORKSPACE` | 默认工作目录 |
| `OS` | 操作系统名称（动态检测） |
| `HW_CPU` | CPU 型号（动态检测） |
| `HW_MEMORY` | 内存大小（动态检测） |

**示例**:
```json
{ "operation": "read", "output_format": "json" }
{ "operation": "update", "key": "PROJECT_ROOT", "value": "/home/user/myproject", "description": "主项目目录" }
{ "operation": "get", "key": "OS" }
```

---

### 13. `workspace_manager` — 工作目录管理

管理 Agent 的工作目录上下文。支持临时（仅当前会话）和默认（持久化）两种工作目录。

`index.js` 同时将此工具用作内部服务——在每次工具调用前自动注入 `working_directory`。

**必填参数**: `operation`

| 参数 | 类型 | 说明 |
|------|------|------|
| `operation` | string | `get_current` / `set_temp` / `set_default` / `clear_temp` / `status` |
| `workspace_path` | string | 工作目录路径（`set_temp`、`set_default` 时使用） |

**示例**:
```json
{ "operation": "get_current" }
{ "operation": "set_temp", "workspace_path": "D:/projects/myapp" }
{ "operation": "set_default", "workspace_path": "/home/user/workspace" }
{ "operation": "clear_temp" }
{ "operation": "status", "output_format": "json" }
```

---

### 14. `sudo_config` — Sudo 配置管理（仅 Linux）

管理 Linux sudoers 无密码配置，支持生成、安装、测试和移除配置。提供 `dry_run` 演练模式。

**必填参数**: `action`

| 参数 | 类型 | 说明 |
|------|------|------|
| `action` | string | `status` / `generate` / `install` / `remove` / `list` / `test` / `recommendations` |
| `username` | string | 用户名 |
| `scope` | string | `limited`（文件操作）/ `extended`（服务管理）/ `full`（完全访问） |
| `commands` | array | 自定义允许的命令列表 |
| `config_name` | string | 配置文件名称 |
| `dry_run` | boolean | 演练模式，只显示不执行 |

**示例**:
```json
{ "action": "status" }
{ "action": "generate", "username": "deploy", "scope": "limited", "dry_run": true }
{ "action": "install", "username": "deploy", "scope": "extended" }
{ "action": "remove", "config_name": "ax-local-ops" }
```

---

## 五、数据持久化

| 数据 | 存储位置 |
|------|---------|
| 环境变量 | `~/.local_file_operations/.env` |
| 任务数据 | `~/.local_file_operations/tasks/todo_<model_name>.json` |

两者均位于用户 home 目录，`npm update` 不会清除数据。

---

## 六、配置与接入

### MCP 客户端配置示例

```json
{
  "mcpServers": {
    "ax-local-operations": {
      "command": "npx",
      "args": ["-y", "ax-local-operations-mcp"]
    }
  }
}
```

或本地开发模式：

```json
{
  "mcpServers": {
    "ax-local-operations": {
      "command": "node",
      "args": ["/path/to/Ax-LocalTools-MCP/index.js"]
    }
  }
}
```

### 启动命令

```bash
npm start                        # 启动 MCP 服务
node test/runTests.js            # 运行完整测试套件
node test/integrationTest.js     # 运行集成测试
```

---

## 七、已知限制

- `file_archive` 在 Windows 上需要 PATH 中存在 `zip`/`unzip`/`tar`/`gzip`（Git Bash 或 WSL 可提供）
- `sudo_config` 仅在 Linux 上注册，Windows/macOS 不可用
- `file_watch` 的 `duration=0` 为持续监控，需外部停止进程
- `postinstall` 脚本（`bin/setup-workspace.js`）会交互式提问，CI 环境中可能挂起
