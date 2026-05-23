/**
 * 命令执行工具模块
 * Windows 默认使用 PowerShell（优先 pwsh，fallback powershell）
 */

const { spawn, execFile } = require('child_process');
const { evaluate } = require('../lib/commandPolicy');
const { ERR } = require('../errors');

const DEFAULT_STDOUT_MAX = 4000;
const DEFAULT_STDERR_MAX = 2000;

// 检测 Windows 上可用的 PowerShell，结果缓存
let _winShellCache = null;
async function resolveWindowsShell() {
  if (_winShellCache) return _winShellCache;
  return new Promise((resolve) => {
    execFile('pwsh', ['-NoProfile', '-Command', 'exit 0'], { timeout: 3000 }, (err) => {
      _winShellCache = err ? 'powershell' : 'pwsh';
      resolve(_winShellCache);
    });
  });
}

async function spawnExec(command, { cwd, timeout_ms, stdout_max = DEFAULT_STDOUT_MAX, stderr_max = DEFAULT_STDERR_MAX } = {}) {
  let shellCmd, shellArgs;
  if (process.platform === 'win32') {
    shellCmd = await resolveWindowsShell();
    shellArgs = ['-NonInteractive', '-NoProfile', '-Command', command];
  } else {
    shellCmd = 'sh';
    shellArgs = ['-c', command];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(shellCmd, shellArgs, { cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', killed = false, stdoutTruncated = false, stderrTruncated = false;

    function accumulate(buf, text, max) {
      if (buf.length >= max) return [buf, true];
      const chunk = text.slice(0, max - buf.length);
      return [buf + chunk, buf.length + chunk.length >= max && text.length > chunk.length];
    }

    child.stdout.on('data', d => { [stdout, stdoutTruncated] = accumulate(stdout, d.toString(), stdout_max); });
    child.stderr.on('data', d => { [stderr, stderrTruncated] = accumulate(stderr, d.toString(), stderr_max); });

    const timeoutHandle = timeout_ms ? setTimeout(() => { killed = true; child.kill(); }, timeout_ms) : null;
    child.on('close', (code) => { clearTimeout(timeoutHandle); resolve({ stdout, stderr, exitCode: code, stdoutTruncated, stderrTruncated, killed }); });
    child.on('error', (err) => { clearTimeout(timeoutHandle); reject(err); });
  });
}

function makeErrorPayload(command, cwd, msg, extra = {}) {
  return { status: 'error', command, cwd: cwd || null, exit_code: -1, stdout: '', stderr: msg, duration_ms: 0, truncated: false, ...extra };
}

function buildResponse(data, fmt, command, cwd, duration_ms, policy) {
  const truncatedParts = [data.stdoutTruncated && 'stdout已截断', data.stderrTruncated && 'stderr已截断'].filter(Boolean);
  const payload = {
    status: data.exitCode === 0 ? 'ok' : 'error',
    command, cwd: cwd || null, policy, duration_ms,
    exit_code: data.exitCode, stdout: data.stdout, stderr: data.stderr,
    truncated: data.stdoutTruncated || data.stderrTruncated, killed: data.killed || false
  };

  if (fmt === 'json') return { content: [{ type: 'text', text: JSON.stringify(payload) }] };

  let text = `命令执行完成:\n命令: ${command}\n`;
  if (cwd) text += `工作目录: ${cwd}\n`;
  text += `耗时: ${duration_ms}ms\n退出码: ${data.exitCode}\n`;
  if (data.killed) text += `[超时强制终止]\n`;
  text += `stdout:\n${data.stdout}`;
  if (data.stderr) text += `\nstderr:\n${data.stderr}`;
  if (truncatedParts.length) text += `\n注意: ${truncatedParts.join(', ')}`;

  if (fmt === 'both') return { content: [{ type: 'text', text }, { type: 'text', text: JSON.stringify(payload) }] };
  return { content: [{ type: 'text', text }] };
}

function fmtResponse(fmt, text, data, isError = false) {
  const r = fmt === 'json'
    ? { content: [{ type: 'text', text: JSON.stringify(data) }] }
    : fmt === 'both'
      ? { content: [{ type: 'text', text }, { type: 'text', text: JSON.stringify(data) }] }
      : { content: [{ type: 'text', text }] };
  if (isError) r.isError = true;
  return r;
}

class CommandExecutionTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const {
      command, working_directory, working_dir,
      confirm = false, output_format: fmt = 'text',
      timeout_ms = 60000,
      stdout_max = DEFAULT_STDOUT_MAX,
      stderr_max = DEFAULT_STDERR_MAX
    } = args;

    const cwd = working_directory || working_dir;
    if (!command) throw ERR.INVALID_ARGS('缺少 command 参数');

    const policy = await evaluate(command, { allowSudo: true });

    if (policy.level === 'deny') {
      const msg = `危险命令被拒绝: ${command}\n原因: ${policy.reason}`;
      return fmtResponse(fmt, msg, makeErrorPayload(command, cwd, msg), true);
    }

    if (policy.level === 'warn' && !confirm) {
      const msg = `警告: 高风险命令，需要确认。\n命令: ${command}\n策略: ${policy.reason}\n请加参数 { "confirm": true } 继续。`;
      return fmtResponse(fmt, msg, { status: 'need_confirm', command, cwd: cwd || null, exit_code: null, stdout: '', stderr: '', duration_ms: 0, truncated: false });
    }

    const started = Date.now();
    try {
      const result = await spawnExec(command, { cwd, timeout_ms, stdout_max, stderr_max });
      return buildResponse(result, fmt, command, cwd, Date.now() - started, policy);
    } catch (error) {
      const msg = `命令执行失败:\n命令: ${command}\n错误: ${error.message}`;
      return fmtResponse(fmt, msg, makeErrorPayload(command, cwd, error.message, { duration_ms: Date.now() - started }), true);
    }
  }
}

module.exports = CommandExecutionTool;
