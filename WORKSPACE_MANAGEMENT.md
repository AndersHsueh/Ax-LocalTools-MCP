# 工作目录管理功能使用说明

## 1. 安装时默认工作目录设置

当你全局安装 `ax_local_operations` 时，系统会自动触发默认工作目录配置流程：

```bash
npm install -g ax_local_operations
```

安装过程中，你会看到以下引导信息：

```
*** ax-local-operation 是一个增强Cowork的MCP
*** 需要选择一个默认的工作目录
*** 也可以在对话中使用：`当前的工作目录是： xxxx` 来临时指定。

请选择默认工作目录：

[ ] 1. C:\Users\username\Documents\MyObsidianNotes
[ ] 2. c:/users/a/a1note
[ ] 3. d:/users/b/b1note
[ ] 4. c:/user/projects/temp/note1
[v] 5. 使用 C:\Users\username\.axlocalop\workspace
[ ] 6. 输入一个默认的工作目录

使用上下方向键选择，按Enter键确认
```

系统会自动检测可能的Obsidian笔记仓库路径作为选项，并提供默认选项和自定义输入选项。

## 2. 命令行参数修改默认工作目录

你可以使用 `--default-dir` 参数重新设定默认工作目录：

```bash
ax_local_operations --default-dir 'c:/user/a/note1'
```

执行后，系统会验证并创建该目录（如果不存在），然后将其设置为默认工作目录。

## 3. 运行时临时指定工作目录

在与MCP的对话中，你可以使用以下命令临时切换工作目录：

```
当前工作目录是：C:\Users\username\Documents\Projects
```

临时指定的工作目录优先级高于默认工作目录设置，仅在当前会话内有效。

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