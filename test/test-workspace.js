#!/usr/bin/env node

/**
 * 工作目录管理单元测试
 *
 * 历史说明：旧版这里有一条测试 parseWorkspaceCommand（在任意参数里写
 * "当前工作目录是：xxx" 即可切换工作区）。该拦截器会吞掉整个工具调用，
 * 已被移除；参数值现在一律按数据处理。同时旧版用同步 runner 跑 async 用例，
 * 断言失败会被 Promise 吞掉形成"假绿"，这里一并修正。
 *
 * 运行：node test/test-workspace.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

// 在 require 业务模块之前隔离数据目录，避免污染真实 ~/.local_file_operations
const SANDBOX = path.join(os.tmpdir(), `axlocalop-ws-test-${process.pid}`);
process.env.AXLOCALOP_DATA_DIR = path.join(SANDBOX, 'data');
fs.mkdirSync(SANDBOX, { recursive: true });

const WorkspaceManager = require('../tools/workspaceManager');
const EnvironmentMemoryTool = require('../tools/environmentMemory');

class MockSecurityValidator {
  isPathAllowed() { return true; }
  resolveAndAssert(p) { return p; }
}

const results = [];
async function runTest(name, fn) {
  try {
    await fn(); // 必须 await：async 用例的断言失败才能被捕获
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`✗ ${name}`);
    console.log(`      ${String(error.message).replace(/\n/g, '\n      ')}`);
  }
}

(async () => {
  console.log('='.repeat(60));
  console.log('  工作目录管理单元测试');
  console.log('='.repeat(60));

  const wm = new WorkspaceManager(new MockSecurityValidator());
  const w1 = path.join(SANDBOX, 'ws1');
  const w2 = path.join(SANDBOX, 'ws2');

  await runTest('魔法字符串拦截器已移除，参数不再被当作指令', () => {
    assert.strictEqual(typeof wm.parseWorkspaceCommand, 'undefined',
      'parseWorkspaceCommand 仍存在，会吞掉工具调用');
  });

  await runTest('validateWorkspace 默认不创建目录，create:true 才创建', () => {
    assert.strictEqual(wm.validateWorkspace(w1), false, '目录不存在时不应通过');
    assert.strictEqual(wm.validateWorkspace(w1, { create: true }), true);
    assert.strictEqual(fs.existsSync(w1), true, 'create:true 应创建目录');
  });

  await runTest('设置临时工作目录后可正确读回', () => {
    assert.strictEqual(wm.setTempWorkspace(w2), true);
    assert.strictEqual(wm.getCurrentWorkspace(), path.resolve(w2));
  });

  await runTest('清除临时目录后回到非隐藏的默认工作区', () => {
    wm.clearTempWorkspace();
    const current = wm.getCurrentWorkspace();
    assert.strictEqual(current, EnvironmentMemoryTool.defaultWorkspacePath(),
      '默认工作区应与 environmentMemory 的定义一致');
    const parts = path.resolve(current).split(path.sep).slice(1);
    assert(!parts.some(p => p && p.startsWith('.')),
      `默认工作区含隐藏目录组件: ${current}`);
  });

  await runTest('getStatus 结构完整', () => {
    const status = wm.getStatus();
    assert(status.defaultWorkspace && status.currentWorkspace, '缺少工作区字段');
    assert.strictEqual(status.tempWorkspace, null);
  });

  await runTest('handle(get_current) 返回合法 MCP 输出', async () => {
    const r = await wm.handle({ operation: 'get_current', output_format: 'json' });
    assert(r.content.every(b => b.type === 'text'), '不应出现非 text 内容块');
    assert(r.structuredContent && r.structuredContent.current_workspace,
      '缺少 structuredContent.current_workspace');
  });

  await runTest('handle(set_temp) 成功时返回成功文本与结构化数据', async () => {
    const r = await wm.handle({ operation: 'set_temp', workspace_path: w2, output_format: 'text' });
    assert(r.content[0].text.includes('成功设置临时工作目录'), '缺少成功提示');
    assert.strictEqual(r.structuredContent.workspace_path, path.resolve(w2));
    assert.strictEqual(wm.getCurrentWorkspace(), path.resolve(w2));
  });

  fs.rmSync(SANDBOX, { recursive: true, force: true });

  const passed = results.filter(r => r.ok).length;
  console.log('\n' + '-'.repeat(60));
  console.log(`通过 ${passed}/${results.length}`);
  process.exit(passed === results.length ? 0 : 1);
})();
