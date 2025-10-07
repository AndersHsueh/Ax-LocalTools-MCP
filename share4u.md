# 🚀 AX MCP 服务器开发引导 Prompt

## 📋 任务描述

请帮我创建一个完整的 MCP (Model Context Protocol) 服务器项目，名为 `ax_local_operations`，实现本地文件操作和命令执行功能。

## 🎯 核心功能要求

### 1. 文件操作工具
- **统一接口**：创建一个名为 `file_operation` 的工具
- **支持操作**：`read`（读取）、`write`（写入）、`list`（列表）、`create_dir`（创建目录）、`delete`（删除）
- **参数结构**：
  ```json
  {
    "operation": "read|write|list|create_dir|delete",
    "path": "文件或目录路径",
    "content": "写入内容（仅write操作需要）"
  }
  ```

### 2. 文件编辑工具 (v1.1.0 新增)
- **工具名称**：`file_edit`
- **支持操作**：`delete_lines`（删除行）、`insert_lines`（插入行）、`replace_lines`（替换行）、`append_lines`（追加行）
- **参数结构**：
  ```json
  {
    "operation": "delete_lines|insert_lines|replace_lines|append_lines",
    "path": "文件路径",
    "start_line": "起始行号（从1开始）",
    "end_line": "结束行号（仅delete_lines和replace_lines需要）",
    "content": "要插入或替换的内容",
    "encoding": "文件编码（可选，默认utf8）"
  }
  ```

### 3. 命令执行工具
- **工具名称**：`execute_command`
- **参数结构**：
  ```json
  {
    "command": "要执行的命令",
    "working_directory": "工作目录（可选）"
  }
  ```

### 4. 安全限制
- **禁止访问的路径**：`/`, `/Users/<current_user>`, `/etc`, `/bin`
- **危险命令过滤**：`rm -rf`, `sudo`, `chmod 777`, `format`, `del` 等
- **路径验证**：所有操作前必须进行安全检查

## 🛠️ 技术栈要求

### 1. 开发环境
- **语言**：Node.js (>= 18.0.0)
- **MCP SDK**：`@modelcontextprotocol/sdk`
- **传输方式**：stdio (标准输入输出)
- **包管理**：npm

### 2. 项目结构
```
mcp-server/
├── index.js              # 主服务器文件
├── package.json          # 项目配置
├── mcp_config.json       # LM Studio 配置
├── qwen_config.json      # Qwen 配置
├── mcp_config_template.json # 配置模板
└── README.md             # 项目文档
```

### 3. package.json 要求
```json
{
  "name": "local-file-operation-mcp",
  "version": "1.0.0",
  "description": "本地文件操作MCP服务器",
  "main": "index.js",
  "bin": {
    "local-file-operation-mcp": "index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

## 📋 配置要求

### 1. LM Studio 配置
```json
{
  "mcpServers": {
    "ax_local_operations": {
      "command": "/path/to/node",
      "args": ["/path/to/index.js"],
      "env": {
        "PATH": "/path/to/node/bin:/usr/local/bin:/usr/bin:/bin",
        "NODE_PATH": "/path/to/project"
      }
    }
  }
}
```

### 2. Qwen 配置
```json
{
  "mcpServers": {
    "ax_local_operations": {
      "command": "npx",
      "args": [
        "-y",
        "local-file-operation-mcp@file:/path/to/project"
      ]
    }
  }
}
```

## 🔧 实现要求

### 1. MCP 服务器实现
- 使用 `@modelcontextprotocol/sdk` 创建服务器
- 实现 `ListToolsRequestSchema` 返回工具列表
- 实现 `CallToolRequestSchema` 处理工具调用
- 使用 `stdio` 传输方式

### 2. 工具实现细节
- **文件读取**：使用 `fs.readFileSync` 或 `fs.promises.readFile`
- **文件写入**：使用 `fs.writeFileSync` 或 `fs.promises.writeFile`
- **目录列表**：使用 `fs.readdirSync` 或 `fs.promises.readdir`
- **目录创建**：使用 `fs.mkdirSync` 或 `fs.promises.mkdir`
- **文件删除**：使用 `fs.unlinkSync` 或 `fs.promises.unlink`
- **目录删除**：使用 `fs.rmSync` 或 `fs.promises.rm`

### 3. 安全实现
- 路径规范化：使用 `path.resolve()` 和 `path.normalize()`
- 路径检查：确保操作路径在允许范围内
- 命令过滤：检查命令是否包含危险关键词
- 错误处理：提供清晰的错误信息

## 📝 文档要求

### 1. README.md 内容
- 项目介绍和功能特性
- 安装和配置说明
- 工具使用示例
- 支持的大模型应用
- 故障排除指南

### 2. 配置模板
- 提供通用的配置模板
- 包含详细的配置说明
- 支持不同大模型应用的配置

## 🎯 交付要求

### 1. 完整项目
- 所有源代码文件
- 配置文件
- 项目文档
- 依赖管理文件

### 2. 测试验证
- 提供测试命令
- 验证工具功能
- 确认安全限制

### 3. 使用说明
- 详细的安装步骤
- 配置方法
- 使用示例

## 💡 关键提示

1. **MCP 协议**：确保完全符合 MCP 协议规范
2. **跨平台兼容**：支持不同的大模型应用（LM Studio、Qwen等）
3. **安全性优先**：所有操作都必须经过安全检查
4. **错误处理**：提供友好的错误信息和处理机制
5. **文档完整**：确保用户能够快速上手使用

## 🚀 预期结果

最终交付一个完整的、安全的、功能强大的 MCP 服务器项目，支持：
- ✅ 本地文件操作（读取、写入、列表、创建、删除）
- ✅ 安全的命令执行
- ✅ 多平台兼容（LM Studio、Qwen等）
- ✅ 完整的安全限制
- ✅ 详细的文档和配置

请按照以上要求创建完整的项目！
