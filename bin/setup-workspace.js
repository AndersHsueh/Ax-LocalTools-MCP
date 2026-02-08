#!/usr/bin/env node

/**
 * 工作目录配置脚本
 * 在全局安装时自动运行，配置默认工作目录
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

// 导入环境记忆模块
const EnvironmentMemoryTool = require('../tools/environmentMemory.js');

// 创建readline接口
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 显示欢迎信息
function showWelcome() {
    console.log('\n*** ax-local-operation 是一个增强Cowork的MCP');
    console.log('*** 需要选择一个默认的工作目录');
    console.log('*** 也可以在对话中使用：`当前的工作目录是： xxxx` 来临时指定。\n');
}

// 检测可能的Obsidian笔记仓库路径
function detectObsidianPaths() {
    const possiblePaths = [];
    const homeDir = os.homedir();
    const commonNoteDirs = ['Documents', 'My Documents'];
    
    // 检测常见位置的Obsidian仓库
    commonNoteDirs.forEach(dirName => {
        const dirPath = path.join(homeDir, dirName);
        if (fs.existsSync(dirPath)) {
            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                entries.forEach(entry => {
                    if (entry.isDirectory()) {
                        const notePath = path.join(dirPath, entry.name);
                        // 检查是否有.obsidian目录
                        if (fs.existsSync(path.join(notePath, '.obsidian'))) {
                            possiblePaths.push(notePath);
                        }
                    }
                });
            } catch (error) {
                // 忽略权限错误等
            }
        }
    });
    
    return possiblePaths;
}

// 提供预设选项
function getPresetOptions() {
    const obsidianPaths = detectObsidianPaths();
    const defaultPath = path.join(os.homedir(), '.axlocalop', 'workspace');
    
    const options = [];
    
    // 添加检测到的Obsidian路径
    obsidianPaths.forEach((obsidianPath, index) => {
        options.push({ label: obsidianPath, value: obsidianPath, default: false });
    });
    
    // 添加示例预设选项
    options.push(
        { label: 'c:/users/a/a1note', value: 'c:/users/a/a1note', default: false },
        { label: 'd:/users/b/b1note', value: 'd:/users/b/b1note', default: false },
        { label: 'c:/user/projects/temp/note1', value: 'c:/user/projects/temp/note1', default: false }
    );
    
    // 添加默认选项
    options.push({ label: `使用 ${defaultPath}`, value: defaultPath, default: true });
    
    // 添加自定义输入选项
    options.push({ label: '输入一个默认的工作目录', value: 'custom', default: false });
    
    return options;
}

// 显示选项列表
function showOptions(options) {
    console.log('请选择默认工作目录：\n');
    options.forEach((option, index) => {
        const selected = option.default ? 'v' : ' ';
        console.log(`[${selected}] ${index + 1}. ${option.label}`);
    });
    console.log('\n使用上下方向键选择，按Enter键确认');
}

// 处理用户选择
function handleSelection(options, selectedIndex) {
    const selectedOption = options[selectedIndex];
    
    if (selectedOption.value === 'custom') {
        return new Promise((resolve) => {
            rl.question('请输入自定义工作目录路径： ', (customPath) => {
                resolve(customPath.trim());
            });
        });
    } else {
        return selectedOption.value;
    }
}

// 验证并创建工作目录
function validateAndCreateWorkspace(workspacePath) {
    try {
        // 确保路径存在
        fs.mkdirSync(workspacePath, { recursive: true });
        return true;
    } catch (error) {
        console.error(`\n错误：无法创建工作目录 ${workspacePath}`);
        console.error(`原因：${error.message}`);
        return false;
    }
}

// 保存配置
function saveConfiguration(workspacePath) {
    try {
        EnvironmentMemoryTool.updateEnvironment('DEFAULT_WORKSPACE', workspacePath, 'Default workspace directory');
        console.log(`\n✓ 已将默认工作目录设置为：${workspacePath}`);
        return true;
    } catch (error) {
        console.error(`\n错误：无法保存配置`);
        console.error(`原因：${error.message}`);
        return false;
    }
}

// 主函数
async function main() {
    showWelcome();
    
    const options = getPresetOptions();
    showOptions(options);
    
    // 处理用户选择（简化版，实际项目可能需要更好的终端交互库）
    rl.question('请输入选项编号： ', async (answer) => {
        const selectedIndex = parseInt(answer) - 1;
        
        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= options.length) {
            console.error('\n错误：无效的选项编号');
            rl.close();
            process.exit(1);
        }
        
        const workspacePath = await handleSelection(options, selectedIndex);
        
        if (validateAndCreateWorkspace(workspacePath)) {
            if (saveConfiguration(workspacePath)) {
                console.log('\n配置完成！');
            }
        }
        
        rl.close();
    });
}

// 执行主函数
main();