#!/usr/bin/env node

/**
 * 安全 MCP 服务器
 * 支持文件操作、文件编辑、文件搜索、文件比较、文件哈希、文件权限、文件压缩、文件监控和命令执行
 *
 * 架构说明：
 *   - tools/registry.js 负责工具实例与描述符注册
 *   - lib/dispatcher.js 负责单次工具调用的分发（可独立测试，无需 stdio）
 *   - 本文件只负责 CLI 参数处理与 MCP stdio 传输装配
 */

// 注意：@modelcontextprotocol/sdk 是 ESM-only，需使用动态 import 以兼容 CommonJS
// 我们在启动阶段动态加载并注入依赖，避免 ERR_REQUIRE_ESM

const { instances, getToolInstance } = require('./tools/registry.js');
const { dispatch } = require('./lib/dispatcher.js');
const { version } = require('./package.json');

// 导入工作目录管理器实例
const workspaceManager = instances.workspace_manager;

// 处理命令行参数
if (process.argv.includes('--help')) {
  console.log(`AX Local Operations MCP Server v${version}\n`);
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
  console.log(version);
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
    process.exitCode = 1;
  }
  process.exit();
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
        version,
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

    // 处理工具调用：具体分发逻辑在 lib/dispatcher.js
    this.server.setRequestHandler(this.CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return dispatch(name, args, { getToolInstance, workspaceManager });
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

process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
});
