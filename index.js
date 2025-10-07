#!/usr/bin/env node

/**
 * 安全MCP服务器 - Node.js版本 v2.1.0
 * 支持文件操作、文件编辑、文件搜索、文件比较、文件哈希、文件权限、文件压缩、文件监控和命令执行
 * 包含安全限制，禁止操作敏感目录
 */

// 注意：@modelcontextprotocol/sdk 是 ESM-only，需使用动态 import 以兼容 CommonJS
// 我们在启动阶段动态加载并注入依赖，避免 ERR_REQUIRE_ESM

// 重构：集中注册
const { instances, getToolInstance } = require('./tools/registry.js');

class SecureMCPServer {
  constructor({ Server, StdioServerTransport, CallToolRequestSchema, ListToolsRequestSchema }) {
    this.Server = Server;
    this.StdioServerTransport = StdioServerTransport;
    this.CallToolRequestSchema = CallToolRequestSchema;
    this.ListToolsRequestSchema = ListToolsRequestSchema;

    this.server = new Server(
      {
        name: 'ax_local_operations',
        version: '2.1.0',
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
    this.server.setRequestHandler(this.ListToolsRequestSchema, async () => ({ tools: require('./tools/registry').descriptors }));

    // 处理工具调用
    this.server.setRequestHandler(this.CallToolRequestSchema, async (request) => {
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
    const transport = new this.StdioServerTransport();
    await this.server.connect(transport);
  }
}

// 启动服务器（动态加载 ESM 依赖）
(async () => {
  try {
    const [{ Server }, { StdioServerTransport }, { CallToolRequestSchema, ListToolsRequestSchema }] = await Promise.all([
      import('@modelcontextprotocol/sdk/server/index.js'),
      import('@modelcontextprotocol/sdk/server/stdio.js'),
      import('@modelcontextprotocol/sdk/types.js'),
    ]);

    const server = new SecureMCPServer({
      Server,
      StdioServerTransport,
      CallToolRequestSchema,
      ListToolsRequestSchema,
    });
    await server.start();
  } catch (err) {
    console.error('启动失败: ', err);
    process.exitCode = 1;
  }
})();