# Qwen MCP配置说明

## 🎯 推荐配置（npx方式）

在你的Qwen应用中使用以下配置：

```json
{
  "mcpServers": {
    "ax_local_operations": {
      "command": "npx",
      "args": [
        "-y",
        "ax-local-operations-mcp@file:/Users/xueyuheng/research/mcp"
      ],
      "env": {
        "NODE_PATH": "/Users/xueyuheng/research/mcp",
        "PATH": "/Users/xueyuheng/.nvm/versions/node/v22.16.0/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

## ⚠️ 重要注意事项

1. **路径配置**：将配置中的 `/Users/xueyuheng/research/mcp` 替换为你的实际项目路径
2. **Node.js路径**：将 `/Users/xueyuheng/.nvm/versions/node/v22.16.0/bin` 替换为你的Node.js安装路径
3. **环境变量**：env配置是必需的，确保MCP服务器能找到正确的Node.js和项目依赖

## 🧪 测试配置

你可以通过以下命令测试配置是否正确：

```bash
# 测试版本信息
npx -y ax-local-operations-mcp@file:/Users/xueyuheng/research/mcp --version

# 测试帮助信息  
npx -y ax-local-operations-mcp@file:/Users/xueyuheng/research/mcp --help
```

## 🔧 可用工具

配置成功后，你将可以使用以下12个工具：

- `file_operation` - 文件读写、目录操作
- `file_edit` - 行级文件编辑
- `file_search` - 文件内容搜索
- `file_compare` - 文件差异比较
- `file_hash` - 文件哈希计算
- `file_permissions` - 文件权限管理
- `file_archive` - 文件压缩解压
- `file_watch` - 文件变化监控
- `execute_command` - 安全命令执行
- `task_manager` - 任务管理
- `time_tool` - 时间获取
- `environment_memory` - 环境记忆

## 🐛 常见问题

### Q: 仍然出现 "Connection closed" 错误？
A: 请检查：
1. Node.js版本是否 >= 18.0.0
2. PATH环境变量是否包含正确的Node.js路径
3. NODE_PATH是否指向项目根目录
4. 项目路径是否正确且可访问

### Q: npx命令找不到？
A: 确保：
1. Node.js已正确安装
2. npm/npx在PATH环境变量中
3. 使用完整的文件路径（file:/绝对路径）

### Q: 工具列表为空？
A: 可能是：
1. 依赖没有安装：`cd /path/to/project && npm install`
2. 工具注册失败：检查tools/目录是否完整
3. 权限问题：确保项目目录可读写