const os = require('os');
const path = require('path');

/**
 * 跨平台工具类 - 提供统一的平台检测和抽象接口
 * 解决不同操作系统间的兼容性差异
 */
class PlatformUtils {
  constructor() {
    this.platform = process.platform;
    this.isWindows = this.platform === 'win32';
    this.isMacOS = this.platform === 'darwin';
    this.isLinux = this.platform === 'linux';
    this.isUnix = this.isMacOS || this.isLinux;
  }

  /**
   * 获取平台信息
   * @returns {Object} 平台信息对象
   */
  getPlatformInfo() {
    return {
      platform: this.platform,
      isWindows: this.isWindows,
      isMacOS: this.isMacOS,
      isLinux: this.isLinux,
      isUnix: this.isUnix,
      nodeVersion: process.version,
      architecture: process.arch
    };
  }

  /**
   * 获取平台特定的路径分隔符
   * @returns {string} 路径分隔符
   */
  getPathSeparator() {
    return this.isWindows ? '\\' : '/';
  }

  /**
   * 获取平台特定的路径配置
   * @returns {Object} 路径配置对象
   */
  getPathConfig() {
    return {
      separator: this.getPathSeparator(),
      delimiter: this.isWindows ? ';' : ':',
      maxLength: this.isWindows ? 32767 : 4096,
      caseSensitive: !this.isWindows,
      supportedFeatures: {
        longPaths: this.isWindows,
        uncPaths: this.isWindows,
        symbolicLinks: this.isUnix,
        hiddenFiles: true,
        fileAttributes: this.isWindows
      }
    };
  }

  /**
   * 检查是否支持递归文件监控
   * @returns {boolean} 是否支持递归监控
   */
  supportsRecursiveWatch() {
    // macOS 和 Windows 原生支持递归监控
    // Linux 通常不支持，需要手动实现
    return this.isMacOS || this.isWindows;
  }

  /**
   * 获取平台特定的命令行接口
   * @returns {Object} 命令行配置
   */
  getShellConfig() {
    if (this.isWindows) {
      return {
        shell: 'cmd',
        alternativeShell: 'powershell',
        executable: 'cmd.exe',
        args: ['/c'],
        encoding: 'utf8'
      };
    } else {
      return {
        shell: 'bash',
        alternativeShell: 'sh',
        executable: '/bin/bash',
        args: ['-c'],
        encoding: 'utf8'
      };
    }
  }

  /**
   * 获取平台特定的权限系统配置
   * @returns {Object} 权限系统配置
   */
  getPermissionConfig() {
    if (this.isWindows) {
      return {
        type: 'acl',
        supports: {
          owner: true,
          group: false,
          permissions: false,
          attributes: true
        },
        commands: {
          view: 'icacls',
          modify: 'icacls',
          attribute: 'attrib'
        }
      };
    } else {
      return {
        type: 'posix',
        supports: {
          owner: true,
          group: true,
          permissions: true,
          attributes: false
        },
        commands: {
          view: 'ls -la',
          modify: 'chmod',
          owner: 'chown'
        }
      };
    }
  }

  /**
   * 获取平台特定的环境变量
   * @returns {Object} 环境变量配置
   */
  getEnvironmentConfig() {
    return {
      home: this.getHomeDirectory(),
      tempDir: this.getTempDirectory(),
      pathVariable: this.isWindows ? 'PATH' : 'PATH',
      userProfile: this.isWindows ? process.env.USERPROFILE : process.env.HOME,
      variables: {
        user: this.isWindows ? process.env.USERNAME : process.env.USER,
        shell: this.isWindows ? process.env.COMSPEC : process.env.SHELL
      }
    };
  }

  /**
   * 获取规范化的家目录路径
   * @returns {string} 家目录路径
   */
  getHomeDirectory() {
    const home = os.homedir();
    return path.resolve(home);
  }

  /**
   * 获取临时目录路径
   * @returns {string} 临时目录路径
   */
  getTempDirectory() {
    return os.tmpdir();
  }

  /**
   * 检查路径是否为UNC路径（Windows）
   * @param {string} inputPath - 要检查的路径
   * @returns {boolean} 是否为UNC路径
   */
  isUNCPath(inputPath) {
    if (!this.isWindows) return false;
    return /^\\\\[^\\]+\\[^\\]+/.test(inputPath);
  }

  /**
   * 检查路径是否为长路径（Windows）
   * @param {string} inputPath - 要检查的路径
   * @returns {boolean} 是否为长路径
   */
  isLongPath(inputPath) {
    if (!this.isWindows) return false;
    return inputPath.startsWith('\\\\?\\');
  }

  /**
   * 规范化路径，处理平台差异
   * @param {string} inputPath - 输入路径
   * @returns {string} 规范化后的路径
   */
  normalizePath(inputPath) {
    if (!inputPath) return '';
    
    // 在Windows上处理UNC路径
    if (this.isWindows && this.isUNCPath(inputPath)) {
      return path.normalize(inputPath);
    }
    
    // 处理长路径
    if (this.isWindows && this.isLongPath(inputPath)) {
      return path.normalize(inputPath);
    }
    
    // 标准路径规范化
    return path.normalize(inputPath);
  }

  /**
   * 获取平台特定的错误代码映射
   * @returns {Object} 错误代码映射
   */
  getErrorCodeMapping() {
    const common = {
      ENOENT: '路径不存在',
      EACCES: '权限不足',
      EISDIR: '目标是目录',
      ENOTDIR: '目标不是目录',
      EBUSY: '资源忙',
      EEXIST: '文件已存在'
    };

    if (this.isWindows) {
      return {
        ...common,
        EPERM: '操作不被允许',
        EMFILE: '打开文件过多',
        ERROR_PATH_NOT_FOUND: '路径不存在',
        ERROR_ACCESS_DENIED: '访问被拒绝',
        ERROR_FILENAME_EXCED_RANGE: '文件名过长'
      };
    } else {
      return {
        ...common,
        EPERM: '操作不被允许',
        ENAMETOOLONG: '文件名过长',
        ELOOP: '符号链接层级过多',
        EROFS: '只读文件系统'
      };
    }
  }

  /**
   * 获取sudo配置信息（仅Linux）
   * @returns {Object|null} sudo配置信息
   */
  getSudoConfig() {
    if (!this.isLinux) return null;
    
    return {
      available: true,
      configFile: '/etc/sudoers',
      configDir: '/etc/sudoers.d/',
      noPasswordCheck: 'NOPASSWD',
      testCommand: 'sudo -n true',
      whoamiCommand: 'whoami'
    };
  }
}

// 创建单例实例
const platformUtils = new PlatformUtils();

module.exports = platformUtils;