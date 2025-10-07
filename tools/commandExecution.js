/**
 * 命令执行工具模块
 * 支持安全的本地命令执行
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { evaluate } = require('../lib/commandPolicy');
const { text } = require('../responses');
const { ERR } = require('../errors');

class CommandExecutionTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const { command, working_directory, working_dir, confirm = false, output_format = 'text', stdout_max = 4000, stderr_max = 2000 } = args;
    const cwd = working_directory || working_dir;

    // 检查工作目录是否被允许
    if (cwd && !this.securityValidator.isPathAllowed(cwd)) {
      return text(`错误: 不允许在工作目录 ${cwd} 中执行命令`);
    }

    const policy = evaluate(command);
    if (policy.level === 'deny') {
      throw ERR.DANGEROUS_CMD(command);
    }
    if (policy.level === 'warn' && !confirm) {
      if (output_format === 'json') {
        return { content: [{ type: 'json', json: { status: 'need_confirm', command, policy, message: '高风险命令，需要确认后才能执行', hint: '添加 confirm=true 再次调用' } }] };
      } else if (output_format === 'both') {
        return { content: [
          { type: 'text', text: `警告: 高风险命令，需要确认后才能执行。\n命令: ${command}\n策略: ${policy.reason}\n请加参数 { "confirm": true } 继续。` },
          { type: 'json', json: { status: 'need_confirm', command, policy, message: '高风险命令，需要确认后才能执行', hint: '添加 confirm=true 再次调用' } }
        ]};
      }
      return text(`警告: 高风险命令，需要确认后才能执行。\n命令: ${command}\n策略: ${policy.reason}\n请加参数 { "confirm": true } 继续。`);
    }

    try {
      const options = {};
      if (cwd) options.cwd = cwd;
      const started = Date.now();
      const { stdout, stderr } = await execAsync(command, options);
      const duration_ms = Date.now() - started;

      const trimmedStdout = stdout.length > stdout_max ? stdout.slice(0, stdout_max) + `\n... <truncated ${stdout.length-stdout_max} chars>` : stdout;
      const trimmedStderr = stderr.length > stderr_max ? stderr.slice(0, stderr_max) + `\n... <truncated ${stderr.length-stderr_max} chars>` : stderr;
      const data = { status: 'ok', command, cwd: cwd || null, policy, duration_ms, stdout: trimmedStdout, stderr: trimmedStderr };
      if (output_format === 'json') {
        return { content: [{ type: 'json', json: data }] };
      } else if (output_format === 'both') {
        return { content: [
          { type: 'text', text: `命令执行完成:\n命令: ${command}\n${cwd ? '工作目录: '+cwd+'\n' : ''}耗时: ${duration_ms}ms\nstdout(截断后):\n${trimmedStdout}${trimmedStderr ? `\n--- stderr ---\n${trimmedStderr}`:''}` },
          { type: 'json', json: data }
        ]};
      }
      let result = `命令执行完成:\n命令: ${command}\n`;
      if (cwd) result += `工作目录: ${cwd}\n`;
      result += `耗时: ${duration_ms}ms\n输出:\n${trimmedStdout}`;
      if (trimmedStderr) result += `\n错误输出:\n${trimmedStderr}`;
      return text(result);

    } catch (error) {
      const failure = { status: 'error', command, cwd: cwd || null, error: error.message };
      if (output_format === 'json') {
        return { content: [{ type: 'json', json: failure }] };
      } else if (output_format === 'both') {
        return { content: [
          { type: 'text', text: `命令执行失败:\n命令: ${command}\n错误: ${error.message}` },
          { type: 'json', json: failure }
        ]};
      }
      return text(`命令执行失败:\n命令: ${command}\n错误: ${error.message}`);
    }
  }
}

module.exports = CommandExecutionTool;
