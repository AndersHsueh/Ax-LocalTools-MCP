#!/usr/bin/env node

/**
 * 工作目录管理功能测试脚本
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WorkspaceManager = require('../tools/workspaceManager');
const EnvironmentMemoryTool = require('../tools/environmentMemory');

// 创建测试用的安全验证器（模拟）
class MockSecurityValidator {
    constructor() {}
    isPathAllowed() { return true; }
    resolveAndAssert(path) { return path; }
}

// 测试结果
const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: []
};

// 测试函数
function runTest(description, testFn) {
    testResults.total++;
    try {
        testFn();
        testResults.passed++;
        console.log(`✓ ${description}`);
    } catch (error) {
        testResults.failed++;
        testResults.errors.push({ description, error: error.message });
        console.log(`✗ ${description}`);
        console.error(`  错误: ${error.message}`);
    }
}

// 清理测试数据
function cleanupTestData() {
    // 删除测试用的临时文件和目录
    const testPaths = [
        path.join(__dirname, 'test-workspace1'),
        path.join(__dirname, 'test-workspace2')
    ];
    
    testPaths.forEach(testPath => {
        if (fs.existsSync(testPath)) {
            try {
                fs.rmSync(testPath, { recursive: true });
            } catch (error) {
                console.error(`清理测试目录失败: ${testPath}, ${error.message}`);
            }
        }
    });
}

// 运行所有测试
async function runAllTests() {
    console.log('开始测试工作目录管理功能...\n');
    
    // 初始化工作目录管理器
    const securityValidator = new MockSecurityValidator();
    const workspaceManager = new WorkspaceManager(securityValidator);
    
    // 测试1: 解析工作目录命令
    runTest('解析工作目录命令', () => {
        const input = '当前工作目录是：C:\\Users\\test\\notes';
        const parsedPath = workspaceManager.parseWorkspaceCommand(input);
        assert.strictEqual(parsedPath, 'C:\\Users\\test\\notes');
    });
    
    // 测试2: 验证有效的工作目录
    runTest('验证有效的工作目录', () => {
        const testPath = path.join(__dirname, 'test-workspace1');
        const isValid = workspaceManager.validateWorkspace(testPath);
        assert.strictEqual(isValid, true);
        assert.strictEqual(fs.existsSync(testPath), true);
    });
    
    // 测试3: 设置和获取临时工作目录
    runTest('设置和获取临时工作目录', () => {
        const testPath = path.join(__dirname, 'test-workspace2');
        workspaceManager.setTempWorkspace(testPath);
        const currentWorkspace = workspaceManager.getCurrentWorkspace();
        assert.strictEqual(currentWorkspace, testPath);
    });
    
    // 测试4: 获取默认工作目录（临时目录清除后）
    runTest('获取默认工作目录', () => {
        workspaceManager.clearTempWorkspace();
        const defaultWorkspace = EnvironmentMemoryTool.getEnvironmentValue('DEFAULT_WORKSPACE');
        const currentWorkspace = workspaceManager.getCurrentWorkspace();
        assert.strictEqual(currentWorkspace, defaultWorkspace);
    });
    
    // 测试5: 工作目录状态信息
    runTest('获取工作目录状态信息', () => {
        const status = workspaceManager.getStatus();
        assert.ok(status);
        assert.ok(status.defaultWorkspace);
        assert.ok(status.currentWorkspace);
        assert.strictEqual(status.tempWorkspace, null);
    });
    
    // 测试6: 工具接口handle方法
    runTest('工具接口handle方法 - get_current', async () => {
        const result = await workspaceManager.handle({
            operation: 'get_current',
            output_format: 'json'
        });
        assert.ok(result);
        assert.ok(result.content);
        assert.strictEqual(result.content[0].type, 'json');
        assert.ok(result.content[0].json.current_workspace);
    });
    
    // 测试7: 设置临时工作目录的工具接口
    runTest('工具接口handle方法 - set_temp', async () => {
        const testPath = path.join(__dirname, 'test-workspace2');
        const result = await workspaceManager.handle({
            operation: 'set_temp',
            workspace_path: testPath,
            output_format: 'text'
        });
        assert.ok(result);
        assert.strictEqual(result.content[0].type, 'text');
        assert.ok(result.content[0].text.includes('成功设置临时工作目录'));
        
        // 验证临时目录确实被设置
        const currentWorkspace = workspaceManager.getCurrentWorkspace();
        assert.strictEqual(currentWorkspace, testPath);
    });
    
    // 清理测试数据
    cleanupTestData();
    
    console.log('\n测试完成！');
    console.log(`\n测试结果：`);
    console.log(`总测试用例数：${testResults.total}`);
    console.log(`通过：${testResults.passed}`);
    console.log(`失败：${testResults.failed}`);
    
    if (testResults.failed > 0) {
        console.log('\n失败详情：');
        testResults.errors.forEach((err, index) => {
            console.log(`${index + 1}. ${err.description}`);
            console.log(`   错误: ${err.error}`);
        });
        process.exit(1);
    } else {
        console.log('\n所有测试用例都通过了！');
        process.exit(0);
    }
}

// 执行测试
runAllTests();
