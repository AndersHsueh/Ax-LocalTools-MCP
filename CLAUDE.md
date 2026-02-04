# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AX Local Operations MCP Server - A Model Context Protocol (MCP) server that provides secure local file operations, command execution, and task management tools for LLM applications.

- **Type**: Node.js (CommonJS), requires Node >= 18.0.0
- **Protocol**: MCP (Model Context Protocol) via stdio transport
- **SDK**: @modelcontextprotocol/sdk ^1.19.1

## Common Commands

```bash
# Development
npm start              # Start MCP server (runs index.js)
npm run dev            # Same as start

# Testing
node test/runTests.js              # Run full test suite
node test/integrationTest.js       # Run integration tests

# Release (semantic-release)
npm run release        # Bump version and publish to npm

# Manual server test
npx -y ax-local-operations-mcp@file:/path/to/project
```

## Architecture

### Directory Structure

```
index.js              # MCP server entry point (bootstrap with dynamic ESM import)
errors.js             # Centralized error definitions (ERR.* factory)
responses.js          # Output formatting helpers (text/json/both)
tools/                # MCP tool modules (14 tools)
  registry.js         # Central tool registry
  securityValidator.js # Path/command security validation
  *.js               # Individual tools (file_operation, file_edit, etc.)
lib/                  # Shared utilities
  output.js          # buildOutput() - unified output formatter
  pathUtils.js       # Path resolution utilities
  commandPolicy.js   # Command execution policy (deny/warn/allow)
bin/cli.js            # CLI wrapper
```

### Core Patterns

**Tool Structure**: Each tool is a class with:
```javascript
class ExampleTool {
  constructor(securityValidator) { this.securityValidator = securityValidator; }
  async handle(args) { /* implementation */ }
}
module.exports = ExampleTool;
```

**Output Format**: All tools support `output_format`: `text` | `json` | `both`
```javascript
const { buildOutput } = require('./lib/output');
return buildOutput(output_format, humanMessage, { action: '...', path, ... });
```

**Error Handling**: Use centralized ERR factory from `errors.js`:
```javascript
const { ERR } = require('./errors');
throw ERR.INVALID_ARGS('message');
throw ERR.PATH_DENIED(path);
throw ERR.NOT_FOUND(path);
throw ERR.DANGEROUS_CMD(command);
throw ERR.LIMIT_REACHED('reason');
```

**Security Validation**: Always use securityValidator for paths:
```javascript
if (!this.securityValidator.isPathAllowed(target)) throw ERR.PATH_DENIED(target);
const resolved = this.securityValidator.resolveAndAssert(path, workingDir);
```

### Available Tools

| Tool | Purpose |
|------|---------|
| `file_operation` | Read/write/list/create_dir/delete files |
| `file_edit` | Line-level editing (delete/insert/replace/append) |
| `file_search` | Content search with regex, filters, timeout |
| `file_compare` | Diff comparison between files |
| `file_hash` | MD5/SHA1/SHA256/SHA512 |
| `file_permissions` | chmod/icacls management |
| `file_archive` | Zip/tar/gz compression |
| `file_watch` | File system monitoring |
| `execute_command` | Safe shell command execution |
| `task_manager` | Task CRUD with priorities |
| `time_tool` | Time formatting (ISO/UNIX/locale) |
| `environment_memory` | Environment variable storage |
| `sudo_config` | Linux sudoers configuration |

### Security Model

1. **Path Sandbox**: Only allows access within user home directory and project patterns (Desktop, Documents, Projects, Workspace, etc.)
2. **Command Policy**:分级 evaluation via `lib/commandPolicy.js`: `deny` (throws), `warn` (requires confirm), `allow`
3. **Command Execution**: Use `spawn` with array arguments (never shell string concatenation)

## Key Conventions

- **Classes**: PascalCase (`FileOperationTool`)
- **Functions/Variables**: camelCase (`resolvePath`)
- **Constants**: UPPER_SNAKE_CASE (`E_PATH_DENIED`)
- **Tool names**: snake_case (`file_operation`)
- **Parameter aliases**: Support `path` / `file_path` / `dir_path` interchangeably

## Important Files

- `tools/registry.js` - Tool registration
- `tools/tools_dev_guide.md` - Detailed tool development规范
- `AGENTS.md` - Comprehensive AI agent guidelines
- `errors.js` - Error code reference
- `lib/output.js` - Output formatting reference
