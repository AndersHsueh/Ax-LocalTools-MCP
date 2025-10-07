#!/usr/bin/env node

/**
 * 安全MCP服务器 - Node.js版本 v1.2.0
 * 支持文件操作、文件编辑、文件搜索、文件比较、文件哈希、文件权限、文件压缩、文件监控和命令执行
 * 包含安全限制，禁止操作敏感目录
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

// 重构：集中注册
const { instances, getToolInstance } = require('./tools/registry.js');

class SecureMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'secure-mcp-server',
        version: '2.0.2',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.tools = instances;

    this.setupHandlers();
  }

  setupHandlers() {
    // 列出可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: require('./tools/registry').descriptors }));

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const tool = getToolInstance(name);
        if (tool) {
          return await tool.handle(args);
        } else {
          throw new Error(`未知工具: ${name}`);
        }
      } catch (error) {
        // 结构化错误可在此扩展（TODO: ToolError 判断）
        return {
          content: [
            {
              type: 'text',
              text: `错误: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

  }
}

function createServer() {
  return new SecureMCPServer();
}

async function startServer() {
  const server = createServer();
  await server.start();
  return server;
}

// 仅当作为脚本直接执行时启动（程序化使用时可直接 require 并调用 startServer）
if (require.main === module) {
  startServer().catch(console.error);
}

module.exports = { createServer, startServer, SecureMCPServer };