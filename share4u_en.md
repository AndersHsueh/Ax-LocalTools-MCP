# 🚀 AX MCP Server Development Guide Prompt

## 📋 Task Description

Please help me create a complete MCP (Model Context Protocol) server project named `ax_local_operations` that implements local file operations and command execution functionality.

## 🎯 Core Functionality Requirements

### 1. File Operation Tool
- **Unified Interface**: Create a tool named `file_operation`
- **Supported Operations**: `read`, `write`, `list`, `create_dir`, `delete`
- **Parameter Structure**:
  ```json
  {
    "operation": "read|write|list|create_dir|delete",
    "path": "file or directory path",
    "content": "content to write (only needed for write operation)"
  }
  ```

### 2. File Edit Tool (v1.1.0 New)
- **Tool Name**: `file_edit`
- **Supported Operations**: `delete_lines`, `insert_lines`, `replace_lines`, `append_lines`
- **Parameter Structure**:
  ```json
  {
    "operation": "delete_lines|insert_lines|replace_lines|append_lines",
    "path": "file path",
    "start_line": "start line number (1-based)",
    "end_line": "end line number (only needed for delete_lines and replace_lines)",
    "content": "content to insert or replace",
    "encoding": "file encoding (optional, default utf8)"
  }
  ```

### 3. Command Execution Tool
- **Tool Name**: `execute_command`
- **Parameter Structure**:
  ```json
  {
    "command": "command to execute",
    "working_directory": "working directory (optional)"
  }
  ```

### 4. Security Restrictions
- **Forbidden Paths**: `/`, `/Users/<current_user>`, `/etc`, `/bin`
- **Dangerous Command Filtering**: `rm -rf`, `sudo`, `chmod 777`, `format`, `del`, etc.
- **Path Validation**: All operations must pass security checks

## 🛠️ Technology Stack Requirements

### 1. Development Environment
- **Language**: Node.js (>= 18.0.0)
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Transport**: stdio (standard input/output)
- **Package Manager**: npm

### 2. Project Structure
```
mcp-server/
├── index.js              # Main server file
├── package.json          # Project configuration
├── mcp_config.json       # LM Studio configuration
├── qwen_config.json      # Qwen configuration
├── mcp_config_template.json # Configuration template
└── README.md             # Project documentation
```

### 3. package.json Requirements
```json
{
  "name": "local-file-operation-mcp",
  "version": "1.0.0",
  "description": "Local file operation MCP server",
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

## 📋 Configuration Requirements

### 1. LM Studio Configuration
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

### 2. Qwen Configuration
```json
{
  "mcpServers": {
    "ax_local_operations": {
      "command": "npx",
      "args": [
        "-y",
        "ax-local-operations-mcp@file:/path/to/project"
      ],
      "env": {
        "NODE_PATH": "/path/to/project",
        "PATH": "/path/to/node/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

## 🔧 Implementation Requirements

### 1. MCP Server Implementation
- Use `@modelcontextprotocol/sdk` to create the server
- Implement `ListToolsRequestSchema` to return tool list
- Implement `CallToolRequestSchema` to handle tool calls
- Use `stdio` transport method

### 2. Tool Implementation Details
- **File Reading**: Use `fs.readFileSync` or `fs.promises.readFile`
- **File Writing**: Use `fs.writeFileSync` or `fs.promises.writeFile`
- **Directory Listing**: Use `fs.readdirSync` or `fs.promises.readdir`
- **Directory Creation**: Use `fs.mkdirSync` or `fs.promises.mkdir`
- **File Deletion**: Use `fs.unlinkSync` or `fs.promises.unlink`
- **Directory Deletion**: Use `fs.rmSync` or `fs.promises.rm`

### 3. Security Implementation
- Path Normalization: Use `path.resolve()` and `path.normalize()`
- Path Validation: Ensure operation paths are within allowed ranges
- Command Filtering: Check if commands contain dangerous keywords
- Error Handling: Provide clear error messages

## 📝 Documentation Requirements

### 1. README.md Content
- Project introduction and feature overview
- Installation and configuration instructions
- Tool usage examples
- Supported LLM applications
- Troubleshooting guide

### 2. Configuration Templates
- Provide generic configuration templates
- Include detailed configuration explanations
- Support configurations for different LLM applications

## 🎯 Delivery Requirements

### 1. Complete Project
- All source code files
- Configuration files
- Project documentation
- Dependency management files

### 2. Testing and Validation
- Provide test commands
- Verify tool functionality
- Confirm security restrictions

### 3. Usage Instructions
- Detailed installation steps
- Configuration methods
- Usage examples

## 💡 Key Tips

1. **MCP Protocol**: Ensure full compliance with MCP protocol specifications
2. **Cross-platform Compatibility**: Support different LLM applications (LM Studio, Qwen, etc.)
3. **Security First**: All operations must pass security checks
4. **Error Handling**: Provide friendly error messages and handling mechanisms
5. **Complete Documentation**: Ensure users can quickly get started

## 🚀 Expected Results

Final delivery of a complete, secure, and powerful MCP server project that supports:
- ✅ Local file operations (read, write, list, create, delete)
- ✅ Secure command execution
- ✅ Multi-platform compatibility (LM Studio, Qwen, etc.)
- ✅ Complete security restrictions
- ✅ Detailed documentation and configuration

Please create the complete project according to the above requirements!
