# AX本地操作 MCP 服务器

> 版本 2.8.0 · Node.js ≥ 18 · Windows / macOS / Linux

为大模型应用提供安全的本地操作能力：文件读写、行级编辑、搜索、比较、哈希、权限、压缩、监控、命令执行和任务管理。

---

## 快速开始

### npx（推荐，无需安装）

```json
{
  "mcpServers": {
    "ax_local_operations": {
      "command": "npx",
      "args": ["-y", "ax-local-operations-mcp"]
    }
  }
}
```

### 本地安装

```bash
npm install -g ax-local-operations-mcp
```

```json
{
  "mcpServers": {
    "ax_local_operations": {
      "command": "ax-local-operations-mcp"
    }
  }
}
```

安装脚本会自动创建默认工作目录 `~/axlocalop/workspace`（非交互，不会阻塞安装）。
如需自行选择目录，运行 `npm run setup:workspace` 启动交互式向导；
也可在单次调用中通过 `working_directory` 参数指定，或用 `workspace_manager` 工具切换。

---

## 工具列表

| 工具名 | 说明 | 平台 |
|--------|------|------|
| `file_operation` | 文件读写、列出、创建目录、删除 | 全平台 |
| `file_edit` | 行级编辑（插入、删除、替换、追加） | 全平台 |
| `file_search` | 正则/关键词内容搜索 | 全平台 |
| `file_compare` | 文件差异对比 | 全平台 |
| `file_hash` | MD5/SHA256 等哈希计算 | 全平台 |
| `file_permissions` | 权限读写（chmod / attrib / icacls） | 全平台 |
| `file_archive` | 压缩/解压（zip/tar/gzip） | 全平台¹ |
| `file_watch` | 文件/目录变更监控 | 全平台 |
| `execute_command` | 执行系统命令（pwsh / bash） | 全平台 |
| `task_manager` | 任务创建与跟踪 | 全平台 |
| `time_tool` | 时间查询与格式化 | 全平台 |
| `environment_memory` | 持久化环境信息存储 | 全平台 |
| `workspace_manager` | 工作目录管理 | 全平台 |
| `sudo_config` | sudo 无密码配置助手 | Linux 专用 |

> ¹ Windows 需要 `zip`/`unzip`/`tar`/`gzip` 在 PATH 中（Git Bash、WSL 或手动安装）。

---

## 安全策略

- **路径安全**：`securityValidator.resolveAndAssert()` 阻止相对路径逃逸出工作目录；拒绝路径中的隐藏目录组件（如 `../.hidden/file`），但允许 `.env` 等点文件。
- **命令安全**：仅拦截不可恢复的极危险命令（如 `format C:`、`rm -rf /`）；Agent 全控授权模式下无警告摩擦。所有外部命令（`sudo`、`icacls`、`attrib`、`tar` 等）统一用参数数组调用，不拼接 shell 字符串；sudoers 配置名、用户名、命令列表与 ACL 用户名/权限串均有白名单校验。
- **工作目录注入**：分发层会在未显式传入时自动注入 `working_directory`，作为**相对路径**的解析基准；显式绝对路径不受该目录限制（仍受隐藏目录规则约束）。
- **输出合规**：所有工具只返回 MCP 合法的 `text` 内容块；JSON 以文本承载，机器可读数据放在 `structuredContent`。声明了 `outputSchema` 的工具在成功时必定返回 `structuredContent`。

---

## 工作目录管理

通过 `workspace_manager` 工具切换（**参数中的任意文本都不会被当作指令解析**）：

```json
{ "name": "workspace_manager", "arguments": { "operation": "set_temp", "workspace_path": "/path/to/project" } }
{ "name": "workspace_manager", "arguments": { "operation": "status" } }
```

也可对单次调用传 `working_directory`，或用 `--default-dir /path/to/project` 设置默认工作目录。
详见 [WORKSPACE_MANAGEMENT.md](WORKSPACE_MANAGEMENT.md)。

---

## 开发

```bash
npm install                # 安装依赖
npm start                  # 启动 MCP 服务器（stdio）
npm test                   # e2e + 集成 + 真实 stdio 冒烟测试
npm run test:e2e           # 仅端到端行为测试
npm run test:stdio         # 仅真实 MCP 客户端握手测试
node test/runTests.js      # 完整测试套件（报告写入 test/reports/）
npm run setup:workspace    # 交互式选择默认工作目录
npm run release            # semantic-release（需 Conventional Commits）
```

### 添加新工具

1. 创建 `tools/newTool.js`，导出带 `constructor(securityValidator)` 和 `async handle(args)` 的类。
2. 在 `tools/registry.js` 中导入、实例化、添加描述符。
3. 详见 `tools/tools_dev_guide.md`。

---

## 平台兼容性

| 平台 | 支持状态 |
|------|---------|
| Windows 10/11 | ✅ 完全支持（PowerShell 7 / pwsh） |
| macOS | ✅ 完全支持 |
| Linux | ✅ 完全支持（含 sudo_config） |

---

## 许可证

MIT
