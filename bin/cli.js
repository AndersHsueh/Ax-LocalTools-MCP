#!/usr/bin/env node
// CLI entry for local-file-operation-mcp with --help / --version support.
const pkg = require('../package.json');
const { startServer } = require('../index.js');

function printHelp() {
	console.log(`Usage: local-file-operation-mcp [options]\n\n` +
		`Options:\n` +
		`  --help        显示本帮助信息\n` +
		`  --version     显示版本号\n` +
		`\n示例 (作为 MCP Server 被客户端通过 stdio 连接)：\n` +
		`  npx local-file-operation-mcp\n` +
		`  local-file-operation-mcp\n`);
}

if (process.argv.includes('--help')) {
	printHelp();
	process.exit(0);
}

if (process.argv.includes('--version')) {
	console.log(pkg.version);
	process.exit(0);
}

// Start server
startServer().catch(err => {
	console.error('启动失败:', err);
	process.exit(1);
});
