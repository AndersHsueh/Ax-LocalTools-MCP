/**
 * 安全验证模块
 * Agent 全控授权模式：
 * - 支持任意绝对路径（不限于 home 目录）
 * - 拒绝以 . 开头的隐藏目录组件（dotfile 本身允许，如 .env/.gitignore）
 * - 提供了工作目录时，验证路径在其范围内
 * - 解析符号链接后再比较，避免用软链逃出工作目录
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { resolveUserPath } = require('../lib/pathUtils');
const { ERR } = require('../errors');

// 检查路径的目录部分是否含隐藏段（如 /home/user/.secret/file）
// 入参可以是相对路径：只要"目录部分"里有以 . 开头的段就拒绝，
// 最后一段（文件名本身，如 .env）允许。
function containsHiddenDirectory(p) {
  const parts = p.split(path.sep);
  return parts.slice(0, -1).some(
    s => s && s.startsWith('.') && s !== '.' && s !== '..'
  );
}

// 展开 ~ / ~/... 为用户家目录；resolveUserPath 本身不处理波浪号
function expandHome(p) {
  if (typeof p !== 'string') return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

// 取真实路径；目标不存在时，取最近存在祖先的真实路径再拼回剩余部分。
// 这样对"准备新建的文件"也能正确处理软链接。
function realpathLoose(target) {
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(target) : fs.realpathSync(target);
  } catch {
    const parent = path.dirname(target);
    if (parent === target) return target;
    const realParent = realpathLoose(parent);
    return path.join(realParent, path.basename(target));
  }
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
      // 工作目录是"相对路径的解析基准 + 作用域"，不是绝对路径的沙箱。
      // dispatch 层会给每次调用自动注入默认工作区；若连显式绝对路径都强制
      // 落在该目录内，注释里承诺的"支持任意绝对路径"就永远不会生效
      // （表现为用户传一个绝对路径却被 E_PATH_DENIED）。
      const expanded = expandHome(filePath);
      const isExplicitAbsolute = typeof expanded === 'string' && path.isAbsolute(expanded);

      let resolved = path.resolve(resolveUserPath(expanded, {
        workingDir: isExplicitAbsolute ? undefined : (workingDirectory || undefined)
      }));
      resolved = realpathLoose(resolved);

      if (workingDirectory && !isExplicitAbsolute) {
        const wd = realpathLoose(path.resolve(workingDirectory));

        const inScope = norm(resolved) === norm(wd) || norm(resolved).startsWith(norm(wd) + path.sep);
        if (!inScope) return null;

        // 隐藏目录只检查工作目录之下的相对部分：
        // 工作目录本身是调用方显式指定的，不应因为路径里有 .xxx 就整体拒绝
        const rel = path.relative(wd, resolved);
        if (containsHiddenDirectory(rel)) return null;
      } else if (containsHiddenDirectory(resolved)) {
        return null;
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
}

module.exports = SecurityValidator;
