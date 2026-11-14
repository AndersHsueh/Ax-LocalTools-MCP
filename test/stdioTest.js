#!/usr/bin/env node

/**
 * 真实 MCP stdio 冒烟测试
 *
 * 与 e2eTest.js 的区别：e2e 直接调 lib/dispatcher.js，
 * 这里用官方 SDK 的 Client + StdioClientTransport 启动 index.js，
 * 走完整的 JSON-RPC 握手 → tools/list → tools/call 链路。
 *
 * 这一层会真正触发 SDK 的 zod 响应校验（非法 content.type、缺失/不匹配的
 * structuredContent 都会在这里报错），也是"这个 MCP 确实能跑"的唯一证明。
 *
 * 运行：node test/stdioTest.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SANDBOX = path.join(os.tmpdir(), `axlocalop-stdio-${process.pid}`);
const WS = path.join(SANDBOX, 'workspace');
const DATA_DIR = path.join(SANDBOX, 'data');

fs.rmSync(SANDBOX, { recursive: true, force: true });
fs.mkdirSync(WS, { recursive: true });

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const textOf = r => (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');

async function main() {
  let Client, StdioClientTransport;
  try {
    ({ Client } = await import('@modelcontextprotocol/sdk/client/index.js'));
    ({ StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js'));
  } catch (error) {
    throw new Error(`无法加载 MCP SDK，请先执行 npm install: ${error.message}`);
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(ROOT, 'index.js')],
    env: { ...process.env, AXLOCALOP_DATA_DIR: DATA_DIR, AXLOCALOP_DEFAULT_WORKSPACE: WS },
    stderr: 'pipe'
  });

  let serverStderr = '';
  transport.stderr?.on('data', chunk => { serverStderr += String(chunk); });

  const client = new Client({ name: 'axlocalop-stdio-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    console.log('  ✓ initialize 握手成功（stdio JSON-RPC 通道可用）');

    // ---- tools/list ----
    const { tools } = await client.listTools();
    assert(tools.length > 0, 'tools/list 返回空');
    for (const t of tools) {
      assert(t.name && t.inputSchema, `工具描述符不完整: ${JSON.stringify(t).slice(0, 120)}`);
    }
    const schemaTools = new Set(tools.filter(t => t.outputSchema).map(t => t.name));
    console.log(`  ✓ tools/list 返回 ${tools.length} 个工具，描述符均合法`);

    // ---- tools/call: 写入 → 读回 ----
    const content = 'stdio 写入验证\n第二行\n';
    const writeResult = await client.callTool({
      name: 'file_operation',
      arguments: { operation: 'write', path: 'stdio.txt', content, working_directory: WS }
    });
    assert(!writeResult.isError, `写入被判为错误: ${textOf(writeResult)}`);
    assert(writeResult.content.every(b => b.type === 'text'), '写入结果含非 text 内容块');
    assert(
      fs.readFileSync(path.join(WS, 'stdio.txt'), 'utf8') === content,
      'stdio 调用后磁盘内容与写入内容不一致'
    );
    console.log('  ✓ tools/call 写入落盘，响应通过 SDK zod 校验');

    const readResult = await client.callTool({
      name: 'file_operation',
      arguments: { operation: 'read', path: 'stdio.txt', working_directory: WS }
    });
    assert(!readResult.isError, `读取被判为错误: ${textOf(readResult)}`);
    assert(textOf(readResult).includes('第二行'), '读取结果缺少文件内容');
    console.log('  ✓ tools/call 读回内容一致');

    // ---- 声明了 outputSchema 的工具：structuredContent 必须被 SDK 接受 ----
    const hashResult = await client.callTool({
      name: 'file_hash',
      arguments: { path: 'stdio.txt', algorithm: 'sha256', output_format: 'json', working_directory: WS }
    });
    assert(!hashResult.isError, `哈希被判为错误: ${textOf(hashResult)}`);
    assert(hashResult.structuredContent && typeof hashResult.structuredContent.hash === 'string',
      `outputSchema 工具未返回合规 structuredContent: ${JSON.stringify(hashResult).slice(0, 200)}`);
    console.log('  ✓ outputSchema 工具的 structuredContent 通过 SDK 校验');

    // ---- 覆盖其余输出分支，确保没有残留的非法 content.type ----
    const probes = [
      ['file_compare', { file1: 'stdio.txt', file2: 'stdio.txt', output_format: 'both', working_directory: WS }],
      ['file_search', { search_path: WS, pattern: '第二行', output_format: 'both' }],
      ['file_edit', { operation: 'append_lines', path: 'stdio.txt', content: '第三行', output_format: 'json', working_directory: WS }],
      ['file_permissions', { path: 'stdio.txt', mode: '644', output_format: 'json', working_directory: WS }],
      ['file_watch', { path: '.', duration: 0.02, output_format: 'json', working_directory: WS }],
      ['file_archive', { operation: 'compress', source: 'stdio.txt', destination: 'bundle.tar', format: 'tar', output_format: 'both', working_directory: WS }],
      ['time_tool', { format: 'iso', output_format: 'both' }],
      ['environment_memory', { operation: 'read', output_format: 'both' }],
      ['workspace_manager', { operation: 'status', output_format: 'both' }],
      ['task_manager', { operation: 'list', output_format: 'both' }],
      ['execute_command', { command: 'echo stdio-ok', output_format: 'both', working_directory: WS }],
      // 非 Linux 平台会返回"仅支持Linux"的错误，只验证错误响应本身合规
      ['sudo_config', { action: 'status', output_format: 'json' }, { allowError: true }]
    ];
    for (const [name, args, opts = {}] of probes) {
      const r = await client.callTool({ name, arguments: args });
      // callTool 本身已经过 SDK 的 CallToolResultSchema 校验；这里再确认内容块类型
      assert(r && Array.isArray(r.content), `${name} 未返回 content 数组`);
      assert(r.content.every(b => b.type === 'text'),
        `${name} 返回了非 text 内容块: ${JSON.stringify(r.content.map(b => b.type))}`);
      if (!opts.allowError) {
        assert(!r.isError, `${name} 调用失败: ${textOf(r)}`);
      }
      if (schemaTools.has(name) && !r.isError) {
        assert(r.structuredContent,
          `${name} 声明了 outputSchema 但成功结果缺 structuredContent`);
      }
    }
    console.log(`  ✓ 另外 ${probes.length} 个工具经 stdio 调用，响应全部合法`);

    // 解压回读：验证压缩工具真的产出了可用归档（而不只是返回成功文案）
    fs.mkdirSync(path.join(WS, 'unpacked'), { recursive: true });
    const extractResult = await client.callTool({
      name: 'file_archive',
      arguments: {
        operation: 'extract', source: 'bundle.tar', destination: 'unpacked',
        output_format: 'json', working_directory: WS
      }
    });
    assert(!extractResult.isError, `解压失败: ${textOf(extractResult)}`);
    assert(
      fs.readFileSync(path.join(WS, 'unpacked', 'stdio.txt'), 'utf8').includes('第二行'),
      '解压后的文件内容与压缩前不一致'
    );
    console.log('  ✓ 压缩 → 解压往返，文件内容一致');

    assert(!/启动失败|Error:/.test(serverStderr), `服务端 stderr 有异常输出: ${serverStderr.slice(0, 300)}`);
    console.log('  ✓ 服务端 stdout/stderr 未污染 JSON-RPC 通道');
  } finally {
    await client.close().catch(() => {});
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  }
}

(async () => {
  console.log('='.repeat(70));
  console.log('  真实 MCP stdio 冒烟测试');
  console.log('='.repeat(70));
  const timer = setTimeout(() => {
    console.error('  ✗ 超时（30s），服务器可能未响应 stdio 请求');
    process.exit(1);
  }, 30000);
  try {
    await main();
    clearTimeout(timer);
    console.log('\n通过：客户端可通过 stdio 正常连接并调用全部核心工具');
  } catch (error) {
    clearTimeout(timer);
    console.error(`\n  ✗ ${error.message}`);
    fs.rmSync(SANDBOX, { recursive: true, force: true });
    process.exit(1);
  }
})();
