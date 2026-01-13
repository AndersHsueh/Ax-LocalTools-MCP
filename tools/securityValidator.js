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
      // 如果提供了工作目录，验证文件路径是否在工作目录内
      if (workingDirectory) {
        const abs = resolveUserPath(filePath, { workingDir: workingDirectory });
        // 验证路径是否在指定的工作目录内
        const resolvedWorkingDir = path.resolve(workingDirectory);
        const absPath = path.resolve(abs);
        if (!absPath.startsWith(resolvedWorkingDir + path.sep) && absPath !== resolvedWorkingDir) {
          return false;
        }
        return true;
      } else {
        // 如果没有提供工作目录，则检查路径是否在用户家目录内
        const abs = resolveUserPath(filePath);
        assertInHome(abs);
        return true;
      }
    } catch (e) {
      return false;
    }
  }

  resolveAndAssert(filePath, workingDirectory = null) {
    // 如果提供了工作目录，验证文件路径是否在工作目录内
    if (workingDirectory) {
      const abs = resolveUserPath(filePath, { workingDir: workingDirectory });
      const resolvedWorkingDir = path.resolve(workingDirectory);
      const absPath = path.resolve(abs);
      if (!absPath.startsWith(resolvedWorkingDir + path.sep) && absPath !== resolvedWorkingDir) {
        throw ERR.PATH_DENIED(filePath);
      }
      return abs;
    } else {
      // 如果没有提供工作目录，则使用家目录限制
      const abs = resolveUserPath(filePath);
      try {
        return assertInHome(abs);
      } catch (e) {
        throw ERR.PATH_DENIED(filePath);
      }
    }
  }

  isDangerousCommand(command) {
    // 兼容旧接口（将被 commandPolicy 取代）
    const legacy = ['rm -rf', 'sudo', 'su', 'chmod 777', 'chown', 'passwd'];
    return legacy.some(t => command.toLowerCase().includes(t));
  }
}

module.exports = SecurityValidator;
