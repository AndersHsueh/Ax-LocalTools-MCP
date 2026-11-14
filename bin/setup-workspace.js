#!/usr/bin/env node

/**
 * 工作目录初始化脚本
 *
 * 由 package.json 的 postinstall 调用，因此必须满足三条：
 *   1. 非交互 —— npm 安装时 stdin 通常不是 TTY，rl.question 会立即 EOF，
 *      旧实现因此判为"无效选项编号"并 process.exit(1)，导致 npm i -g ELIFECYCLE；
 *   2. 幂等 —— 重复安装/升级不应覆盖用户已有配置；
 *   3. 永不失败 —— 目录权限问题不应让整个包安装失败。
 *
 * 默认模式只预创建目录，不写配置文件：全局安装常以 root/管理员身份执行，
 * 写进 root 家目录的配置对实际使用 MCP 的用户无效，交给运行时按需初始化即可。
 *
 * 需要手动选择工作目录时：node bin/setup-workspace.js --interactive
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { defaultWorkspacePath, updateEnvironment } = require('../tools/environmentMemory.js');

function targetPath() {
  return process.env.AXLOCALOP_DEFAULT_WORKSPACE || defaultWorkspacePath();
}

/** postinstall 入口：静默、无副作用地保证工作区存在 */
function nonInteractive() {
  const target = targetPath();
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (error) {
    // 安装阶段只做尽力而为的初始化，绝不阻断 npm
    console.warn(`[ax-local-operations-mcp] 无法预创建工作目录（可忽略）: ${error.message}`);
  }
  return 0;
}

/** 显式交互模式：供用户手动配置，不参与安装流程 */
function interactive() {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const fallback = targetPath();

  const options = [fallback];
  // 顺带探测本机常见的 Obsidian 笔记库，方便直接选用
  for (const dirName of ['Documents', 'My Documents']) {
    const dirPath = path.join(os.homedir(), dirName);
    if (!fs.existsSync(dirPath)) continue;
    try {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const notePath = path.join(dirPath, entry.name);
          if (fs.existsSync(path.join(notePath, '.obsidian'))) options.push(notePath);
        }
      }
    } catch {
      // 无权读取时跳过
    }
  }

  console.log('\n请选择默认工作目录（直接回车使用第 1 项）:\n');
  options.forEach((p, i) => console.log(`  ${i + 1}. ${p}${i === 0 ? '  [默认]' : ''}`));
  console.log(`  ${options.length + 1}. 手动输入路径\n`);

  rl.question('请输入选项编号: ', (answer) => {
    const index = parseInt(String(answer || '1').trim(), 10) - 1;
    let workspacePath = fallback;

    if (index >= 0 && index < options.length) {
      workspacePath = options[index];
    } else if (index === options.length) {
      // 简化处理：这一项在管道输入下无法二次追问，提示用环境变量指定
      console.log('请使用 AXLOCALOP_DEFAULT_WORKSPACE 环境变量指定自定义路径后重新运行。');
      rl.close();
      return;
    } else if (String(answer || '').trim() !== '') {
      console.error('无效的选项编号，已使用默认工作目录。');
    }

    try {
      fs.mkdirSync(workspacePath, { recursive: true });
      updateEnvironment('DEFAULT_WORKSPACE', workspacePath, 'Default workspace directory');
      console.log(`\n✓ 默认工作目录已设置为: ${workspacePath}`);
    } catch (error) {
      console.error(`\n配置失败: ${error.message}`);
      process.exitCode = 1;
    }
    rl.close();
  });
}

if (process.argv.includes('--interactive')) {
  interactive();
} else {
  process.exitCode = nonInteractive();
}
