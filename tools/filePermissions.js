/**
 * 文件权限工具模块
 * 支持修改文件权限
 */

const fs = require('fs').promises;

class FilePermissionsTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const { path: filePath, mode, recursive = false } = args;

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(filePath)) {
      throw new Error(`不允许操作路径: ${filePath}`);
    }

    // 验证权限模式
    if (!this.isValidMode(mode)) {
      throw new Error(`无效的权限模式: ${mode}。请使用八进制格式，如 755, 644 等`);
    }

    try {
      const octalMode = parseInt(mode, 8);
      await this.setPermissions(filePath, octalMode, recursive);
      
      const stats = await fs.stat(filePath);
      const currentMode = (stats.mode & parseInt('777', 8)).toString(8);
      
      return {
        content: [
          {
            type: 'text',
            text: `权限修改成功:\n文件: ${filePath}\n新权限: ${mode} (${this.formatPermissions(octalMode)})\n当前权限: ${currentMode} (${this.formatPermissions(parseInt(currentMode, 8))})`
          }
        ]
      };

    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`文件不存在: ${filePath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`没有权限修改文件权限: ${filePath}`);
      } else {
        throw new Error(`修改权限失败: ${error.message}`);
      }
    }
  }

  async setPermissions(filePath, mode, recursive) {
    await fs.chmod(filePath, mode);
    
    if (recursive) {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        const items = await fs.readdir(filePath);
        for (const item of items) {
          const fullPath = require('path').join(filePath, item);
          await this.setPermissions(fullPath, mode, true);
        }
      }
    }
  }

  isValidMode(mode) {
    // 检查是否为有效的八进制权限模式
    const modeStr = mode.toString();
    return /^[0-7]{3,4}$/.test(modeStr) && parseInt(modeStr, 8) <= 7777;
  }

  formatPermissions(mode) {
    const permissions = {
      owner: {
        read: !!(mode & 0o400),
        write: !!(mode & 0o200),
        execute: !!(mode & 0o100)
      },
      group: {
        read: !!(mode & 0o040),
        write: !!(mode & 0o020),
        execute: !!(mode & 0o010)
      },
      others: {
        read: !!(mode & 0o004),
        write: !!(mode & 0o002),
        execute: !!(mode & 0o001)
      }
    };

    let result = '';
    ['owner', 'group', 'others'].forEach(type => {
      result += permissions[type].read ? 'r' : '-';
      result += permissions[type].write ? 'w' : '-';
      result += permissions[type].execute ? 'x' : '-';
    });

    return result;
  }
}

module.exports = FilePermissionsTool;
