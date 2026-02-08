#!/usr/bin/env node

/**
 * 安全MCP服务器 - Node.js版本 v2.6.0
 * 支持文件操作、文件编辑、文件搜索、文件比较、文件哈希、文件权限、文件压缩、文件监控和命令执行
 * 包含安全限制，禁止操作敏感目录
 */

// 注意：@modelcontextprotocol/sdk 是 ESM-only，需使用动态 import 以兼容 CommonJS
// 我们在启动阶段动态加载并注入依赖，避免 ERR_REQUIRE_ESM

// 重构：集中注册
const { instances, getToolInstance } = require('./tools/registry.js');

// 导入工作目录管理器
const workspaceManager = require('./tools/workspaceManager.js');

// 处理命令行参数
if (process.argv.includes('--help')) {
  console.log(`AX Local Operations MCP Server v2.6.0\n`);
  console.log(`Usage: ax-local-operations-mcp [options]\n`);
  console.log(`Options:`);
  console.log(`  --help           显示本帮助信息`);
  console.log(`  --version        显示版本号`);
  console.log(`  --default-dir    设置默认工作目录\n`);
  console.log(`示例 (作为 MCP Server 被客户端通过 stdio 连接):`);
  console.log(`  npx -y ax-local-operations-mcp@file:/path/to/project`);
  console.log(`  ax-local-operations-mcp --default-dir 'c:/user/a/note1'\n`);
  process.exit(0);
}

if (process.argv.includes('--version')) {
  console.log('2.6.0');
  process.exit(0);
}

// 处理--default-dir参数
const defaultDirIndex = process.argv.indexOf('--default-dir');
if (defaultDirIndex !== -1 && defaultDirIndex + 1 < process.argv.length) {
  const defaultDir = process.argv[defaultDirIndex + 1];
  if (workspaceManager.setDefaultWorkspace(defaultDir)) {
    console.log(`默认工作目录已设置为: ${defaultDir}`);
  } else {
    console.error(`设置默认工作目录失败: ${defaultDir}`);
  }
  process.exit(0);
}

class SecureMCPServer {
  constructor({ Server, StdioServerTransport, CallToolRequestSchema, ListToolsRequestSchema }) {
    this.Server = Server;
    this.StdioServerTransport = StdioServerTransport;
    this.CallToolRequestSchema = CallToolRequestSchema;
    this.ListToolsRequestSchema = ListToolsRequestSchema;

    this.server = new Server(
      {
        name: 'ax_local_operations',
        version: '2.6.0',
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
        // 检查所有参数值中是否包含工作目录设置命令
        let workspacePath = null;
        
        // 递归检查参数对象中的所有字符串值
        function checkForWorkspaceCommand(obj) {
          if (typeof obj === 'string') {
            const parsedPath = workspaceManager.parseWorkspaceCommand(obj);
            if (parsedPath) {
              workspacePath = parsedPath;
            }
          } else if (typeof obj === 'object' && obj !== null) {
            for (const key in obj) {
              checkForWorkspaceCommand(obj[key]);
              if (workspacePath) break;
            }
          }
        }
        
        checkForWorkspaceCommand(args);
        
        // 如果找到工作目录命令，处理它并返回响应
        if (workspacePath) {
          if (workspaceManager.setTempWorkspace(workspacePath)) {
            return {
              content: [
                {
                  type: 'text',
                  text: `已设置临时工作目录为: ${workspacePath}`
                }
              ]
            };
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: `设置工作目录失败: ${workspacePath}`
                }
              ],
              isError: true
            };
          }
        }

        // 为工具调用添加工作目录参数（如果未提供）
        const toolArgs = { ...args };
        if (!toolArgs.working_directory && !toolArgs.working_dir) {
          const currentWorkspace = workspaceManager.getCurrentWorkspace();
          toolArgs.working_directory = currentWorkspace;
        }

        const tool = getToolInstance(name);
        if (tool) {
          return await tool.handle(toolArgs);
        } else {
          throw new Error(`未知工具: ${name}`);
        }
      } catch (error) {
        // 结构化错误响应，添加 isError 标记（MCP 规范）
        // 确保即使工具抛出错误也返回符合输出模式的结构化内容
        const errorResponse = {
          status: 'error',
          error: error.message,
          name: name
        };

        return {
          content: [
            {
              type: 'text',
              text: error.message
            },
            {
              type: 'json',
              json: errorResponse
            }
          ],
          isError: true
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