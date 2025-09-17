/**
 * 安全验证模块
 * 提供路径和命令的安全检查功能
 */

const path = require('path');

class SecurityValidator {
  constructor() {
    // 禁止操作的目录列表
    this.FORBIDDEN_PATHS = [
      '/',
      '/etc',
      '/bin',
      '/usr/bin',
      '/sbin',
      '/usr/sbin',
      '/System',
      '/Applications',
      '/Library',
      '/private',
    ];
    
    // 允许的项目目录模式
    this.ALLOWED_PROJECT_PATTERNS = [
      '/isoftstone/',
      '/Desktop/',
      '/Documents/',
      '/Downloads/',
      '/Projects/',
      '/Workspace/',
      '/Code/',
      '/Development/',
      '/Work/',
      '/Study/',
      '/Research/'
    ];
  }

  isPathAllowed(filePath, workingDirectory = null) {
    try {
      // 如果有工作目录，先解析相对于工作目录的路径
      let absPath;
      if (workingDirectory && !path.isAbsolute(filePath)) {
        // 相对路径 + 工作目录 = 绝对路径
        absPath = path.resolve(workingDirectory, filePath);
      } else {
        // 直接解析为绝对路径
        absPath = path.resolve(filePath);
      }
      
      // 允许临时目录和当前项目目录
      if (absPath.startsWith('/tmp') || absPath.startsWith('/var/folders')) {
        return true;
      }
      
      // 允许当前项目目录
      const currentDir = path.resolve(__dirname, '..');
      if (absPath.startsWith(currentDir)) {
        return true;
      }
      
      // 如果指定了工作目录，检查是否在工作目录范围内
      if (workingDirectory) {
        const absWorkingDir = path.resolve(workingDirectory);
        if (absPath.startsWith(absWorkingDir)) {
          return true;
        }
      }
      
      // 智能检测：如果路径包含允许的项目目录结构，允许访问
      // 这样可以处理大模型直接使用绝对路径的情况
      for (const pattern of this.ALLOWED_PROJECT_PATTERNS) {
        if (absPath.includes(pattern)) {
          return true;
        }
      }
      
      // 检查是否在禁止的路径中
      for (const forbidden of this.FORBIDDEN_PATHS) {
        if (absPath.startsWith(forbidden)) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  isDangerousCommand(command) {
    const dangerousCommands = [
      'rm -rf',
      'sudo',
      'su',
      'chmod 777',
      'chown',
      'passwd',
      'format',
      'del',
      'format c:',
      'shutdown',
      'reboot',
      'halt',
      'init 0',
      'init 6'
    ];
    
    return dangerousCommands.some(dangerous => 
      command.toLowerCase().includes(dangerous.toLowerCase())
    );
  }
}

module.exports = SecurityValidator;
