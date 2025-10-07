/**
 * Linux Sudoers配置管理工具
 * 提供sudo无密码配置的安全管理机制
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const platformUtils = require('../lib/platformUtils');

/**
 * Sudoers配置管理器
 */
class SudoersConfigManager {
  constructor() {
    this.platform = platformUtils.getPlatformInfo();
    this.sudoConfig = platformUtils.getSudoConfig();
    
    if (!platformUtils.isLinux) {
      throw new Error('Sudoers配置仅支持Linux系统');
    }
  }

  /**
   * 检查sudo配置状态
   */
  async checkSudoStatus() {
    try {
      // 检查sudo是否安装
      await execAsync('which sudo');
      
      // 检查当前用户是否在sudo组
      const { stdout: groups } = await execAsync('groups');
      const inSudoGroup = groups.includes('sudo') || groups.includes('wheel');
      
      // 检查是否配置了无密码sudo
      let hasNoPassword = false;
      try {
        await execAsync('sudo -n true', { timeout: 3000 });
        hasNoPassword = true;
      } catch (error) {
        hasNoPassword = false;
      }
      
      // 获取当前用户信息
      const { stdout: whoami } = await execAsync('whoami');
      const currentUser = whoami.trim();
      
      return {
        available: true,
        installed: true,
        currentUser,
        inSudoGroup,
        hasNoPassword,
        configFile: this.sudoConfig.configFile,
        configDir: this.sudoConfig.configDir
      };
      
    } catch (error) {
      return {
        available: false,
        installed: false,
        error: error.message
      };
    }
  }

  /**
   * 生成sudoers配置规则
   */
  generateSudoersRules(username, options = {}) {
    const {
      commands = [],
      scope = 'limited', // 'limited', 'extended', 'full'
      timeLimit = false,
      logCommands = true
    } = options;

    const rules = [];
    const timestamp = new Date().toISOString();
    
    // 添加注释头
    rules.push(`# MCP Sudoers configuration for ${username}`);
    rules.push(`# Generated on ${timestamp}`);
    rules.push(`# Scope: ${scope}`);
    rules.push('');

    // 根据范围生成不同的规则
    switch (scope) {
      case 'limited':
        rules.push(...this.generateLimitedRules(username, commands));
        break;
      case 'extended':
        rules.push(...this.generateExtendedRules(username, commands));
        break;
      case 'full':
        rules.push(...this.generateFullRules(username));
        break;
      default:
        throw new Error(`未知的权限范围: ${scope}`);
    }

    // 添加日志记录（如果启用）
    if (logCommands) {
      rules.push('');
      rules.push('# Enable command logging');
      rules.push('Defaults logfile=/var/log/sudo.log');
      rules.push('Defaults log_input, log_output');
    }

    return rules.join('\n');
  }

  /**
   * 生成限制性规则（仅基本文件操作）
   */
  generateLimitedRules(username, customCommands = []) {
    const basicCommands = [
      '/bin/chmod',
      '/bin/chown', 
      '/bin/mkdir',
      '/bin/cp',
      '/bin/mv',
      '/usr/bin/find'
    ];

    const allowedCommands = [...basicCommands, ...customCommands];
    
    return [
      `# Limited file operations for ${username}`,
      `${username} ALL=(ALL) NOPASSWD: ${allowedCommands.join(', ')}`,
      '',
      '# Prevent dangerous operations',
      `${username} ALL=(ALL) !NOPASSWD: /bin/rm -rf /, /bin/dd, /sbin/fdisk`
    ];
  }

  /**
   * 生成扩展规则（包含系统服务管理）
   */
  generateExtendedRules(username, customCommands = []) {
    const extendedCommands = [
      '/bin/chmod',
      '/bin/chown',
      '/bin/mkdir', 
      '/bin/cp',
      '/bin/mv',
      '/usr/bin/find',
      '/bin/systemctl start',
      '/bin/systemctl stop',
      '/bin/systemctl restart',
      '/bin/systemctl reload',
      '/bin/systemctl status',
      '/usr/sbin/service',
      '/bin/mount',
      '/bin/umount'
    ];

    const allowedCommands = [...extendedCommands, ...customCommands];
    
    return [
      `# Extended system operations for ${username}`,
      `${username} ALL=(ALL) NOPASSWD: ${allowedCommands.join(', ')}`,
      '',
      '# Service management (restricted)',
      `${username} ALL=(ALL) NOPASSWD: /bin/systemctl start [a-zA-Z0-9_-]*`,
      `${username} ALL=(ALL) NOPASSWD: /bin/systemctl stop [a-zA-Z0-9_-]*`,
      '',
      '# Prevent critical system changes',
      `${username} ALL=(ALL) !NOPASSWD: /bin/rm -rf /, /sbin/fdisk, /sbin/mkfs.*`
    ];
  }

  /**
   * 生成完全权限规则（谨慎使用）
   */
  generateFullRules(username) {
    return [
      `# Full sudo access for ${username} (USE WITH CAUTION)`,
      `${username} ALL=(ALL) NOPASSWD: ALL`,
      '',
      '# Security reminder: This grants full system access',
      '# Consider using limited or extended scope instead'
    ];
  }

  /**
   * 验证sudoers配置语法
   */
  async validateSudoersConfig(configContent) {
    try {
      // 创建临时配置文件
      const tempFile = `/tmp/sudoers.test.${Date.now()}`;
      await fs.writeFile(tempFile, configContent);
      
      try {
        // 使用visudo验证语法
        await execAsync(`sudo visudo -c -f ${tempFile}`);
        
        // 清理临时文件
        await fs.unlink(tempFile);
        
        return {
          valid: true,
          message: '配置语法正确'
        };
        
      } catch (error) {
        // 清理临时文件
        try {
          await fs.unlink(tempFile);
        } catch (cleanupError) {
          // 忽略清理错误
        }
        
        return {
          valid: false,
          error: error.message,
          message: '配置语法错误'
        };
      }
      
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        message: '无法验证配置'
      };
    }
  }

  /**
   * 安装sudoers配置
   */
  async installSudoersConfig(configContent, options = {}) {
    const {
      fileName = 'mcp-nopasswd',
      backup = true,
      dryRun = false
    } = options;

    // 验证配置
    const validation = await this.validateSudoersConfig(configContent);
    if (!validation.valid) {
      throw new Error(`配置验证失败: ${validation.error}`);
    }

    const configPath = path.join(this.sudoConfig.configDir, fileName);
    
    if (dryRun) {
      return {
        action: 'dry-run',
        configPath,
        configContent,
        validation
      };
    }

    try {
      // 备份现有配置（如果存在）
      let backupPath = null;
      if (backup) {
        try {
          await fs.access(configPath);
          backupPath = `${configPath}.backup.${Date.now()}`;
          await execAsync(`sudo cp ${configPath} ${backupPath}`);
        } catch (error) {
          // 文件不存在，无需备份
        }
      }

      // 创建临时文件
      const tempFile = `/tmp/${fileName}.${Date.now()}`;
      await fs.writeFile(tempFile, configContent);

      // 复制到sudoers.d目录并设置权限
      await execAsync(`sudo cp ${tempFile} ${configPath}`);
      await execAsync(`sudo chmod 440 ${configPath}`);
      await execAsync(`sudo chown root:root ${configPath}`);

      // 清理临时文件
      await fs.unlink(tempFile);

      return {
        action: 'installed',
        configPath,
        backupPath,
        validation
      };

    } catch (error) {
      throw new Error(`安装配置失败: ${error.message}`);
    }
  }

  /**
   * 移除sudoers配置
   */
  async removeSudoersConfig(fileName = 'mcp-nopasswd', options = {}) {
    const { backup = true } = options;
    const configPath = path.join(this.sudoConfig.configDir, fileName);

    try {
      // 检查配置文件是否存在
      await fs.access(configPath);

      // 备份（如果需要）
      let backupPath = null;
      if (backup) {
        backupPath = `${configPath}.removed.${Date.now()}`;
        await execAsync(`sudo cp ${configPath} ${backupPath}`);
      }

      // 删除配置文件
      await execAsync(`sudo rm ${configPath}`);

      return {
        action: 'removed',
        configPath,
        backupPath
      };

    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          action: 'not-found',
          configPath,
          message: '配置文件不存在'
        };
      }
      throw new Error(`移除配置失败: ${error.message}`);
    }
  }

  /**
   * 列出现有的sudoers配置
   */
  async listSudoersConfigs() {
    try {
      const { stdout } = await execAsync(`sudo ls -la ${this.sudoConfig.configDir}`);
      const lines = stdout.split('\n').filter(line => line.trim());
      
      const configs = [];
      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 9 && !parts[8].startsWith('.')) {
          const fileName = parts[8];
          const permissions = parts[0];
          const size = parts[4];
          
          // 读取文件内容（前几行）
          try {
            const { stdout: content } = await execAsync(`sudo head -n 5 ${path.join(this.sudoConfig.configDir, fileName)}`);
            
            configs.push({
              fileName,
              permissions,
              size,
              preview: content.split('\n').slice(0, 3).join('\n'),
              path: path.join(this.sudoConfig.configDir, fileName)
            });
          } catch (readError) {
            configs.push({
              fileName,
              permissions,
              size,
              error: 'Cannot read file',
              path: path.join(this.sudoConfig.configDir, fileName)
            });
          }
        }
      }

      return configs;

    } catch (error) {
      throw new Error(`列出配置失败: ${error.message}`);
    }
  }

  /**
   * 测试sudo配置
   */
  async testSudoConfig(testCommand = 'true') {
    try {
      const startTime = Date.now();
      await execAsync(`sudo -n ${testCommand}`, { timeout: 5000 });
      const duration = Date.now() - startTime;

      return {
        success: true,
        command: testCommand,
        duration,
        message: 'sudo配置工作正常'
      };

    } catch (error) {
      return {
        success: false,
        command: testCommand,
        error: error.message,
        message: 'sudo配置测试失败'
      };
    }
  }

  /**
   * 获取安全建议
   */
  getSecurityRecommendations() {
    return {
      recommendations: [
        '使用最小权限原则，只授予必要的命令权限',
        '定期审查和更新sudoers配置',
        '启用命令日志记录以便审计',
        '为每个应用创建独立的配置文件',
        '使用命令白名单而非通配符权限',
        '定期备份sudoers配置',
        '测试配置变更对系统的影响'
      ],
      security_notes: [
        '永远不要在生产环境中使用NOPASSWD ALL',
        '限制sudo权限的时间窗口',
        '监控sudo命令的执行日志',
        '确保sudoers.d目录权限正确(755)',
        '配置文件权限应为440(r--r-----)'
      ],
      best_practices: [
        '使用visudo验证配置语法',
        '在应用配置前进行备份',
        '使用描述性的配置文件名',
        '在配置中添加详细注释',
        '定期清理不再使用的配置'
      ]
    };
  }
}

module.exports = SudoersConfigManager;