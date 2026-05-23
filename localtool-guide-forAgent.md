# Agent Guide: ax_local_operations MCP

This document is written for AI agents. Read it fully before using or troubleshooting this MCP server.

---

## 1. What This MCP Is

MCP server name: **`ax_local_operations`**  
Package: `ax-local-operations-mcp`  
Transport: stdio  
Node.js requirement: ≥ 18

It provides 13 tools (14 on Linux) for local file operations, command execution, and task/memory management. All tools receive `working_directory` automatically — you do not need to inject it unless you want to override it.

---

## 2. How to Check If It Is Running

If tool calls to any of the tool names listed in Section 4 succeed, the server is running.

If tool calls fail with "未知工具" or connection errors, the server is not running or not configured. See Section 3.

---

## 3. How to Start / Register the Server

### Option A — npx (no install needed)

Add to your MCP client config (e.g., Claude Desktop `claude_desktop_config.json`, Cursor, or any MCP-compatible host):

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

### Option B — globally installed

```bash
npm install -g ax-local-operations-mcp
```

Config:

```json
{
  "mcpServers": {
    "ax_local_operations": {
      "command": "ax-local-operations-mcp"
    }
  }
}
```

### Option C — local repo (development)

```json
{
  "mcpServers": {
    "ax_local_operations": {
      "command": "node",
      "args": ["/absolute/path/to/Ax-LocalTools-MCP/index.js"]
    }
  }
}
```

### Set a default working directory at startup

```json
"args": ["-y", "ax-local-operations-mcp", "--default-dir", "/path/to/project"]
```

### Set working directory at runtime (without using workspace_manager tool)

Pass any string containing the pattern `当前的工作目录是：<path>` in any argument value. The server intercepts this and sets the temp workspace, then returns without calling the tool. Example:

```json
{ "command": "当前的工作目录是：/home/user/project" }
```

---

## 4. Tools Reference

All tools accept `output_format`: `"text"` | `"json"` | `"both"`. Default is `"text"`.  
All tools accept `working_directory` to override the current workspace for that call.  
All input schemas have `additionalProperties: true` — unknown args are silently ignored.

---

### 4.1 `file_operation`

Read, write, list, create directories, delete files/directories.

| param | type | required | description |
|-------|------|----------|-------------|
| `operation` | string | ✅ | `read` \| `write` \| `list` \| `create_dir` \| `delete` |
| `path` | string | ✅ | Absolute or relative path |
| `content` | string | — | Required for `write` |
| `max_size` | number | — | Max bytes to read, default 10485760 (10MB) |
| `working_directory` | string | — | Base for relative paths |
| `output_format` | string | — | `text`/`json`/`both` |

```jsonc
// Read
{ "operation": "read", "path": "src/index.js" }

// Write
{ "operation": "write", "path": "output.txt", "content": "hello" }

// List directory
{ "operation": "list", "path": "." }

// Create directory
{ "operation": "create_dir", "path": "new/nested/dir" }

// Delete
{ "operation": "delete", "path": "tmp/old.txt" }
```

---

### 4.2 `file_edit`

Line-level editing. Auto-backs up original file before editing.

| param | type | required | description |
|-------|------|----------|-------------|
| `operation` | string | ✅ | `delete_lines` \| `insert_lines` \| `replace_lines` \| `append_lines` |
| `path` | string | ✅ | File path |
| `start_line` | number | — | 1-indexed start line |
| `end_line` | number | — | 1-indexed end line (for delete/replace) |
| `content` | string | — | Content to insert/replace/append |

```jsonc
// Delete lines 3–5
{ "operation": "delete_lines", "path": "file.js", "start_line": 3, "end_line": 5 }

// Insert after line 2
{ "operation": "insert_lines", "path": "file.js", "start_line": 2, "content": "// new comment\n" }

// Replace lines 10–12
{ "operation": "replace_lines", "path": "file.js", "start_line": 10, "end_line": 12, "content": "const x = 1;\n" }

// Append to end
{ "operation": "append_lines", "path": "file.js", "content": "\nmodule.exports = {};\n" }
```

---

### 4.3 `file_search`

Search file contents by regex pattern.

| param | type | required | description |
|-------|------|----------|-------------|
| `search_path` | string | ✅ | Directory to search in |
| `pattern` | string | ✅ | Regex pattern (no `g` flag applied — safe for repeated calls) |
| `file_types` | string | — | Comma-separated extensions: `"js,ts,json"` |
| `case_sensitive` | boolean | — | Default false |
| `max_results` | number | — | Default 100 |
| `max_depth` | number | — | Default 8 |
| `timeout_ms` | number | — | Default 60000 |
| `ignore` | array | — | Glob patterns to ignore: `["node_modules", "*.log"]` |

```jsonc
// Find all TODO comments in JS/TS files
{ "search_path": "src", "pattern": "TODO", "file_types": "js,ts", "ignore": ["node_modules"] }

// Find function definitions
{ "search_path": ".", "pattern": "function\\s+\\w+", "case_sensitive": false, "output_format": "json" }
```

---

### 4.4 `file_compare`

Diff two files. Returns identical flag + added/removed/modified line counts.

| param | type | required |
|-------|------|----------|
| `file1` | string | ✅ |
| `file2` | string | ✅ |

```jsonc
{ "file1": "a.js", "file2": "b.js", "output_format": "json" }
```

---

### 4.5 `file_hash`

Compute file checksum for integrity verification.

| param | type | required | description |
|-------|------|----------|-------------|
| `path` | string | ✅ | File to hash |
| `algorithm` | string | — | `md5` \| `sha1` \| `sha256` \| `sha512` (default `sha256`) |

```jsonc
{ "path": "dist/bundle.js", "algorithm": "sha256", "output_format": "json" }
```

---

### 4.6 `file_permissions`

Read or set file permissions. Unix: `chmod`. Windows: `icacls`.

| param | type | required | description |
|-------|------|----------|-------------|
| `path` | string | ✅ | Target path |
| `mode` | string | — | Unix octal: `"755"`, `"644"` |
| `permissions` | object | — | Windows-specific permissions object |
| `recursive` | boolean | — | Apply recursively |
| `max_depth` | number | — | Recursion depth limit |

```jsonc
// Unix
{ "path": "script.sh", "mode": "755" }

// Recursive
{ "path": "project", "mode": "644", "recursive": true }
```

---

### 4.7 `file_archive`

Compress or extract archives. Requires `zip`/`unzip`/`tar`/`gzip` in PATH on Windows.

| param | type | required | description |
|-------|------|----------|-------------|
| `operation` | string | ✅ | `compress` \| `extract` |
| `source` | string | ✅ | Source file or directory |
| `destination` | string | — | Output path |
| `format` | string | — | `zip` \| `tar` \| `gz` \| `tar.gz` |

```jsonc
// Compress
{ "operation": "compress", "source": "project", "destination": "backup.zip", "format": "zip" }

// Extract
{ "operation": "extract", "source": "archive.tar.gz", "destination": "./out" }
```

---

### 4.8 `file_watch`

Watch a file or directory for changes. Blocks until `duration` seconds elapse.

**Important:** `duration: 0` means watch indefinitely — the process will never return. Only use `duration: 0` if you intend to run it as a background process. For normal use, set a finite duration (e.g., 30–300).

| param | type | required | description |
|-------|------|----------|-------------|
| `path` | string | ✅ | Path to watch |
| `events` | string | — | `"create,delete,modify"` (comma-separated, default all) |
| `duration` | number | — | Seconds to watch; 0 = forever |
| `recursive` | boolean | — | Watch subdirectories |
| `max_depth` | number | — | Recursion depth |

```jsonc
{ "path": "src", "events": "create,modify", "duration": 60, "recursive": true }
```

---

### 4.9 `execute_command`

Execute shell commands. On Windows uses `pwsh` (PowerShell 7+), falls back to `powershell`. On Unix uses `/bin/sh`.

**Security:** Only truly unrecoverable system-destruction commands are blocked (e.g., `format C:`, `rm -rf /`). All other commands including `sudo`, `rm -rf <subdir>`, etc. are allowed.

| param | type | required | description |
|-------|------|----------|-------------|
| `command` | string | ✅ | Shell command (supports pipes, redirects) |
| `working_directory` | string | — | CWD for the command |
| `timeout_ms` | number | — | Default 60000 |
| `stdout_max` | number | — | Max stdout chars, default 4000 |
| `stderr_max` | number | — | Max stderr chars, default 2000 |

```jsonc
// Run tests
{ "command": "npm test", "working_directory": "/project", "timeout_ms": 120000 }

// PowerShell command on Windows
{ "command": "Get-ChildItem -Recurse | Select-Object Name" }

// Pipeline
{ "command": "cat package.json | grep version" }
```

Response fields: `status`, `command`, `cwd`, `exit_code`, `stdout`, `stderr`, `duration_ms`, `truncated`

If `exit_code !== 0`, the command failed. Check `stderr` for details.

---

### 4.10 `task_manager`

Persistent task tracking. Data stored at `~/.local_file_operations/tasks/`. Survives npm updates.

| param | type | required | description |
|-------|------|----------|-------------|
| `operation` | string | ✅ | `create` \| `list` \| `update` \| `complete` \| `clear` |
| `model_name` | string | ✅ | Namespace for tasks (use your agent/model name) |
| `task_id` | string | — | Required for `update` and `complete` |
| `title` | string | — | Task title |
| `description` | string | — | Task details |
| `priority` | string | — | `low` \| `medium` \| `high` \| `urgent` |
| `due_date` | string | — | ISO 8601 |
| `progress` | number | — | 0–100 |
| `subtasks` | array | — | Array of subtask strings |

```jsonc
// Create
{ "operation": "create", "model_name": "claude", "title": "Refactor auth module", "priority": "high" }

// List
{ "operation": "list", "model_name": "claude", "output_format": "json" }

// Update progress
{ "operation": "update", "model_name": "claude", "task_id": "abc123", "progress": 75 }

// Complete
{ "operation": "complete", "model_name": "claude", "task_id": "abc123" }
```

---

### 4.11 `time_tool`

Get current time in various formats.

| param | type | description |
|-------|------|-------------|
| `format` | string | `iso` \| `unix` \| `unix_ms` \| `rfc3339` \| `locale` |
| `time_zone` | string | IANA timezone, e.g. `"Asia/Shanghai"`, `"America/New_York"` |
| `include_milliseconds` | boolean | Include ms in output |

```jsonc
{ "format": "iso", "time_zone": "Asia/Shanghai" }
```

---

### 4.12 `environment_memory`

Persistent key-value store at `~/.local_file_operations/.env`. Use to remember settings across sessions.

| param | type | required | description |
|-------|------|----------|-------------|
| `operation` | string | ✅ | `read` \| `update` \| `get` |
| `key` | string | — | Variable name (required for `update` and `get`) |
| `value` | string | — | Value to store (required for `update`) |

```jsonc
// Read all stored variables
{ "operation": "read", "output_format": "json" }

// Store a value
{ "operation": "update", "key": "DEFAULT_PROJECT", "value": "/home/user/myproject" }

// Get single value
{ "operation": "get", "key": "DEFAULT_PROJECT" }
```

---

### 4.13 `workspace_manager`

Manage the working directory used by all tools. Two layers: `default` (persistent) and `temp` (session-level, overrides default).

| param | type | required | description |
|-------|------|----------|-------------|
| `operation` | string | ✅ | `get_current` \| `set_temp` \| `set_default` \| `clear_temp` \| `status` |
| `workspace_path` | string | — | Required for `set_temp` and `set_default` |

```jsonc
// Check current workspace
{ "operation": "get_current", "output_format": "json" }

// Set temporary workspace (resets when server restarts)
{ "operation": "set_temp", "workspace_path": "/home/user/project" }

// Set persistent default workspace
{ "operation": "set_default", "workspace_path": "/home/user/project" }

// Show both default and temp
{ "operation": "status" }
```

---

### 4.14 `sudo_config` (Linux only)

Configure passwordless sudo for the current user. Only available when the server is running on Linux.

| param | type | required | description |
|-------|------|----------|-------------|
| `action` | string | ✅ | `status` \| `generate` \| `install` \| `remove` \| `list` \| `test` \| `recommendations` |
| `username` | string | — | Target user |
| `scope` | string | — | `limited` \| `extended` \| `full` |
| `commands` | array | — | Specific commands to allow |
| `dry_run` | boolean | — | Preview without applying |

```jsonc
// Check current sudo status
{ "action": "status" }

// Generate config preview (dry run)
{ "action": "generate", "username": "myuser", "scope": "limited", "dry_run": true }
```

---

## 5. Security Boundaries

- **Path security:** All file tool paths are validated. Any path component that is a hidden directory (e.g., `../.git/`, `/home/.hidden/file`) is blocked with `E_PATH_DENIED`. Dotfiles themselves (e.g., `.env`, `.gitignore`) are fine.
- **No home-dir restriction:** Any absolute path is allowed, including outside the home directory.
- **Denied commands (hard block):** `format C:`, `rm -rf /`, `rm -rf /*`, fork bombs, `dd if=... of=/dev/sda`, `mkfs`. These return `status: "error"` without executing.
- **Everything else is allowed** — no confirmation friction in agent full-control mode.

---

## 6. Working Directory Resolution

Priority order (highest to lowest):

1. `working_directory` arg passed explicitly in the tool call
2. Temp workspace set via `workspace_manager` `set_temp` or the inline command pattern
3. Default workspace set via `workspace_manager` `set_default` or `--default-dir` at startup
4. `process.cwd()` of the server process

---

## 7. Common Patterns

### Read a file then edit it

```jsonc
// Step 1: read to see line numbers
{ "tool": "file_operation", "args": { "operation": "read", "path": "src/app.js" } }

// Step 2: replace target lines
{ "tool": "file_edit", "args": { "operation": "replace_lines", "path": "src/app.js", "start_line": 42, "end_line": 44, "content": "const x = newValue;\n" } }
```

### Find all usages of a symbol then execute a refactor command

```jsonc
{ "tool": "file_search", "args": { "search_path": "src", "pattern": "oldFunctionName", "file_types": "js,ts" } }
{ "tool": "execute_command", "args": { "command": "npx jscodeshift -t codemod.js src/", "timeout_ms": 60000 } }
```

### Run a build and check for errors

```jsonc
{ "tool": "execute_command", "args": { "command": "npm run build", "working_directory": "/project", "timeout_ms": 120000, "output_format": "json" } }
// Check: if exit_code !== 0, read stderr for errors
```

### Verify a downloaded file

```jsonc
{ "tool": "file_hash", "args": { "path": "downloaded.zip", "algorithm": "sha256" } }
```

### Switch project context

```jsonc
{ "tool": "workspace_manager", "args": { "operation": "set_temp", "workspace_path": "/home/user/new-project" } }
```

---

## 8. Error Codes

| code | meaning |
|------|---------|
| `E_PATH_DENIED` | Path escapes working dir or contains hidden directory component |
| `E_NOT_FOUND` | File or directory does not exist |
| `E_INVALID_ARGS` | Missing or invalid parameters |
| `E_DANGEROUS_CMD` | Command blocked by security policy |
| `E_LIMIT_REACHED` | Result size or depth limit exceeded |

All errors are returned as `{ isError: true, content: [{ type: "text", text: "<message>" }] }`.

---

## 9. Windows-Specific Notes

- Shell: `pwsh` (PowerShell 7+), fallback to `powershell`. Commands run with `-NonInteractive -NoProfile`.
- `file_archive` requires `zip`/`unzip`/`tar`/`gzip` binaries in PATH. Install via Git Bash, WSL, or Chocolatey (`choco install zip`).
- Paths: both `C:\path\to\file` and `C:/path/to/file` are accepted.
- UNC paths (`\\server\share\...`) and long paths (`\\?\...`) are supported.
