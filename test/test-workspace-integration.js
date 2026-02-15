/**
 * 工作目录管理集成测试
 * 测试 workspaceManager 与其他工具的集成
 */

const { instances } = require('../tools/registry.js');
const path = require('path');
const fs = require('fs');

async function runIntegrationTests() {
    console.log('开始工作目录管理集成测试...\n');
    
    const workspaceManager = instances.workspace_manager;
    const fileOperation = instances.file_operation;
    
    let passed = 0;
    let failed = 0;
    
    // 测试1: parseWorkspaceCommand 方法存在且可调用
    try {
        console.log('测试1: parseWorkspaceCommand 方法');
        if (typeof workspaceManager.parseWorkspaceCommand !== 'function') {
            throw new Error('parseWorkspaceCommand 不是一个函数');
        }
        
        const testInput = '当前工作目录是：D:/test/path';
        const result = workspaceManager.parseWorkspaceCommand(testInput);
        
        if (result !== 'D:/test/path') {
            throw new Error(`解析结果不正确: ${result}`);
        }
        
        console.log('✓ parseWorkspaceCommand 方法正常工作\n');
        passed++;
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 测试2: 设置临时工作目录
    try {
        console.log('测试2: 设置临时工作目录');
        const testDir = path.join(__dirname, 'temp-workspace');
        
        // 确保测试目录存在
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        
        const success = workspaceManager.setTempWorkspace(testDir);
        if (!success) {
            throw new Error('设置临时工作目录失败');
        }
        
        const current = workspaceManager.getCurrentWorkspace();
        if (current !== testDir) {
            throw new Error(`当前工作目录不正确: ${current}`);
        }
        
        console.log('✓ 临时工作目录设置成功\n');
        passed++;
        
        // 清理
        workspaceManager.clearTempWorkspace();
        fs.rmdirSync(testDir);
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 测试3: 工作目录与文件操作集成
    try {
        console.log('测试3: 工作目录与文件操作集成');
        const projectRoot = path.join(__dirname, '..');
        
        workspaceManager.setTempWorkspace(projectRoot);
        
        // 尝试读取 package.json（相对路径）
        const result = await fileOperation.handle({
            operation: 'read',
            path: 'package.json',
            working_directory: projectRoot,
            output_format: 'json'
        });
        
        if (!result.content || !result.content[0] || !result.content[0].json) {
            throw new Error('文件读取结果格式不正确');
        }
        
        const data = result.content[0].json;
        if (data.action !== 'read' || !data.content) {
            throw new Error('文件内容不正确');
        }
        
        console.log('✓ 工作目录与文件操作集成正常\n');
        passed++;
        
        // 清理
        workspaceManager.clearTempWorkspace();
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 测试4: 工作目录状态查询
    try {
        console.log('测试4: 工作目录状态查询');
        const status = workspaceManager.getStatus();
        
        if (!status || typeof status !== 'object') {
            throw new Error('状态查询返回格式不正确');
        }
        
        if (!('tempWorkspace' in status) || 
            !('defaultWorkspace' in status) || 
            !('currentWorkspace' in status)) {
            throw new Error('状态对象缺少必要字段');
        }
        
        console.log('✓ 工作目录状态查询正常\n');
        passed++;
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 测试5: handle 方法 - get_current 操作
    try {
        console.log('测试5: handle 方法 - get_current 操作');
        const result = await workspaceManager.handle({
            operation: 'get_current',
            output_format: 'json'
        });
        
        if (!result.content || !result.content[0] || result.content[0].type !== 'json') {
            throw new Error('返回格式不正确');
        }
        
        const data = result.content[0].json;
        if (!data.current_workspace) {
            throw new Error('缺少 current_workspace 字段');
        }
        
        console.log('✓ get_current 操作正常\n');
        passed++;
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 测试6: handle 方法 - status 操作
    try {
        console.log('测试6: handle 方法 - status 操作');
        const result = await workspaceManager.handle({
            operation: 'status',
            output_format: 'json'
        });
        
        if (!result.content || !result.content[0] || result.content[0].type !== 'json') {
            throw new Error('返回格式不正确');
        }
        
        const status = result.content[0].json;
        if (!('tempWorkspace' in status) || 
            !('defaultWorkspace' in status) || 
            !('currentWorkspace' in status)) {
            throw new Error('状态对象缺少必要字段');
        }
        
        console.log('✓ status 操作正常\n');
        passed++;
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 输出测试结果
    console.log('================================================================================');
    console.log('测试完成');
    console.log('================================================================================');
    console.log(`总测试数: ${passed + failed}`);
    console.log(`通过: ${passed} (${Math.round(passed / (passed + failed) * 100)}%)`);
    console.log(`失败: ${failed} (${Math.round(failed / (passed + failed) * 100)}%)`);
    console.log('================================================================================\n');
    
    return failed === 0;
}

// 运行测试
runIntegrationTests()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
