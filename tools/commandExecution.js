/**
 * 命令执行工具模块
 * 支持安全的本地命令执行
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class CommandExecutionTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const { command, working_directory } = args;

    // 检查工作目录是否被允许
    if (working_directory && !this.securityValidator.isPathAllowed(working_directory)) {
      return {
        content: [
          {
            type: 'text',
            text: `错误: 不允许在工作目录 ${working_directory} 中执行命令`
          }
        ]
      };
    }

    // 检查命令是否包含危险操作
    const dangerousCommands = ['rm -rf', 'sudo', 'su', 'chmod 777', 'chown', 'passwd'];
    if (dangerousCommands.some(dangerous => command.includes(dangerous))) {
      return {
        content: [
          {
            type: 'text',
            text: `错误: 不允许执行危险命令: ${command}`
          }
        ]
      };
    }

    try {
      const options = {};
      if (working_directory) {
        options.cwd = working_directory;
      }

      const { stdout, stderr } = await execAsync(command, options);
      
      let result = `命令执行完成:\n命令: ${command}\n`;
      if (working_directory) {
        result += `工作目录: ${working_directory}\n`;
      }
      result += `\n输出:\n${stdout}`;
      
      if (stderr) {
        result += `\n错误输出:\n${stderr}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `命令执行失败:\n命令: ${command}\n错误: ${error.message}`
          }
        ]
      };
    }
  }
}

module.exports = CommandExecutionTool;
