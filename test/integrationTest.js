#!/usr/bin/env node

/**
 * 集成测试脚本
 * 验证跨平台改进工作是否正确集成到现有MCP系统中
 */

const { instances, descriptors } = require('../tools/registry');
const platformUtils = require('../lib/platformUtils');

/**
 * 集成测试运行器
 */
class IntegrationTest {
  constructor() {
    this.results = {
      toolRegistry: { passed: 0, failed: 0, details: [] },
      platformIntegration: { passed: 0, failed: 0, details: [] },
      functionality: { passed: 0, failed: 0, details: [] }
    };
  }

  async run() {
    console.log('='.repeat(60));
    console.log('        MCP 跨平台兼容性集成验证');
    console.log('='.repeat(60));
    console.log();

    await this.testToolRegistry();
    await this.testPlatformIntegration();
    await this.testFunctionality();

    this.printSummary();
    
    // 返回是否所有测试都通过
    const totalFailed = Object.values(this.results).reduce((sum, category) => sum + category.failed, 0);
    return totalFailed === 0;
  }

  /**
   * 测试工具注册表
   */
  async testToolRegistry() {
    console.log('1. 工具注册表测试');
    console.log('-'.repeat(30));

    // 检查所有工具是否正确注册
    const expectedTools = [
      'file_operation', 'file_edit', 'file_search', 'file_compare',
      'file_hash', 'file_permissions', 'file_archive', 'file_watch',
      'execute_command', 'task_manager', 'time_tool', 'environment_memory'
    ];

    if (platformUtils.isLinux) {
      expectedTools.push('sudo_config');
    }

    for (const toolName of expectedTools) {
      if (instances[toolName]) {
        this.addResult('toolRegistry', 'passed', `工具 ${toolName} 已注册`);
        console.log(`✓ ${toolName}`);
      } else {
        this.addResult('toolRegistry', 'failed', `工具 ${toolName} 未注册`);
        console.log(`✗ ${toolName}`);
      }
    }

    // 检查描述符
    const expectedDescriptorCount = expectedTools.length;
    const actualDescriptorCount = descriptors.length;
    
    if (actualDescriptorCount >= expectedDescriptorCount) {
      this.addResult('toolRegistry', 'passed', `描述符数量正确: ${actualDescriptorCount}`);
      console.log(`✓ 描述符数量: ${actualDescriptorCount}`);
    } else {
      this.addResult('toolRegistry', 'failed', `描述符数量不足: 期望 ${expectedDescriptorCount}, 实际 ${actualDescriptorCount}`);
      console.log(`✗ 描述符数量不足`);
    }

    console.log();
  }

  /**
   * 测试平台集成
   */
  async testPlatformIntegration() {
    console.log('2. 平台集成测试');
    console.log('-'.repeat(30));

    // 测试平台检测
    const platformInfo = platformUtils.getPlatformInfo();
    if (platformInfo && platformInfo.platform) {
      this.addResult('platformIntegration', 'passed', `平台检测: ${platformInfo.platform}`);
      console.log(`✓ 平台检测: ${platformInfo.platform}`);
    } else {
      this.addResult('platformIntegration', 'failed', '平台检测失败');
      console.log('✗ 平台检测失败');
    }

    // 测试路径处理增强
    try {
      const { resolveUserPath } = require('../lib/pathUtils');
      const testPath = resolveUserPath('test.txt');
      if (testPath) {
        this.addResult('platformIntegration', 'passed', '增强路径处理可用');
        console.log('✓ 增强路径处理');
      }
    } catch (error) {
      this.addResult('platformIntegration', 'failed', `路径处理错误: ${error.message}`);
      console.log('✗ 增强路径处理');
    }

    // 测试命令策略增强
    try {
      const { evaluate } = require('../lib/commandPolicy');
      const result = await evaluate('test command');
      if (result && typeof result.level === 'string') {
        this.addResult('platformIntegration', 'passed', '增强命令策略可用');
        console.log('✓ 增强命令策略');
      }
    } catch (error) {
      this.addResult('platformIntegration', 'failed', `命令策略错误: ${error.message}`);
      console.log('✗ 增强命令策略');
    }

    // 测试权限管理
    try {
      const { CrossPlatformPermissionManager } = require('../lib/crossPlatformPermissions');
      const manager = new CrossPlatformPermissionManager();
      if (manager) {
        this.addResult('platformIntegration', 'passed', '跨平台权限管理可用');
        console.log('✓ 跨平台权限管理');
      }
    } catch (error) {
      this.addResult('platformIntegration', 'failed', `权限管理错误: ${error.message}`);
      console.log('✗ 跨平台权限管理');
    }

    // Linux特定测试
    if (platformUtils.isLinux) {
      try {
        const SudoConfigTool = require('../tools/sudoConfig');
        const mockValidator = { isPathAllowed: () => true };
        const sudoTool = new SudoConfigTool(mockValidator);
        if (sudoTool) {
          this.addResult('platformIntegration', 'passed', 'Sudo配置工具可用');
          console.log('✓ Sudo配置工具');
        }
      } catch (error) {
        this.addResult('platformIntegration', 'failed', `Sudo配置工具错误: ${error.message}`);
        console.log('✗ Sudo配置工具');
      }
    } else {
      console.log('- Sudo配置工具 (仅Linux)');
    }

    console.log();
  }

  /**
   * 测试功能性
   */
  async testFunctionality() {
    console.log('3. 功能性测试');
    console.log('-'.repeat(30));

    // 测试增强的文件权限工具
    try {
      const filePermTool = instances.file_permissions;
      if (filePermTool && filePermTool.permissionManager) {
        this.addResult('functionality', 'passed', '文件权限工具集成跨平台功能');
        console.log('✓ 文件权限工具增强');
      } else {
        this.addResult('functionality', 'failed', '文件权限工具未集成跨平台功能');
        console.log('✗ 文件权限工具增强');
      }
    } catch (error) {
      this.addResult('functionality', 'failed', `文件权限工具测试失败: ${error.message}`);
      console.log('✗ 文件权限工具增强');
    }

    // 测试增强的文件监控工具
    try {
      const fileWatchTool = instances.file_watch;
      if (fileWatchTool && typeof fileWatchTool.supportsRecursiveWatch === 'function') {
        const recursiveSupport = fileWatchTool.supportsRecursiveWatch();
        this.addResult('functionality', 'passed', `文件监控工具支持递归检测: ${recursiveSupport}`);
        console.log('✓ 文件监控工具增强');
      } else {
        this.addResult('functionality', 'failed', '文件监控工具未集成增强功能');
        console.log('✗ 文件监控工具增强');
      }
    } catch (error) {
      this.addResult('functionality', 'failed', `文件监控工具测试失败: ${error.message}`);
      console.log('✗ 文件监控工具增强');
    }

    // 测试命令执行工具
    try {
      const cmdTool = instances.execute_command;
      if (cmdTool) {
        this.addResult('functionality', 'passed', '命令执行工具可用');
        console.log('✓ 命令执行工具');
      }
    } catch (error) {
      this.addResult('functionality', 'failed', `命令执行工具测试失败: ${error.message}`);
      console.log('✗ 命令执行工具');
    }

    // 测试所有工具的handle方法
    let toolsWithHandle = 0;
    let totalTools = 0;
    
    for (const [toolName, tool] of Object.entries(instances)) {
      totalTools++;
      if (typeof tool.handle === 'function') {
        toolsWithHandle++;
      }
    }

    if (toolsWithHandle === totalTools) {
      this.addResult('functionality', 'passed', `所有工具都有handle方法: ${toolsWithHandle}/${totalTools}`);
      console.log(`✓ 工具接口一致性: ${toolsWithHandle}/${totalTools}`);
    } else {
      this.addResult('functionality', 'failed', `部分工具缺少handle方法: ${toolsWithHandle}/${totalTools}`);
      console.log(`✗ 工具接口一致性: ${toolsWithHandle}/${totalTools}`);
    }

    console.log();
  }

  /**
   * 添加测试结果
   */
  addResult(category, status, message) {
    this.results[category][status]++;
    this.results[category].details.push({ status, message });
  }

  /**
   * 打印测试总结
   */
  printSummary() {
    console.log('4. 测试总结');
    console.log('-'.repeat(30));

    let totalPassed = 0;
    let totalFailed = 0;

    for (const [category, result] of Object.entries(this.results)) {
      const total = result.passed + result.failed;
      const successRate = total > 0 ? Math.round((result.passed / total) * 100) : 0;
      
      console.log(`${category}: ${result.passed}/${total} (${successRate}%)`);
      
      totalPassed += result.passed;
      totalFailed += result.failed;
    }

    const grandTotal = totalPassed + totalFailed;
    const overallRate = grandTotal > 0 ? Math.round((totalPassed / grandTotal) * 100) : 0;

    console.log();
    console.log('总体结果:');
    console.log(`通过: ${totalPassed}`);
    console.log(`失败: ${totalFailed}`);
    console.log(`成功率: ${overallRate}%`);

    if (totalFailed === 0) {
      console.log();
      console.log('🎉 所有集成测试通过！跨平台兼容性改进已成功集成。');
    } else {
      console.log();
      console.log('⚠️  发现集成问题，请检查失败的测试项目。');
    }

    console.log();
    console.log('平台信息:');
    console.log(`- 操作系统: ${platformUtils.getPlatformInfo().platform}`);
    console.log(`- 架构: ${platformUtils.getPlatformInfo().architecture}`);
    console.log(`- Node.js: ${platformUtils.getPlatformInfo().nodeVersion}`);
    console.log();
  }
}

/**
 * 主函数
 */
async function main() {
  const integrationTest = new IntegrationTest();
  const success = await integrationTest.run();
  
  process.exit(success ? 0 : 1);
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(error => {
    console.error('集成测试失败:', error);
    process.exit(1);
  });
}

module.exports = IntegrationTest;