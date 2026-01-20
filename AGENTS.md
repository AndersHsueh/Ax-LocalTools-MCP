# AGENTS.md - AX Local Operations MCP Server

This document provides guidelines for AI coding agents working on this MCP server codebase.

## Build, Lint, and Test Commands

```bash
# Development
npm start              # Start MCP server (uses index.js)
npm run dev            # Same as start for development

# Release (uses semantic-release)
npm run release        # Bump version and publish

# Testing
node test/runTests.js              # Run full test suite
node test/runTests.js --single     # Run single test (if supported)
node test/integrationTest.js       # Run integration tests

# Manual server test
npx -y ax-local-operations-mcp@file:/path/to/project
```

## Code Style Guidelines

### General Principles
- Write clean, readable code with clear intent
- Follow existing patterns in the codebase before introducing new ones
- Keep functions focused and small (< 100 lines preferred)
- Use async/await for all asynchronous operations
- Handle errors gracefully with meaningful messages

### File Organization
- **Main entry**: `index.js` - MCP server bootstrap with dynamic ESM import
- **Tools**: `tools/*.js` - Each tool in its own file (e.g., `fileOperation.js`)
- **Library**: `lib/*.js` - Shared utilities (pathUtils, output, commandPolicy)
- **Errors**: `errors.js` - Centralized error definitions
- **Responses**: `responses.js` - Output formatting helpers

### Imports and Modules
```javascript
// Use CommonJS require() for all modules
const fs = require('fs').promises;
const path = require('path');
const { buildOutput } = require('../lib/output');
const { ERR } = require('../errors');

// Import tool class
const FileOperationTool = require('./fileOperation');
```

### Naming Conventions
| Type | Convention | Examples |
|------|------------|----------|
| Classes | PascalCase | `FileOperationTool`, `SecurityValidator`, `ToolError` |
| Functions/Variables | camelCase | `resolvePath`, `filePath`, `outputFormat` |
| Constants | UPPER_SNAKE_CASE | `ERR.PATH_DENIED`, `E_PATH_DENIED` |
| Tool names | snake_case | `file_operation`, `file_edit`, `execute_command` |
| Error codes | E_PREFIX_SNAKE | `E_PATH_DENIED`, `E_NOT_FOUND`, `E_INVALID_ARGS` |

### Class Structure
```javascript
class ToolName {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    // Destructure and validate args
    const { operation, path, output_format = 'text' } = args;
    if (!path) throw ERR.INVALID_ARGS('缺少 path 参数');

    // Route to handler
    switch (operation) {
      case 'read': return await this.readFile(path, output_format);
      default: throw new Error(`不支持的操作: ${operation}`);
    }
  }

  async readFile(filePath, outputFormat) {
    // Implementation
  }
}

module.exports = ToolName;
```

### Error Handling
```javascript
// Use centralized ERR helper (errors.js)
const { ERR } = require('../errors');

// Throw structured errors
throw ERR.PATH_DENIED(filePath);
throw ERR.NOT_FOUND(path);
throw ERR.INVALID_ARGS('错误信息');
throw ERR.DANGEROUS_CMD(command);
throw ERR.LIMIT_REACHED('超过限制');

// Catch and wrap
try {
  // operation
} catch (error) {
  if (error.code === 'ENOENT') throw ERR.NOT_FOUND(path);
  if (error.code === 'E_PATH_DENIED') throw error;
  throw ERR.INVALID_ARGS(`操作失败: ${error.message}`);
}
```

### Output Format
All tools support `output_format` parameter with values:
- `'text'` - Human-readable summary
- `'json'` - Structured data
- `'both'` - Text + JSON together

```javascript
const { buildOutput } = require('../lib/output');

// In tool handler
return buildOutput(outputFormat, `成功写入: ${fullPath}`, {
  action: 'write',
  path: fullPath,
  size: Buffer.byteLength(content, 'utf8')
});

// Or use response helpers directly
const { text, json, both } = require('../responses');
return json({ action: 'read', path: fullPath, content: data });
```

### Parameter Aliases
Support multiple parameter names for flexibility:
```javascript
const { path, file_path, dir_path } = args;
const targetPath = path || file_path || dir_path; // alias normalization
```

### Documentation
- Use JSDoc-style comments for class/method descriptions
- Include Chinese comments for user-facing messages
- Keep descriptions concise but informative
- Document all parameters in tool descriptors (registry.js)

### Security Patterns
- Always use `securityValidator.resolveAndAssert()` for path operations
- Check `securityValidator.isPathAllowed()` before file operations
- Use `spawn` with array arguments (never shell string concatenation)
- Follow commandPolicy for dangerous command handling

### Tool Registration (registry.js)
Each tool requires:
1. Class instantiation with `securityValidator`
2. Descriptor with name, description, inputSchema properties
3. Proper enum definitions for operation types
4. Required fields array

### Testing Patterns
- Tests in `test/` directory
- Use `CrossPlatformTestSuite` for cross-platform validation
- Generate reports in `test/reports/`
- Test both success and error cases

### Common Pitfalls to Avoid
- Don't use `as any`, `@ts-ignore`, or suppress type errors
- Don't leave empty catch blocks: `catch (e) {}`
- Don't use shell string concatenation for commands (use spawn arrays)
- Don't access sensitive system paths (use securityValidator)
- Don't commit directly; create PRs for review
