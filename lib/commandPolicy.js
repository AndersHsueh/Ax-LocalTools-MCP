const platformUtils = require('./platformUtils');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * 跨平台命令策略
 * Agent 全控授权模式：仅拦截不可恢复的系统破坏操作。
 */

const UNIX_DENY = [
  /\brm\s+(-[a-z]*f[a-z]*\s+)*-rf\s+\/\s*$/i,
  /\brm\s+(-[a-z]*f[a-z]*\s+)*-rf\s+\/\*/i,
  /:\(\)\s*\{.*:\|.*&.*\}/,
  /\bdd\s+.*of=\/dev\/(sd[a-z]|nvme[0-9]|hd[a-z])\b/i,
  /\bmkfs\b/i,
];

const WINDOWS_DENY = [
  /\bformat\s+[c-zC-Z]:\s*(\/[a-z]+\s*)*(\/y\s*)?$/i,
  /\bdel\s+.*\/[sqSQ].*[cC]:\\[Ww]indows\b/i,
  /\brd\s+\/s\s+\/q\s+[cC]:\\[Ww]indows\b/i,
  /\brmdir\s+\/s\s+\/q\s+[cC]:\\[Ww]indows\b/i,
  /Remove-Item\s+.*-Recurse.*[cC]:\\[Ww]indows\b/i,
];

async function checkSudoConfig() {
  if (!platformUtils.isLinux) {
    return { available: false, noPassword: false, reason: '仅支持Linux系统' };
  }
  try {
    await execAsync('which sudo');
    try {
      await execAsync('sudo -n true', { timeout: 3000 });
      return { available: true, noPassword: true, reason: '已配置无密码sudo' };
    } catch {
      return { available: true, noPassword: false, reason: '需要密码验证' };
    }
  } catch {
    return { available: false, noPassword: false, reason: 'sudo未安装或不可用' };
  }
}

function identifyCommandType(command) {
  const cmd = command.trim().toLowerCase();
  if (cmd.startsWith('powershell') || cmd.startsWith('pwsh')) {
    return { type: 'powershell', platform: 'windows', shell: 'powershell' };
  }
  if (platformUtils.isWindows && (cmd.startsWith('cmd') || /^[a-z]:\\/.test(cmd))) {
    return { type: 'cmd', platform: 'windows', shell: 'cmd' };
  }
  if (cmd.startsWith('bash') || cmd.startsWith('sh') || cmd.startsWith('zsh')) {
    return { type: 'shell', platform: 'unix', shell: cmd.split(' ')[0] };
  }
  return {
    type: platformUtils.isWindows ? 'powershell' : 'shell',
    platform: platformUtils.isWindows ? 'windows' : 'unix',
    shell: platformUtils.isWindows ? 'powershell' : 'bash'
  };
}

async function evaluate(command) {
  const cmd = command.trim();
  const cmdType = identifyCommandType(cmd);
  const base = { level: 'allow', reason: null, platform: cmdType.platform, commandType: cmdType.type, suggestions: [], sudoInfo: null };

  if (!cmd) return { ...base, level: 'deny', reason: '空命令' };

  const denyPatterns = platformUtils.isWindows ? WINDOWS_DENY : UNIX_DENY;
  if (denyPatterns.some(p => p.test(cmd))) {
    return { ...base, level: 'deny', reason: '禁止的极危险命令（不可恢复的系统破坏）' };
  }

  return base;
}

function getSecurityRecommendations() {
  return {
    platform: platformUtils.getPlatformInfo(),
    general: ['Agent全控授权模式：仅极少数不可恢复的系统破坏操作被拦截'],
    platform_specific: []
  };
}

const SUDOERS_TEMPLATES = {
  file_operations: {
    description: '允许无密码执行文件操作命令',
    rules: [
      'username ALL=(ALL) NOPASSWD: /bin/chmod, /bin/chown, /bin/mkdir',
      'username ALL=(ALL) NOPASSWD: /bin/cp, /bin/mv, /bin/rm'
    ]
  },
  service_management: {
    description: '允许无密码管理系统服务',
    rules: [
      'username ALL=(ALL) NOPASSWD: /bin/systemctl start, /bin/systemctl stop',
      'username ALL=(ALL) NOPASSWD: /bin/systemctl restart, /bin/systemctl reload'
    ]
  },
  network_config: {
    description: '允许无密码配置网络',
    rules: [
      'username ALL=(ALL) NOPASSWD: /sbin/iptables',
      'username ALL=(ALL) NOPASSWD: /usr/sbin/ufw'
    ]
  }
};

module.exports = { evaluate, checkSudoConfig, identifyCommandType, getSecurityRecommendations, SUDOERS_TEMPLATES, platformUtils };
