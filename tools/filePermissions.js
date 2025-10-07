/**
 * 跨平台文件权限工具模块
 * 支持Unix/Linux和Windows平台的权限管理
 */

const fs = require('fs').promises;
const path = require('path');
const { ERR } = require('../errors');
const { text } = require('../responses');
const { CrossPlatformPermissionManager } = require('../lib/crossPlatformPermissions');
const platformUtils = require('../lib/platformUtils');

class FilePermissionsTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
    this.permissionManager = new CrossPlatformPermissionManager();
  }

  async handle(args) {
    const { 
      path: filePath, 
      file_path, 
      dir_path, 
      mode, 
      permissions = {},
      recursive = false, 
      max_depth = 5, 
      output_format = 'text',
      skip_errors = false
    } = args;
    
    const target = filePath || file_path || dir_path;
    if (!target) {
      throw ERR.INVALID_ARGS('缺少路径参数: 需要 path / file_path / dir_path 之一');
    }

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(target)) {
      throw ERR.PATH_DENIED(target);
    }

    try {
      const start = Date.now();
      let result;
      
      // 根据平台和输入参数确定权限设置方式
      if (platformUtils.isWindows) {
        result = await this.handleWindowsPermissions(target, { mode, permissions, recursive, max_depth, skip_errors });
      } else {
        result = await this.handleUnixPermissions(target, { mode, permissions, recursive, max_depth, skip_errors });
      }
      
      const duration_ms = Date.now() - start;
      
      // 获取最终权限状态
      const finalPermissions = await this.permissionManager.getPermissions(target);
      
      const data = {
        action: 'chmod',
        platform: platformUtils.getPlatformInfo().platform,
        path: target,
        requested: { mode, permissions },
        applied: result,
        current: finalPermissions,
        recursive,
        max_depth,
        duration_ms,
        operations_count: result.operations ? result.operations.length : 1
      };
      
      if (output_format === 'json') {
        return { content: [{ type: 'json', json: data }] };
      } else if (output_format === 'both') {
        return { 
          content: [
            { type: 'text', text: this.formatTextOutput(data) },
            { type: 'json', json: data }
          ]
        };
      }
      
      return text(this.formatTextOutput(data));

    } catch (error) {
      if (error.code === 'ENOENT') throw ERR.NOT_FOUND(target);
      if (error.code === 'E_PATH_DENIED') throw error;
      if (error.code === 'E_LIMIT_REACHED') throw error;
      if (error.code === 'EACCES') throw ERR.INVALID_ARGS(`没有权限修改文件权限: ${target}`);
      throw ERR.INVALID_ARGS(`修改权限失败: ${error.message}`);
    }
  }

  /**
   * 处理Unix/Linux权限设置
   */
  async handleUnixPermissions(target, options) {
    const { mode, permissions, recursive, max_depth, skip_errors } = options;
    
    let permissionValue;
    
    // 确定权限值
    if (mode) {
      if (!this.isValidMode(mode)) {
        throw ERR.INVALID_ARGS(`无效的权限模式: ${mode}。请使用八进制格式，如 755, 644 等`);
      }
      permissionValue = parseInt(mode, 8);
    } else if (permissions && typeof permissions === 'object') {
      permissionValue = permissions;
    } else {
      throw ERR.INVALID_ARGS('必须提供mode或permissions参数');
    }
    
    if (recursive) {
      return await this.permissionManager.setPermissionsRecursive(target, permissionValue, {
        maxDepth: max_depth,
        skipErrors: skip_errors
      });
    } else {
      return await this.permissionManager.setPermissions(target, permissionValue);
    }
  }

  /**
   * 处理Windows权限设置
   */
  async handleWindowsPermissions(target, options) {
    const { mode, permissions, recursive, max_depth, skip_errors } = options;
    
    let permissionValue = permissions || {};
    
    // 如果提供了Unix模式，转换为Windows权限
    if (mode) {
      const mappedPermissions = this.permissionManager.mapUnixToWindows(mode);
      permissionValue = { ...permissionValue, ...mappedPermissions };
    }
    
    if (recursive) {
      return await this.permissionManager.setPermissionsRecursive(target, permissionValue, {
        maxDepth: max_depth,
        skipErrors: skip_errors
      });
    } else {
      return await this.permissionManager.setPermissions(target, permissionValue);
    }
  }

  /**
   * 格式化文本输出
   */
  formatTextOutput(data) {
    let output = `权限修改成功 (${data.platform}):\n`;
    output += `文件: ${data.path}\n`;
    
    if (platformUtils.isWindows) {
      if (data.applied.operations) {
        output += `执行操作数: ${data.applied.operations.length}\n`;
        data.applied.operations.forEach(op => {
          output += `- ${op.operation}: ${op.success ? '成功' : '失败'}\n`;
        });
      }
      
      if (data.current.readonly !== undefined) {
        output += `只读: ${data.current.readonly ? '是' : '否'}\n`;
      }
      if (data.current.hidden !== undefined) {
        output += `隐藏: ${data.current.hidden ? '是' : '否'}\n`;
      }
    } else {
      if (data.current.octal) {
        output += `当前权限: ${data.current.octal} (${data.current.symbolic})\n`;
      }
      if (data.applied.appliedMode) {
        output += `应用权限: ${data.applied.appliedMode} (${data.applied.symbolic})\n`;
      }
    }
    
    if (data.recursive) {
      output += `递归模式: 启用 (最大深度: ${data.max_depth})\n`;
      if (data.operations_count > 1) {
        output += `处理文件数: ${data.operations_count}\n`;
      }
    }
    
    output += `耗时: ${data.duration_ms}ms`;
    
    return output;
  }

  /**
   * 获取权限信息（新增功能）
   */
  async getPermissionInfo(target) {
    if (!this.securityValidator.isPathAllowed(target)) {
      throw ERR.PATH_DENIED(target);
    }
    
    return await this.permissionManager.getPermissions(target);
  }

  /**
   * 权限验证
   */
  validatePermissions(permissions) {
    return this.permissionManager.validatePermissions(permissions);
  }

  /**
   * 获取权限建议
   */
  getPermissionRecommendations() {
    return this.permissionManager.getPermissionRecommendations();
  }

  // 保持向后兼容的方法
  async setPermissions(filePath, mode, recursive, depth, maxDepth) {
    if (recursive) {
      return await this.permissionManager.setPermissionsRecursive(filePath, mode, {
        maxDepth: maxDepth,
        currentDepth: depth
      });
    } else {
      return await this.permissionManager.setPermissions(filePath, mode);
    }
  }

  isValidMode(mode) {
    // 检查是否为有效的八进制权限模式
    const modeStr = mode.toString();
    return /^[0-7]{3,4}$/.test(modeStr) && parseInt(modeStr, 8) <= 7777;
  }

  formatPermissions(mode) {
    if (platformUtils.isWindows) {
      // Windows下简化显示
      return `模式: ${mode.toString(8)}`;
    }
    
    // Unix权限格式化
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
