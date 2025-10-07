/**
 * 跨平台权限适配器
 * 统一处理Windows ACL和Unix权限系统
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const platformUtils = require('../lib/platformUtils');

/**
 * 跨平台权限系统抽象基类
 */
class PermissionAdapter {
  constructor() {
    this.platform = platformUtils.getPlatformInfo();
    this.permissionConfig = platformUtils.getPermissionConfig();
  }

  /**
   * 获取文件权限信息
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 权限信息
   */
  async getPermissions(filePath) {
    throw new Error('getPermissions方法需要在子类中实现');
  }

  /**
   * 设置文件权限
   * @param {string} filePath - 文件路径
   * @param {Object} permissions - 权限设置
   * @returns {Promise<Object>} 设置结果
   */
  async setPermissions(filePath, permissions) {
    throw new Error('setPermissions方法需要在子类中实现');
  }

  /**
   * 权限格式转换
   * @param {Object} permissions - 权限对象
   * @returns {Object} 标准化权限对象
   */
  normalizePermissions(permissions) {
    throw new Error('normalizePermissions方法需要在子类中实现');
  }
}

/**
 * Unix/Linux权限适配器
 */
class UnixPermissionAdapter extends PermissionAdapter {
  constructor() {
    super();
  }

  async getPermissions(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const mode = stats.mode;
      
      return {
        platform: 'unix',
        mode: mode,
        octal: (mode & parseInt('777', 8)).toString(8),
        symbolic: this.formatSymbolic(mode),
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
        },
        specialBits: {
          sticky: !!(mode & 0o1000),
          setgid: !!(mode & 0o2000),
          setuid: !!(mode & 0o4000)
        }
      };
    } catch (error) {
      throw new Error(`获取Unix权限失败: ${error.message}`);
    }
  }

  async setPermissions(filePath, permissions) {
    try {
      let mode;
      
      // 处理不同的权限输入格式
      if (typeof permissions === 'number') {
        mode = permissions;
      } else if (typeof permissions === 'string') {
        mode = parseInt(permissions, 8);
      } else if (typeof permissions === 'object') {
        mode = this.convertToOctal(permissions);
      } else {
        throw new Error('无效的权限格式');
      }
      
      await fs.chmod(filePath, mode);
      
      return {
        success: true,
        appliedMode: mode.toString(8),
        symbolic: this.formatSymbolic(mode)
      };
    } catch (error) {
      throw new Error(`设置Unix权限失败: ${error.message}`);
    }
  }

  /**
   * 将权限对象转换为八进制数值
   */
  convertToOctal(permissions) {
    let mode = 0;
    
    if (permissions.owner) {
      if (permissions.owner.read) mode |= 0o400;
      if (permissions.owner.write) mode |= 0o200;
      if (permissions.owner.execute) mode |= 0o100;
    }
    
    if (permissions.group) {
      if (permissions.group.read) mode |= 0o040;
      if (permissions.group.write) mode |= 0o020;
      if (permissions.group.execute) mode |= 0o010;
    }
    
    if (permissions.others) {
      if (permissions.others.read) mode |= 0o004;
      if (permissions.others.write) mode |= 0o002;
      if (permissions.others.execute) mode |= 0o001;
    }
    
    if (permissions.specialBits) {
      if (permissions.specialBits.sticky) mode |= 0o1000;
      if (permissions.specialBits.setgid) mode |= 0o2000;
      if (permissions.specialBits.setuid) mode |= 0o4000;
    }
    
    return mode;
  }

  formatSymbolic(mode) {
    let result = '';
    
    // 所有者权限
    result += (mode & 0o400) ? 'r' : '-';
    result += (mode & 0o200) ? 'w' : '-';
    result += (mode & 0o100) ? ((mode & 0o4000) ? 's' : 'x') : ((mode & 0o4000) ? 'S' : '-');
    
    // 组权限
    result += (mode & 0o040) ? 'r' : '-';
    result += (mode & 0o020) ? 'w' : '-';
    result += (mode & 0o010) ? ((mode & 0o2000) ? 's' : 'x') : ((mode & 0o2000) ? 'S' : '-');
    
    // 其他用户权限
    result += (mode & 0o004) ? 'r' : '-';
    result += (mode & 0o002) ? 'w' : '-';
    result += (mode & 0o001) ? ((mode & 0o1000) ? 't' : 'x') : ((mode & 0o1000) ? 'T' : '-');
    
    return result;
  }

  normalizePermissions(permissions) {
    return {
      type: 'unix',
      readable: true,
      writable: true,
      executable: platformUtils.isUnix,
      owner: permissions.owner || {},
      group: permissions.group || {},
      others: permissions.others || {}
    };
  }
}

/**
 * Windows权限适配器
 */
class WindowsPermissionAdapter extends PermissionAdapter {
  constructor() {
    super();
  }

  async getPermissions(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      // 使用icacls命令获取详细权限信息
      let aclInfo = null;
      try {
        const { stdout } = await execAsync(`icacls "${filePath}"`);
        aclInfo = this.parseIcaclsOutput(stdout);
      } catch (error) {
        // 如果icacls失败，使用基本信息
        console.warn('无法获取详细ACL信息:', error.message);
      }
      
      // 获取文件属性
      let attributes = {};
      try {
        const { stdout } = await execAsync(`attrib "${filePath}"`);
        attributes = this.parseAttribOutput(stdout);
      } catch (error) {
        console.warn('无法获取文件属性:', error.message);
      }
      
      return {
        platform: 'windows',
        mode: stats.mode,
        type: stats.isFile() ? 'file' : 'directory',
        size: stats.size,
        readonly: !!(stats.mode & 0o200) === false,
        hidden: attributes.hidden || false,
        system: attributes.system || false,
        archive: attributes.archive || false,
        acl: aclInfo || {},
        lastModified: stats.mtime,
        created: stats.birthtime
      };
    } catch (error) {
      throw new Error(`获取Windows权限失败: ${error.message}`);
    }
  }

  async setPermissions(filePath, permissions) {
    const results = [];
    
    try {
      // 处理只读属性
      if (typeof permissions.readonly !== 'undefined') {
        const command = permissions.readonly 
          ? `attrib +R \"${filePath}\"`
          : `attrib -R \"${filePath}\"`;
        
        const { stdout } = await execAsync(command);
        results.push({
          operation: 'readonly',
          success: true,
          value: permissions.readonly
        });
      }
      
      // 处理隐藏属性
      if (typeof permissions.hidden !== 'undefined') {
        const command = permissions.hidden 
          ? `attrib +H \"${filePath}\"`
          : `attrib -H \"${filePath}\"`;
        
        const { stdout } = await execAsync(command);
        results.push({
          operation: 'hidden',
          success: true,
          value: permissions.hidden
        });
      }
      
      // 处理系统属性
      if (typeof permissions.system !== 'undefined') {
        const command = permissions.system 
          ? `attrib +S \"${filePath}\"`
          : `attrib -S \"${filePath}\"`;
        
        const { stdout } = await execAsync(command);
        results.push({
          operation: 'system',
          success: true,
          value: permissions.system
        });
      }
      
      // 处理ACL权限（高级功能）
      if (permissions.acl) {
        const aclResult = await this.setAclPermissions(filePath, permissions.acl);
        results.push(aclResult);
      }
      
      return {
        success: true,
        operations: results,
        summary: `成功执行${results.length}个权限操作`
      };
      
    } catch (error) {
      throw new Error(`设置Windows权限失败: ${error.message}`);
    }
  }

  async setAclPermissions(filePath, aclPermissions) {
    try {
      // 简化的ACL设置，仅支持基本权限操作
      if (aclPermissions.grant) {
        const { user, permissions } = aclPermissions.grant;
        const command = `icacls \"${filePath}\" /grant ${user}:${permissions}`;
        
        const { stdout } = await execAsync(command);
        
        return {
          operation: 'acl_grant',
          success: true,
          user: user,
          permissions: permissions
        };
      }
      
      if (aclPermissions.deny) {
        const { user, permissions } = aclPermissions.deny;
        const command = `icacls \"${filePath}\" /deny ${user}:${permissions}`;
        
        const { stdout } = await execAsync(command);
        
        return {
          operation: 'acl_deny',
          success: true,
          user: user,
          permissions: permissions
        };
      }
      
      throw new Error('无效的ACL权限设置');
      
    } catch (error) {
      return {
        operation: 'acl',
        success: false,
        error: error.message
      };
    }
  }

  parseIcaclsOutput(output) {
    const lines = output.split('\n').filter(line => line.trim());
    const acl = {};
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [userPart, permissionsPart] = line.split(':');
        if (userPart && permissionsPart) {
          const user = userPart.trim();
          const permissions = permissionsPart.trim().replace(/[()]/g, '');
          acl[user] = permissions.split(',').map(p => p.trim());
        }
      }
    }
    
    return acl;
  }

  parseAttribOutput(output) {
    const line = output.split('\n')[0] || '';
    
    return {
      archive: line.includes('A'),
      hidden: line.includes('H'),
      readonly: line.includes('R'),
      system: line.includes('S')
    };
  }

  normalizePermissions(permissions) {
    return {
      type: 'windows',
      readable: !permissions.hidden,
      writable: !permissions.readonly,
      executable: false, // Windows不直接支持执行权限概念
      attributes: {
        readonly: permissions.readonly || false,
        hidden: permissions.hidden || false,
        system: permissions.system || false,
        archive: permissions.archive || false
      }
    };
  }
}

/**
 * 跨平台权限管理器
 */
class CrossPlatformPermissionManager {
  constructor() {
    this.adapter = this.createAdapter();
  }

  createAdapter() {
    if (platformUtils.isWindows) {
      return new WindowsPermissionAdapter();
    } else {
      return new UnixPermissionAdapter();
    }
  }

  /**
   * 获取文件权限
   */
  async getPermissions(filePath) {
    return await this.adapter.getPermissions(filePath);
  }

  /**
   * 设置文件权限
   */
  async setPermissions(filePath, permissions) {
    return await this.adapter.setPermissions(filePath, permissions);
  }

  /**
   * 权限格式转换
   */
  normalizePermissions(permissions) {
    return this.adapter.normalizePermissions(permissions);
  }

  /**
   * 将Unix权限映射到Windows权限
   */
  mapUnixToWindows(unixPermissions) {
    const windowsPermissions = {};
    
    if (typeof unixPermissions === 'string') {
      const mode = parseInt(unixPermissions, 8);
      windowsPermissions.readonly = !(mode & 0o200); // 写权限
    } else if (typeof unixPermissions === 'object') {
      windowsPermissions.readonly = !unixPermissions.owner?.write;
    }
    
    return windowsPermissions;
  }

  /**
   * 将Windows权限映射到Unix权限
   */
  mapWindowsToUnix(windowsPermissions) {
    let mode = 0o644; // 默认权限
    
    if (!windowsPermissions.readonly) {
      mode |= 0o200; // 添加写权限
    } else {
      mode &= ~0o200; // 移除写权限
    }
    
    return mode;
  }

  /**
   * 递归设置权限
   */
  async setPermissionsRecursive(dirPath, permissions, options = {}) {
    const { maxDepth = 10, currentDepth = 0, skipErrors = false } = options;
    const results = [];
    
    if (currentDepth >= maxDepth) {
      throw new Error(`递归深度超过限制: ${maxDepth}`);
    }
    
    try {
      // 设置当前路径权限
      const result = await this.setPermissions(dirPath, permissions);
      results.push({ path: dirPath, ...result });
      
      // 检查是否为目录
      const stats = await fs.stat(dirPath);
      if (stats.isDirectory()) {
        const items = await fs.readdir(dirPath);
        
        for (const item of items) {
          const fullPath = path.join(dirPath, item);
          try {
            const subResults = await this.setPermissionsRecursive(
              fullPath, 
              permissions, 
              { ...options, currentDepth: currentDepth + 1 }
            );
            results.push(...subResults);
          } catch (error) {
            if (!skipErrors) {
              throw error;
            }
            results.push({ 
              path: fullPath, 
              success: false, 
              error: error.message 
            });
          }
        }
      }
      
    } catch (error) {
      if (!skipErrors) {
        throw error;
      }
      results.push({ 
        path: dirPath, 
        success: false, 
        error: error.message 
      });
    }
    
    return results;
  }

  /**
   * 权限验证
   */
  validatePermissions(permissions) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };
    
    if (platformUtils.isWindows) {
      // Windows权限验证
      if (permissions.acl && typeof permissions.acl !== 'object') {
        validation.valid = false;
        validation.errors.push('ACL权限必须是对象格式');
      }
    } else {
      // Unix权限验证
      if (typeof permissions === 'string') {
        const mode = parseInt(permissions, 8);
        if (isNaN(mode) || mode > 0o7777) {
          validation.valid = false;
          validation.errors.push('无效的八进制权限模式');
        }
      }
    }
    
    return validation;
  }

  /**
   * 获取平台特定的权限建议
   */
  getPermissionRecommendations() {
    if (platformUtils.isWindows) {
      return {
        platform: 'windows',
        recommendations: [
          '使用attrib命令设置文件属性',
          '谨慎使用icacls修改ACL权限',
          '避免移除系统文件的只读属性',
          '使用takeown命令获取文件所有权（如需要）'
        ]
      };
    } else {
      return {
        platform: 'unix',
        recommendations: [
          '使用chmod设置文件权限，避免777权限',
          '使用chown修改文件所有者和组',
          '合理使用特殊权限位（setuid、setgid、sticky）',
          '注意符号链接的权限处理'
        ]
      };
    }
  }
}

module.exports = {
  CrossPlatformPermissionManager,
  UnixPermissionAdapter,
  WindowsPermissionAdapter,
  PermissionAdapter
};