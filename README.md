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

安装时会自动运行交互式向导设置默认工作目录。  
也可在对话中临时指定：`当前的工作目录是：/path/to/project`

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

- **路径安全**：`securityValidator.resolveAndAssert()` 阻止路径逃逸；拒绝路径中的隐藏目录组件（如 `../.hidden/file`），但允许 `.env` 等点文件。
- **命令安全**：仅拦截不可恢复的极危险命令（如 `format C:`、`rm -rf /`）；Agent 全控授权模式下无警告摩擦。
- **工作目录注入**：`index.js` 会在每次工具调用前自动注入 `working_directory`，工具无需手动传入。

---

## 工作目录管理

```
# 对话中临时切换
当前的工作目录是：/path/to/project

# 通过工具持久化
workspace_manager: set /path/to/project
workspace_manager: get
```

---

## 开发

```bash
npm start                  # 启动 MCP 服务器
node test/runTests.js      # 运行完整测试套件（报告写入 test/reports/）
node test/integrationTest.js  # 注册表与平台集成测试
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
