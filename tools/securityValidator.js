/**
 * 安全验证模块
 * Agent 全控授权模式：
 * - 支持任意绝对路径（不限于 home 目录）
 * - 拒绝以 . 开头的隐藏目录组件（dotfile 本身允许，如 .env/.gitignore）
 * - 提供了工作目录时，验证路径在其范围内
 */

const path = require('path');
const os = require('os');
const { resolveUserPath } = require('../lib/pathUtils');
const { ERR } = require('../errors');

// 检查路径的目录部分是否含隐藏段（如 /home/user/.secret/file）
function containsHiddenDirectory(absPath) {
  const parts = absPath.split(path.sep);
  return parts.slice(0, -1).some(
    p => p && p.startsWith('.') && p !== '.' && p !== '..'
  );
}

// 规范化路径用于比较（Windows 忽略大小写）
const norm = process.platform === 'win32'
  ? p => p.toLowerCase()
  : p => p;

class SecurityValidator {
  constructor() {
    this.userHome = os.homedir();
  }

  // 返回已解析的绝对路径，或在不允许时返回 null
  _resolve(filePath, workingDirectory) {
    try {
      const resolved = path.resolve(resolveUserPath(filePath, { workingDir: workingDirectory || undefined }));
      if (containsHiddenDirectory(resolved)) return null;
      if (workingDirectory) {
        const wd = path.resolve(workingDirectory);
        if (norm(resolved) !== norm(wd) && !norm(resolved).startsWith(norm(wd) + path.sep)) return null;
      }
      return resolved;
    } catch {
      return null;
    }
  }

  isPathAllowed(filePath, workingDirectory = null) {
    return this._resolve(filePath, workingDirectory) !== null;
  }

  resolveAndAssert(filePath, workingDirectory = null) {
    const resolved = this._resolve(filePath, workingDirectory);
    if (!resolved) throw ERR.PATH_DENIED(filePath);
    return resolved;
  }

  /** @deprecated 请使用 commandPolicy.evaluate() */
  isDangerousCommand(command) {
    return ['rm -rf', 'sudo', 'su', 'chmod 777', 'chown', 'passwd']
      .some(t => command.toLowerCase().includes(t));
  }
}

module.exports = SecurityValidator;
