/**
 * 端到端测试：模拟 MCP 服务器的工作目录处理流程
 */

const { instances, getToolInstance } = require('../tools/registry.js');
const path = require('path');
const fs = require('fs');

async function simulateMCPCall(toolName, args) {
    const tool = getToolInstance(toolName);
    if (!tool) {
        throw new Error(`未知工具: ${toolName}`);
    }
    return await tool.handle(args);
}

async function runE2ETests() {
    console.log('开始端到端测试...\n');
    
    const workspaceManager = instances.workspace_manager;
    const projectRoot = path.join(__dirname, '..');
    
    let passed = 0;
    let failed = 0;
    
    // 测试1: 模拟用户通过对话设置工作目录
    try {
        console.log('测试1: 模拟用户对话设置工作目录');
        
        // 模拟 index.js 中的解析逻辑
        const userInput = `当前工作目录是：${projectRoot}`;
        const parsedPath = workspaceManager.parseWorkspaceCommand(userInput);
        
        if (!parsedPath) {
            throw new Error('未能解析工作目录命令');
        }
        
        const success = workspaceManager.setTempWorkspace(parsedPath);
        if (!success) {
            throw new Error('设置工作目录失败');
        }
        
        console.log(`✓ 成功通过对话设置工作目录: ${parsedPath}\n`);
        passed++;
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 测试2: 使用工作目录读取文件（相对路径）
    try {
        console.log('测试2: 使用相对路径读取文件');
        
        const currentWorkspace = workspaceManager.getCurrentWorkspace();
        const result = await simulateMCPCall('file_operation', {
            operation: 'read',
            path: 'package.json',
            working_directory: currentWorkspace,
            output_format: 'json'
        });
        
        if (!result.content || !result.content[0] || !result.content[0].json) {
            throw new Error('文件读取失败');
        }
        
        const data = result.content[0].json;
        if (!data.content.includes('ax-local-operations-mcp')) {
            throw new Error('读取的文件内容不正确');
        }
        
        console.log('✓ 成功使用相对路径读取文件\n');
        passed++;
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 测试3: 通过 workspace_manager 工具查询状态
    try {
        console.log('测试3: 通过 MCP 工具查询工作目录状态');
        
        const result = await simulateMCPCall('workspace_manager', {
            operation: 'status',
            output_format: 'json'
        });
        
        if (!result.content || !result.content[0] || result.content[0].type !== 'json') {
            throw new Error('状态查询失败');
        }
        
        const status = result.content[0].json;
        if (!status.currentWorkspace) {
            throw new Error('状态信息不完整');
        }
        
        console.log('✓ 成功查询工作目录状态\n');
        passed++;
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 测试4: 通过 workspace_manager 工具设置临时工作目录
    try {
        console.log('测试4: 通过 MCP 工具设置临时工作目录');
        
        const testDir = path.join(__dirname, 'temp-e2e');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        
        const result = await simulateMCPCall('workspace_manager', {
            operation: 'set_temp',
            workspace_path: testDir,
            output_format: 'json'
        });
        
        if (!result.content || !result.content[0] || result.content[0].type !== 'json') {
            throw new Error('设置临时工作目录失败');
        }
        
        const current = workspaceManager.getCurrentWorkspace();
        if (current !== testDir) {
            throw new Error(`工作目录未正确设置: ${current}`);
        }
        
        console.log('✓ 成功通过 MCP 工具设置临时工作目录\n');
        passed++;
        
        // 清理
        fs.rmdirSync(testDir);
        workspaceManager.clearTempWorkspace();
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 测试5: 测试工作目录在清除后恢复默认值
    try {
        console.log('测试5: 测试工作目录清除功能');
        
        workspaceManager.setTempWorkspace(projectRoot);
        const beforeClear = workspaceManager.getCurrentWorkspace();
        
        if (beforeClear !== projectRoot) {
            throw new Error('临时工作目录未正确设置');
        }
        
        workspaceManager.clearTempWorkspace();
        const afterClear = workspaceManager.getCurrentWorkspace();
        
        if (afterClear === projectRoot) {
            throw new Error('清除后工作目录未恢复默认值');
        }
        
        console.log('✓ 工作目录清除功能正常\n');
        passed++;
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 测试6: 测试多个参数中的工作目录命令解析
    try {
        console.log('测试6: 多参数中的工作目录命令解析');
        
        // 模拟 index.js 中的递归检查逻辑
        const args = {
            operation: 'read',
            path: 'test.txt',
            content: `当前工作目录是：${projectRoot}`
        };
        
        let workspacePath = null;
        function checkForWorkspaceCommand(obj) {
            if (typeof obj === 'string') {
                const parsedPath = workspaceManager.parseWorkspaceCommand(obj);
                if (parsedPath) {
                    workspacePath = parsedPath;
                }
            } else if (typeof obj === 'object' && obj !== null) {
                for (const key in obj) {
                    checkForWorkspaceCommand(obj[key]);
                    if (workspacePath) break;
                }
            }
        }
        
        checkForWorkspaceCommand(args);
        
        if (!workspacePath) {
            throw new Error('未能从参数中解析工作目录命令');
        }
        
        if (workspacePath !== projectRoot) {
            throw new Error(`解析的路径不正确: ${workspacePath}`);
        }
        
        console.log('✓ 成功从多个参数中解析工作目录命令\n');
        passed++;
    } catch (error) {
        console.error('✗ 测试失败:', error.message, '\n');
        failed++;
    }
    
    // 输出测试结果
    console.log('================================================================================');
    console.log('端到端测试完成');
    console.log('================================================================================');
    console.log(`总测试数: ${passed + failed}`);
    console.log(`通过: ${passed} (${Math.round(passed / (passed + failed) * 100)}%)`);
    console.log(`失败: ${failed} (${Math.round(failed / (passed + failed) * 100)}%)`);
    console.log('================================================================================\n');
    
    if (passed === passed + failed) {
        console.log('✓ 所有端到端测试通过！');
        console.log('✓ workspaceManager.parseWorkspaceCommand 方法正常工作');
        console.log('✓ 本地文件系统访问功能正常');
        console.log('✓ 所有 ax-local-operations-mcp 工具可以正常使用\n');
    }
    
    return failed === 0;
}

// 运行测试
runE2ETests()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
