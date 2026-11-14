# 工作目录管理功能使用说明

## 1. 安装时默认工作目录设置

全局安装时会自动创建默认工作目录 `~/axlocalop/workspace`：

```bash
npm install -g ax-local-operations-mcp
```

安装脚本是**非交互**的：npm 安装阶段 stdin 通常不是 TTY，交互式向导会立即读到 EOF 并让安装以 ELIFECYCLE 失败。因此它只做幂等的目录预创建，不会阻塞安装，也不会覆盖已有配置。

需要自行选择目录时，显式运行交互式向导：

```bash
npm run setup:workspace
```

向导会列出检测到的 Obsidian 笔记库与默认路径供选择，并把结果写入环境配置。

> 默认目录位于**非隐藏**目录：路径校验会拒绝任何隐藏目录组件，旧版的 `~/.axlocalop/workspace` 会导致其下所有相对路径调用被拒。

## 2. 命令行参数修改默认工作目录

你可以使用 `--default-dir` 参数重新设定默认工作目录：

```bash
ax_local_operations --default-dir 'c:/user/a/note1'
```

执行后，系统会验证并创建该目录（如果不存在），然后将其设置为默认工作目录。

## 3. 运行时临时指定工作目录

使用 `workspace_manager` 工具切换：

```json
{
  "name": "workspace_manager",
  "arguments": {
    "operation": "set_temp",
    "workspace_path": "C:\\Users\\username\\Documents\\Projects"
  }
}
```

临时工作目录优先级高于默认工作目录，可用 `clear_temp` 清除。

> 旧版本曾支持在任意参数里写「当前工作目录是：xxx」来切换，但该实现会**吞掉整个工具调用**（例如写入内容里出现这串字就静默不写），已被移除。参数值现在一律按数据处理，不再被当作指令解析。

## 4. 使用工作目录管理工具

### 4.1 获取当前工作目录

```json
{
  "name": "workspace_manager",
  "arguments": {
    "operation": "get_current",
    "output_format": "json"
  }
}
```

### 4.2 设置临时工作目录

```json
{
  "name": "workspace_manager",
  "arguments": {
    "operation": "set_temp",
    "workspace_path": "C:\Users\username\Documents\Projects",
    "output_format": "text"
  }
}
```

### 4.3 设置默认工作目录

```json
{
  "name": "workspace_manager",
  "arguments": {
    "operation": "set_default",
    "workspace_path": "C:\Users\username\Documents\Notes",
    "output_format": "text"
  }
}
```

### 4.4 清除临时工作目录设置

```json
{
  "name": "workspace_manager",
  "arguments": {
    "operation": "clear_temp",
    "output_format": "text"
  }
}
```

### 4.5 获取工作目录状态信息

```json
{
  "name": "workspace_manager",
  "arguments": {
    "operation": "status",
    "output_format": "json"
  }
}
```

## 5. 工作目录优先级

工作目录的优先级顺序为：

1. **临时工作目录**：通过对话命令或`set_temp`操作设置的工作目录
2. **默认工作目录**：通过安装引导或`set_default`操作设置的工作目录
3. **回退工作目录**：`~/.axlocalop/workspace`（如果以上都未设置）

## 6. 工作目录验证

系统会自动验证工作目录的有效性：

- 检查目录是否存在，如果不存在则尝试创建
- 检查是否有读写权限
- 确保路径是安全的（不包含敏感目录）

如果验证失败，系统会给出明确的错误提示。

## 7. 日志记录

工作目录管理功能会记录以下日志信息：

- 工作目录设置和变更历史
- 目录创建和验证过程
- 错误和异常信息

这些日志可以帮助调试和排查问题。