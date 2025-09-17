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
      `/Users/${process.env.USER || 'unknown'}`,
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
  }

  isPathAllowed(filePath) {
    try {
      // 转换为绝对路径
      const absPath = path.resolve(filePath);
      
      // 允许临时目录和当前项目目录
      if (absPath.startsWith('/tmp') || absPath.startsWith('/var/folders')) {
        return true;
      }
      
      // 允许当前项目目录
      const currentDir = path.resolve(__dirname, '..');
      if (absPath.startsWith(currentDir)) {
        return true;
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
