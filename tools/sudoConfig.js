/**
 * Sudo配置工具
 * 提供Linux sudo无密码配置的管理接口
 */

const SudoersConfigManager = require('../lib/sudoersConfigManager');
const { ERR } = require('../errors');
const { text } = require('../responses');
const platformUtils = require('../lib/platformUtils');

class SudoConfigTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
    
    // 只在Linux系统上初始化
    if (platformUtils.isLinux) {
      try {
        this.configManager = new SudoersConfigManager();
      } catch (error) {
        console.warn('Sudo配置管理器初始化失败:', error.message);
        this.configManager = null;
      }
    } else {
      this.configManager = null;
    }
  }

  async handle(args) {
    const {
      action = 'status',
      username,
      scope = 'limited',
      commands = [],
      config_name = 'mcp-nopasswd',
      dry_run = false,
      output_format = 'text'
    } = args;

    // 检查平台支持
    if (!platformUtils.isLinux) {
      throw ERR.INVALID_ARGS('Sudo配置仅支持Linux系统');
    }

    if (!this.configManager) {
      throw ERR.INVALID_ARGS('Sudo配置管理器不可用');
    }

    try {
      let result;
      
      switch (action) {
        case 'status':
          result = await this.handleStatus();
          break;
        case 'generate':
          result = await this.handleGenerate(username, scope, commands, dry_run);
          break;
        case 'install':
          result = await this.handleInstall(username, scope, commands, config_name, dry_run);
          break;
        case 'remove':
          result = await this.handleRemove(config_name);
          break;
        case 'list':
          result = await this.handleList();
          break;
        case 'test':
          result = await this.handleTest();
          break;
        case 'recommendations':
          result = await this.handleRecommendations();
          break;
        default:
          throw ERR.INVALID_ARGS(`未知的操作: ${action}`);
      }

      // 格式化输出
      if (output_format === 'json') {
        return { content: [{ type: 'json', json: result }] };
      } else if (output_format === 'both') {
        return {
          content: [
            { type: 'text', text: this.formatTextOutput(action, result) },
            { type: 'json', json: result }
          ]
        };
      }

      return text(this.formatTextOutput(action, result));

    } catch (error) {
      throw ERR.INVALID_ARGS(`Sudo配置操作失败: ${error.message}`);
    }
  }

  /**
   * 处理状态检查
   */
  async handleStatus() {
    const status = await this.configManager.checkSudoStatus();
    
    return {
      action: 'status',
      platform: platformUtils.getPlatformInfo().platform,
      sudo_status: status,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 处理配置生成
   */
  async handleGenerate(username, scope, commands, dryRun = false) {
    if (!username) {
      throw new Error('必须指定用户名');
    }

    const configContent = this.configManager.generateSudoersRules(username, {
      commands,
      scope,
      timeLimit: false,
      logCommands: true
    });

    const validation = await this.configManager.validateSudoersConfig(configContent);

    return {
      action: 'generate',
      username,
      scope,
      commands,
      dry_run: dryRun,
      config_content: configContent,
      validation,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 处理配置安装
   */
  async handleInstall(username, scope, commands, configName, dryRun = false) {
    if (!username) {
      throw new Error('必须指定用户名');
    }

    const configContent = this.configManager.generateSudoersRules(username, {
      commands,
      scope,
      timeLimit: false,
      logCommands: true
    });

    const installResult = await this.configManager.installSudoersConfig(configContent, {
      fileName: configName,
      backup: true,
      dryRun
    });

    return {
      action: 'install',
      username,
      scope,
      commands,
      config_name: configName,
      dry_run: dryRun,
      install_result: installResult,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 处理配置移除
   */
  async handleRemove(configName) {
    const removeResult = await this.configManager.removeSudoersConfig(configName, {
      backup: true
    });

    return {
      action: 'remove',
      config_name: configName,
      remove_result: removeResult,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 处理配置列表
   */
  async handleList() {
    const configs = await this.configManager.listSudoersConfigs();

    return {
      action: 'list',
      configs,
      total_count: configs.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 处理配置测试
   */
  async handleTest() {
    const testResult = await this.configManager.testSudoConfig();
    const status = await this.configManager.checkSudoStatus();

    return {
      action: 'test',
      test_result: testResult,
      current_status: status,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 处理安全建议
   */
  async handleRecommendations() {
    const recommendations = this.configManager.getSecurityRecommendations();
    const status = await this.configManager.checkSudoStatus();

    return {
      action: 'recommendations',
      current_status: status,
      security_recommendations: recommendations,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 格式化文本输出
   */
  formatTextOutput(action, result) {
    switch (action) {
      case 'status':
        return this.formatStatusOutput(result);
      case 'generate':
        return this.formatGenerateOutput(result);
      case 'install':
        return this.formatInstallOutput(result);
      case 'remove':
        return this.formatRemoveOutput(result);
      case 'list':
        return this.formatListOutput(result);
      case 'test':
        return this.formatTestOutput(result);
      case 'recommendations':
        return this.formatRecommendationsOutput(result);
      default:
        return JSON.stringify(result, null, 2);
    }
  }

  formatStatusOutput(result) {
    const { sudo_status } = result;
    
    let output = `Sudo配置状态检查:\n`;
    output += `平台: ${result.platform}\n`;
    output += `时间: ${result.timestamp}\n\n`;
    
    if (sudo_status.available) {
      output += `✓ Sudo可用\n`;
      output += `用户: ${sudo_status.currentUser}\n`;
      output += `在sudo组: ${sudo_status.inSudoGroup ? '是' : '否'}\n`;
      output += `无密码sudo: ${sudo_status.hasNoPassword ? '已配置' : '未配置'}\n`;
      output += `配置文件: ${sudo_status.configFile}\n`;
      output += `配置目录: ${sudo_status.configDir}\n`;
    } else {
      output += `✗ Sudo不可用: ${sudo_status.error}\n`;
    }
    
    return output;
  }

  formatGenerateOutput(result) {
    let output = `Sudo配置生成结果:\n`;
    output += `用户: ${result.username}\n`;
    output += `权限范围: ${result.scope}\n`;
    output += `自定义命令: ${result.commands.length > 0 ? result.commands.join(', ') : '无'}\n`;
    output += `验证状态: ${result.validation.valid ? '✓ 通过' : '✗ 失败'}\n\n`;
    
    if (result.validation.valid) {
      output += `生成的配置:\n`;
      output += `${'='.repeat(60)}\n`;
      output += `${result.config_content}\n`;
      output += `${'='.repeat(60)}\n`;
    } else {
      output += `验证错误: ${result.validation.error}\n`;
    }
    
    return output;
  }

  formatInstallOutput(result) {
    let output = `Sudo配置安装结果:\n`;
    output += `用户: ${result.username}\n`;
    output += `配置名: ${result.config_name}\n`;
    output += `权限范围: ${result.scope}\n`;
    output += `模拟运行: ${result.dry_run ? '是' : '否'}\n\n`;
    
    const { install_result } = result;
    output += `操作: ${install_result.action}\n`;
    
    if (install_result.action === 'installed') {
      output += `✓ 配置已安装\n`;
      output += `配置路径: ${install_result.configPath}\n`;
      if (install_result.backupPath) {
        output += `备份路径: ${install_result.backupPath}\n`;
      }
    } else if (install_result.action === 'dry-run') {
      output += `✓ 模拟运行完成\n`;
      output += `将安装到: ${install_result.configPath}\n`;
    }
    
    return output;
  }

  formatRemoveOutput(result) {
    let output = `Sudo配置移除结果:\n`;
    output += `配置名: ${result.config_name}\n\n`;
    
    const { remove_result } = result;
    output += `操作: ${remove_result.action}\n`;
    
    if (remove_result.action === 'removed') {
      output += `✓ 配置已移除\n`;
      output += `配置路径: ${remove_result.configPath}\n`;
      if (remove_result.backupPath) {
        output += `备份路径: ${remove_result.backupPath}\n`;
      }
    } else if (remove_result.action === 'not-found') {
      output += `ℹ 配置文件不存在\n`;
      output += `路径: ${remove_result.configPath}\n`;
    }
    
    return output;
  }

  formatListOutput(result) {
    let output = `Sudoers配置列表:\n`;
    output += `总数: ${result.total_count}\n\n`;
    
    if (result.configs.length === 0) {
      output += `未找到任何配置文件\n`;
    } else {
      result.configs.forEach((config, index) => {
        output += `${index + 1}. ${config.fileName}\n`;
        output += `   权限: ${config.permissions}\n`;
        output += `   大小: ${config.size}\n`;
        output += `   路径: ${config.path}\n`;
        if (config.preview) {
          output += `   预览:\n`;
          config.preview.split('\n').forEach(line => {
            if (line.trim()) output += `     ${line}\n`;
          });
        }
        output += `\n`;
      });
    }
    
    return output;
  }

  formatTestOutput(result) {
    let output = `Sudo配置测试结果:\n`;
    
    const { test_result, current_status } = result;
    output += `测试状态: ${test_result.success ? '✓ 通过' : '✗ 失败'}\n`;
    output += `测试命令: ${test_result.command}\n`;
    
    if (test_result.success) {
      output += `响应时间: ${test_result.duration}ms\n`;
    } else {
      output += `错误信息: ${test_result.error}\n`;
    }
    
    output += `\n当前sudo状态:\n`;
    output += `无密码sudo: ${current_status.hasNoPassword ? '已配置' : '未配置'}\n`;
    output += `在sudo组: ${current_status.inSudoGroup ? '是' : '否'}\n`;
    
    return output;
  }

  formatRecommendationsOutput(result) {
    let output = `Sudo安全建议:\n\n`;
    
    const { security_recommendations } = result;
    
    output += `基本建议:\n`;
    security_recommendations.recommendations.forEach((rec, index) => {
      output += `${index + 1}. ${rec}\n`;
    });
    
    output += `\n安全注意事项:\n`;
    security_recommendations.security_notes.forEach((note, index) => {
      output += `${index + 1}. ${note}\n`;
    });
    
    output += `\n最佳实践:\n`;
    security_recommendations.best_practices.forEach((practice, index) => {
      output += `${index + 1}. ${practice}\n`;
    });
    
    return output;
  }
}

module.exports = SudoConfigTool;