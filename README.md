# AX本地操作 MCP 服务器 v2.7.1

一个功能强大的 MCP (Model Context Protocol) 服务器，名为 `ax_local_operations`，为大模型应用提供安全的本地文件操作、行级编辑、文件搜索、文件比较、文件哈希、文件权限、文件压缩、文件监控、命令执行和任务管理功能。

## 作者本人推荐,特点: 
  - 使用这个ax_local_operations，你可以在任何接受MCP的对话应用里, 把它变成可以操作电脑的助手. 而不仅仅是一个对话聊天工具. 
  - 最佳实践: 使用 `Qwen` 应用, 加入 ax_local_operations 这个MCP之后,  qwen 可以接受用户的指示, 从而完成一些诸如编码, 部署环境, 检测设备硬件等等的实际工作. 而不是仅仅聊天.  还可以使用 `Jan`,`lmStudio` 这些应用都可以加入ax_local_operations 这个MCP之后，从而实现更智能的助手功能。 
  - 对比其它MCP, 比如其它的本地文件MCP, 专注于文件操作. 但没有命令执行工具，所以这个MCP适合做对话应用，而不是命令行工具。 

## 使用注意,
  - 安装时会自动提示设置默认工作目录，也可以使用 `--default-dir` 参数指定
  - 在对话中可以使用：`当前的工作目录是：/User/research/work` 来临时指定工作目录
  - 使用 `workspace_manager` 工具可以管理工作目录设置

## 🌐 平台兼容性

### 支持的平台
| 平台 | 支持状态 | 说明 |
|------|---------|------|
| macOS | ✅ 完全支持 | 所有工具均可正常使用 |
| Linux | ✅ 完全支持 | 所有工具均可正常使用（包括 sudo_config） |
| Windows | ✅ 基本支持 | 11个工具可用，2个工具部分支持 |

### 工具平台支持详情

#### 完全跨平台支持（Windows/macOS/Linux）
以下工具在所有平台上均可正常使用：
- ✅ file_operation - 文件操作
- ✅ file_edit - 文件编辑
- ✅ file_search - 文件搜索
- ✅ file_compare - 文件比较
- ✅ file_hash - 文件哈希
- ✅ file_permissions - 文件权限管理（使用系统对应的命令：attrib/icacls 或 chmod）
- ✅ file_watch - 文件监控
- ✅ execute_command - 命令执行
- ✅ task_manager - 任务管理
- ✅ time_tool - 时间工具
- ✅ environment_memory - 环境记忆
- ✅ workspace_manager - 工作目录管理

#### 平台限制
**file_archive** - 文件压缩工具
- macOS/Linux: ✅ 完全支持（使用系统命令 zip/unzip/tar/gzip）
- Windows: ⚠️ 需要安装额外工具
  - 需要安装 Git Bash、WSL 或第三方压缩工具
  - 或手动安装 zip/unzip/tar/gzip 命令行工具

**sudo_config** - Sudo配置工具
- Linux: ✅ 完全支持
- macOS: ❌ 不支持（不适用）
- Windows: ❌ 不支持（不适用）

### Windows 用户注意事项
