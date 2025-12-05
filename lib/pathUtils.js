const path = require('path');
const os = require('os');
const fs = require('fs');
const platformUtils = require('./platformUtils');

/**
 * 跨平台路径处理工具
 * 支持Windows UNC路径、长路径、符号链接等复杂场景
 */

/**
 * 解析用户路径，支持跨平台路径处理
 * @param {string} input - 输入路径
 * @param {Object} options - 选项
 * @param {string} options.workingDir - 工作目录
 * @param {boolean} options.allowUNC - 是否允许UNC路径（Windows）
 * @param {boolean} options.allowLongPath - 是否允许长路径（Windows）
 * @returns {string} 解析后的绝对路径
 */
function resolveUserPath(input, { workingDir, allowUNC = false, allowLongPath = false } = {}) {
  if (!input || typeof input !== 'string') {
    throw new Error('路径参数无效');
  }

  const home = platformUtils.getHomeDirectory();
  let base;

  // 自动处理 /Users/xueyuheng/research/mcp 目录的路径转换
  const projectRoot = '/Users/xueyuheng/research/mcp';
  // 以及处理 /users/xueyuheng/research/guerrilla 路径（适用于沙箱环境）
  const guerrillaPath = '/users/xueyuheng/research/guerrilla';
  
  if (input.startsWith(projectRoot)) {
    // 如果输入路径以项目根目录开始，将其转换为相对于工作目录的路径
    if (workingDir) {
      // 如果提供了工作目录，计算相对于工作目录的路径
      const relativePath = path.relative(projectRoot, input);
      base = path.join(workingDir, relativePath);
    } else {
      // 如果没有提供工作目录，仍然使用原始路径（但安全验证器会特殊处理）
      base = input;
    }
  } else if (input.startsWith(guerrillaPath)) {
    // 如果输入路径以 guerrilla 项目路径开始，将其转换为相对于工作目录的路径
    if (workingDir) {
      // 如果提供了工作目录，计算相对于工作目录的路径
      const relativePath = path.relative(guerrillaPath, input);
      base = path.join(workingDir, relativePath);
    } else {
      // 如果没有提供工作目录，仍然使用原始路径（但安全验证器会特殊处理）
      base = input;
    }
  } else {
    // 处理绝对路径
    if (path.isAbsolute(input)) {
      base = input;
    } else if (workingDir) {
      // 相对于工作目录
      base = path.join(workingDir, input);
    } else {
      // 相对于家目录
      base = path.join(home, input);
    }
  }

  // 使用平台工具规范化路径
  const normalizedPath = platformUtils.normalizePath(base);
  
  // Windows特殊路径检查
  if (platformUtils.isWindows) {
    // UNC路径检查
    if (platformUtils.isUNCPath(normalizedPath) && !allowUNC) {
      const err = new Error('不允许UNC路径');
      err.code = 'E_UNC_PATH_DENIED';
      throw err;
    }
    
    // 长路径检查
    if (platformUtils.isLongPath(normalizedPath) && !allowLongPath) {
      const err = new Error('不允许长路径');
      err.code = 'E_LONG_PATH_DENIED';
      throw err;
    }
    
    // Windows路径长度检查
    const pathConfig = platformUtils.getPathConfig();
    if (normalizedPath.length > pathConfig.maxLength) {
      const err = new Error(`路径长度超过限制 (${pathConfig.maxLength})`);
      err.code = 'E_PATH_TOO_LONG';
      throw err;
    }
  }

  return path.resolve(normalizedPath);
}

/**
 * 增强的家目录验证，支持跨平台和特殊路径
 * @param {string} absPath - 绝对路径
 * @param {Object} options - 选项
 * @param {boolean} options.allowSymlinks - 是否允许符号链接
 * @param {boolean} options.strictMode - 严格模式
 * @returns {string} 验证后的路径
 */
function assertInHome(absPath, { allowSymlinks = false, strictMode = true } = {}) {
  if (!absPath || typeof absPath !== 'string') {
    const err = new Error('路径参数无效');
    err.code = 'E_INVALID_PATH';
    throw err;
  }

  const home = platformUtils.getHomeDirectory();
  const homeSeparator = path.resolve(home) + path.sep;
  let targetPath = path.resolve(absPath);
  
  // 处理符号链接
  if (platformUtils.isUnix && fs.existsSync(targetPath)) {
    try {
      const stats = fs.lstatSync(targetPath);
      if (stats.isSymbolicLink()) {
        if (!allowSymlinks) {
          const err = new Error('不允许符号链接');
          err.code = 'E_SYMLINK_DENIED';
          throw err;
        }
        // 解析符号链接的真实路径
        targetPath = fs.realpathSync(targetPath);
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && strictMode) {
        throw error;
      }
    }
  }
  
  const targetSeparator = path.resolve(targetPath) + path.sep;
  
  // Windows特殊处理
  if (platformUtils.isWindows) {
    // Windows路径不区分大小写
    const homeNorm = homeSeparator.toLowerCase();
    const targetNorm = targetSeparator.toLowerCase();
    
    if (!targetNorm.startsWith(homeNorm)) {
      const err = new Error('路径不允许');
      err.code = 'E_PATH_DENIED';
      throw err;
    }
  } else {
    // Unix系统区分大小写
    if (!targetSeparator.startsWith(homeSeparator)) {
      const err = new Error('路径不允许');
      err.code = 'E_PATH_DENIED';
      throw err;
    }
  }
  
  return targetPath;
}

/**
 * 检查路径是否安全
 * @param {string} inputPath - 输入路径
 * @param {Object} options - 选项
 * @returns {Object} 安全检查结果
 */
function validatePathSafety(inputPath, options = {}) {
  const result = {
    safe: true,
    warnings: [],
    errors: [],
    normalizedPath: null
  };

  try {
    // 解析路径
    const resolvedPath = resolveUserPath(inputPath, options);
    
    // 验证家目录
    const validatedPath = assertInHome(resolvedPath, options);
    
    result.normalizedPath = validatedPath;
    
    // 平台特定检查
    if (platformUtils.isWindows) {
      // Windows特殊字符检查
      const invalidChars = /[<>:"|?*]/;
      if (invalidChars.test(path.basename(inputPath))) {
        result.warnings.push('路径包含Windows保留字符');
      }
      
      // 保留名称检查
      const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
      if (reservedNames.test(path.basename(inputPath, path.extname(inputPath)))) {
        result.warnings.push('路径包含Windows保留名称');
      }
    }
    
    // 路径遍历攻击检查
    if (inputPath.includes('..')) {
      result.warnings.push('路径包含相对路径符号');
    }
    
  } catch (error) {
    result.safe = false;
    result.errors.push(error.message);
  }

  return result;
}

/**
 * 获取路径信息
 * @param {string} inputPath - 输入路径
 * @returns {Object} 路径信息
 */
function getPathInfo(inputPath) {
  const info = {
    original: inputPath,
    resolved: null,
    platform: platformUtils.getPlatformInfo(),
    type: null,
    features: {}
  };

  try {
    info.resolved = resolveUserPath(inputPath);
    
    if (platformUtils.isWindows) {
      info.type = 'windows';
      info.features = {
        isUNC: platformUtils.isUNCPath(inputPath),
        isLong: platformUtils.isLongPath(inputPath),
        driveLetter: path.parse(inputPath).root
      };
    } else {
      info.type = 'unix';
      info.features = {
        isHidden: path.basename(inputPath).startsWith('.'),
        isAbsolute: path.isAbsolute(inputPath)
      };
    }
    
    // 检查文件存在性和类型
    if (fs.existsSync(info.resolved)) {
      const stats = fs.statSync(info.resolved);
      info.exists = true;
      info.isFile = stats.isFile();
      info.isDirectory = stats.isDirectory();
      info.isSymbolicLink = stats.isSymbolicLink();
    } else {
      info.exists = false;
    }
    
  } catch (error) {
    info.error = error.message;
  }

  return info;
}

module.exports = {
  resolveUserPath,
  assertInHome,
  validatePathSafety,
  getPathInfo,
  
  // 向后兼容的导出
  platformUtils
};
