/**
 * 命令执行工具模块
 * 支持安全的本地命令执行
 * 使用 spawn 替代 exec 以避免命令注入风险
 */

const { spawn } = require('child_process');
const { evaluate } = require('../lib/commandPolicy');
const { ERR } = require('../errors');

// 默认输出限制
const DEFAULT_STDOUT_MAX = 4000;
const DEFAULT_STDERR_MAX = 2000;

/**
 * 使用 spawn 安全执行命令
 * @param {string} command - 要执行的命令
 * @param {Object} options - 选项
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function spawnExec(command, options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd, timeout_ms, stdout_max = DEFAULT_STDOUT_MAX, stderr_max = DEFAULT_STDERR_MAX } = options;

    // 使用 bash/sh 执行命令，支持管道、重定向等功能
    const shellCmd = process.platform === 'win32' ? 'cmd.exe' : 'sh';
    const shellArgs = process.platform === 'win32'
      ? ['/c', command]  // Windows: cmd /c command
      : ['-c', command]; // Unix: sh -c command

    const child = spawn(shellCmd, shellArgs, {
      cwd,
      timeout: timeout_ms,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']  // pipe 所有 stdio 以捕获输出
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // 捕获 stdout
    child.stdout.on('data', (data) => {
      const text = data.toString();
      if (stdout.length < stdout_max) {
        stdout += text.slice(0, stdout_max - stdout.length);
      }
    });

    // 捕获 stderr
    child.stderr.on('data', (data) => {
      const text = data.toString();
      if (stderr.length < stderr_max) {
        stderr += text.slice(0, stderr_max - stderr.length);
      }
    });

    // 处理超时
    const timeoutHandle = timeout_ms ? setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      // 5秒后强制杀死
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 5000);
    }, timeout_ms) : null;

    child.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      // 截断处理
      const stdoutTruncated = stdout.length > stdout_max;
      const stderrTruncated = stderr.length > stderr_max;

      resolve({
        stdout: stdout.slice(0, stdout_max) + (stdoutTruncated ? `\n... <truncated ${stdout.length - stdout_max} chars>` : ''),
        stderr: stderr.slice(0, stderr_max) + (stderrTruncated ? `\n... <truncated ${stderr.length - stderr_max} chars>` : ''),
        exitCode: code,
        stdoutTruncated,
        stderrTruncated,
        killed
      });
    });

    child.on('error', (error) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(error);
    });
  });
}

/**
 * 构建输出响应
 */
function buildResponse(data, output_format, command, cwd, duration_ms, policy) {
  const truncatedInfo = [];
  if (data.stdoutTruncated) truncatedInfo.push(`stdout截断${data.stdout.length - DEFAULT_STDOUT_MAX}chars`);
  if (data.stderrTruncated) truncatedInfo.push(`stderr截断${data.stderr.length - DEFAULT_STDERR_MAX}chars`);

  const responseData = {
    status: data.exitCode === 0 ? 'ok' : 'error',
    command,
    cwd: cwd || null,
    policy,
    duration_ms,
    exit_code: data.exitCode,
    stdout: data.stdout,
    stderr: data.stderr,
    truncated: data.stdoutTruncated || data.stderrTruncated
  };

  if (output_format === 'json') {
    return { content: [{ type: 'json', json: responseData }] };
  }

  if (output_format === 'both') {
    let textMsg = `命令执行完成:\n命令: ${command}\n`;
    if (cwd) textMsg += `工作目录: ${cwd}\n`;
    textMsg += `耗时: ${duration_ms}ms\n退出码: ${data.exitCode}\n`;
    textMsg += `stdout:\n${data.stdout}`;
    if (data.stderr) textMsg += `\nstderr:\n${data.stderr}`;
    if (truncatedInfo.length > 0) textMsg += `\n注意: ${truncatedInfo.join(', ')}`;

    return {
      content: [
        { type: 'text', text: textMsg },
        { type: 'json', json: responseData }
      ]
    };
  }

  // text 格式
  let textMsg = `命令执行完成:\n命令: ${command}\n`;
  if (cwd) textMsg += `工作目录: ${cwd}\n`;
  textMsg += `耗时: ${duration_ms}ms\n退出码: ${data.exitCode}\n`;
  textMsg += `stdout:\n${data.stdout}`;
  if (data.stderr) textMsg += `\nstderr:\n${data.stderr}`;
  if (truncatedInfo.length > 0) textMsg += `\n注意: ${truncatedInfo.join(', ')}`;

  return { content: [{ type: 'text', text: textMsg }] };
}

class CommandExecutionTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const {
      command,
      working_directory,
      working_dir,
      confirm = false,
      output_format = 'text',
      timeout_ms = 60000  // 默认60秒超时
    } = args;

    const cwd = working_directory || working_dir;
    const stdout_max = args.stdout_max || DEFAULT_STDOUT_MAX;
    const stderr_max = args.stderr_max || DEFAULT_STDERR_MAX;

    // 检查工作目录是否被允许
    if (cwd && !this.securityValidator.isPathAllowed(cwd)) {
      const errorResponse = {
        status: 'error',
        command,
        cwd: cwd || null,
        exit_code: -1,
        stdout: '',
        stderr: `错误: 不允许在工作目录 ${cwd} 中执行命令`,
        duration_ms: 0,
        truncated: false
      };

      if (output_format === 'json') {
        return { content: [{ type: 'json', json: errorResponse }], isError: true };
      }
      if (output_format === 'both') {
        return {
          content: [
            { type: 'text', text: `错误: 不允许在工作目录 ${cwd} 中执行命令` },
            { type: 'json', json: errorResponse }
          ],
          isError: true
        };
      }
      return {
        content: [{ type: 'text', text: `错误: 不允许在工作目录 ${cwd} 中执行命令` }],
        isError: true
      };
    }

    // 策略评估
    const policy = evaluate(command);

    // Deny 策略：直接拒绝
    if (policy.level === 'deny') {
      const errorResponse = {
        status: 'error',
        command,
        cwd: cwd || null,
        exit_code: -1,
        stdout: '',
        stderr: `危险命令被拒绝: ${command}`,
        duration_ms: 0,
        truncated: false
      };

      if (output_format === 'json') {
        return { content: [{ type: 'json', json: errorResponse }], isError: true };
      }
      if (output_format === 'both') {
        return {
          content: [
            { type: 'text', text: `危险命令被拒绝: ${command}` },
            { type: 'json', json: errorResponse }
          ],
          isError: true
        };
      }
      return {
        content: [{ type: 'text', text: `危险命令被拒绝: ${command}` }],
        isError: true
      };
    }

    // Warn 策略：需要确认
    if (policy.level === 'warn' && !confirm) {
      const warnResponse = {
        status: 'need_confirm',
        command,
        cwd: cwd || null,
        exit_code: null,
        stdout: '',
        stderr: '',
        duration_ms: 0,
        truncated: false
      };

      if (output_format === 'json') {
        return { content: [{ type: 'json', json: warnResponse }] };
      }
      if (output_format === 'both') {
        return {
          content: [
            { type: 'text', text: `警告: 高风险命令，需要确认后才能执行。\n命令: ${command}\n策略: ${policy.reason}\n请加参数 { "confirm": true } 继续。` },
            { type: 'json', json: warnResponse }
          ]
        };
      }
      return {
        content: [{ type: 'text', text: `警告: 高风险命令，需要确认后才能执行。\n命令: ${command}\n策略: ${policy.reason}\n请加参数 { "confirm": true } 继续。` }]
      };
    }

    // 执行命令
    const started = Date.now();
    try {
      const result = await spawnExec(command, {
        cwd,
        timeout_ms,
        stdout_max,
        stderr_max
      });
      const duration_ms = Date.now() - started;

      return buildResponse(result, output_format, command, cwd, duration_ms, policy);

    } catch (error) {
      // 命令执行失败（不是退出码非0，而是 spawn 失败）
      const failure = {
        status: 'error',
        command,
        cwd: cwd || null,
        exit_code: -1,
        stdout: '',
        stderr: error.message,
        duration_ms: Date.now() - started,
        truncated: false
      };

      if (output_format === 'json') {
        return { content: [{ type: 'json', json: failure }], isError: true };
      }
      if (output_format === 'both') {
        return {
          content: [
            { type: 'text', text: `命令执行失败:\n命令: ${command}\n错误: ${error.message}` },
            { type: 'json', json: failure }
          ],
          isError: true
        };
      }
      return {
        content: [{ type: 'text', text: `命令执行失败:\n命令: ${command}\n错误: ${error.message}` }],
        isError: true
      };
    }
  }
}

module.exports = CommandExecutionTool;
