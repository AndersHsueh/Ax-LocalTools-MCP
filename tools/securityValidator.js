/**
 * 安全验证模块
 * 提供路径和命令的安全检查功能
 */

const path = require('path');
const os = require('os');
const { resolveUserPath, assertInHome } = require('../lib/pathUtils');
const { ERR } = require('../errors');

class SecurityValidator {
  constructor() {
    this.userHome = os.homedir();
  }

  isPathAllowed(filePath, workingDirectory = null) {
    try {
      const abs = resolveUserPath(filePath, { workingDir: workingDirectory });
      assertInHome(abs);
      return true;
    } catch (e) {
      return false;
    }
  }

  resolveAndAssert(filePath, workingDirectory = null) {
    const abs = resolveUserPath(filePath, { workingDir: workingDirectory });
    try {
      return assertInHome(abs);
    } catch (e) {
      throw ERR.PATH_DENIED(filePath);
    }
  }

  isDangerousCommand(command) {
    // 兼容旧接口（将被 commandPolicy 取代）
    const legacy = ['rm -rf', 'sudo', 'su', 'chmod 777', 'chown', 'passwd'];
    return legacy.some(t => command.toLowerCase().includes(t));
  }
}

module.exports = SecurityValidator;
