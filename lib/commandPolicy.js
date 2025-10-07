const platformUtils = require('./platformUtils');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * 跨平台命令策略系统
 * 支持Windows、Linux、macOS不同平台的安全命令检测
 */

// Unix/Linux 危险命令模式
const UNIX_DENY = [
  /\bpasswd\b/i,
  /\bsu\s+/i,                    // su 切换用户
  /\buserdel\b/i,               // 删除用户
  /\buseradd\b/i,               // 添加用户
  /\bfdisk\b/i,                 // 磁盘分区
  /\bmkfs\b/i,                  // 创建文件系统
  /\bmount.*\s+\/\s*/i,         // 挂载到根目录
  /\breboot\b/i,                // 重启系统
  /\bshutdown\b/i,              // 关闭系统
  /\bkillall\s+-9/i,           // 强制杀死所有进程
];

const UNIX_WARN = [
  /\brm\s+-rf\b/i,              // 递归删除
  /\brm\s+.*\/\*/i,            // 删除通配符文件
  /\bsudo\b/i,                 // sudo命令
  /\bchown\b/i,                // 修改所有者
  /chmod\s+777/i,              // 设置全权限
  /\bchmod\s+.*7.*7.*7/i,      // 另一种777模式
  /\bdiskutil\b/i,             // macOS磁盘工具
  /\bsystemctl\s+(stop|disable|mask)/i, // 停止系统服务
  /\bservice\s+.*\s+(stop|restart)/i,   // 停止服务
  /\bcrontab\s+-r/i,           // 删除定时任务
  /\biptables\s+-F/i,          // 清空防火墙规则
  /\bufw\s+(disable|reset)/i,  // Ubuntu防火墙
];

// Windows 危险命令模式
const WINDOWS_DENY = [
  /\bformat\s+[c-zC-Z]:/i,      // 格式化磁盘
  /\bdiskpart\b/i,             // 磁盘分区工具
  /\bsfc\s+\/scannow/i,        // 系统文件检查
  /\bdism\b/i,                 // 部署映像管理
  /\bnet\s+user\s+.*\/delete/i, // 删除用户
  /\bnet\s+user\s+.*\/add/i,    // 添加用户
  /\breg\s+delete\s+HKLM/i,    // 删除注册表HKLM
  /\bshutdown\s+\/s/i,         // 关机
  /\bshutdown\s+\/r/i,         // 重启
  /\btaskkill\s+\/f\s+\/im\s+explorer.exe/i, // 杀死资源管理器
];

const WINDOWS_WARN = [
  /\bdel\s+\/f\s+\/s\s+\/q/i,   // 递归强制删除
  /\brmdir\s+\/s/i,            // 递归删除目录
  /\brd\s+\/s/i,               // 递归删除目录
  /\btakeown\s+\/f/i,          // 获取所有权
  /\bicacls\s+.*\/grant/i,     // 授予权限
  /\battrib\s+.*\+[rhs]/i,     // 修改文件属性
  /\bnetsh\s+firewall/i,       // 修改防火墙
  /\bpowershell\s+.*Remove-Item.*-Recurse/i, // PowerShell递归删除
  /\bpowershell\s+.*Stop-Service/i,          // 停止服务
  /\bpowershell\s+.*Disable-WindowsOptionalFeature/i, // 禁用功能
  /\btaskkill\s+\/f/i,         // 强制终止进程
  /\breg\s+add\s+HKLM/i,       // 修改注册表HKLM
];

// PowerShell 特定危险命令
const POWERSHELL_DENY = [
  /Remove-Computer/i,           // 移除计算机域
  /Reset-ComputerMachinePassword/i, // 重置机器密码
  /Clear-EventLog/i,            // 清空事件日志
  /Remove-WindowsFeature/i,     // 移除Windows功能
  /Uninstall-WindowsFeature/i,  // 卸载Windows功能
];

const POWERSHELL_WARN = [
  /Stop-Computer/i,             // 关机
  /Restart-Computer/i,          // 重启
  /Remove-Item.*-Recurse/i,     // 递归删除
  /Stop-Service/i,              // 停止服务
  /Set-ExecutionPolicy/i,       // 修改执行策略
  /New-LocalUser/i,             // 创建本地用户
  /Remove-LocalUser/i,          // 删除本地用户
];

/**
 * 检查sudo是否可用且配置了无密码访问
 * @returns {Promise<Object>} sudo配置状态
 */
async function checkSudoConfig() {
  if (!platformUtils.isLinux) {
    return {
      available: false,
      noPassword: false,
      reason: '仅支持Linux系统'
    };
  }

  try {
    // 检查sudo是否安装
    await execAsync('which sudo');
    
    // 检查当前用户是否可以无密码使用sudo
    try {
      await execAsync('sudo -n true', { timeout: 3000 });
      return {
        available: true,
        noPassword: true,
        reason: '已配置无密码sudo'
      };
    } catch (error) {
      return {
        available: true,
        noPassword: false,
        reason: '需要密码验证',
        suggestion: '可以配置sudoers文件实现无密码sudo'
      };
    }
  } catch (error) {
    return {
      available: false,
      noPassword: false,
      reason: 'sudo未安装或不可用'
    };
  }
}

/**
 * 识别命令类型
 * @param {string} command - 命令字符串
 * @returns {Object} 命令类型信息
 */
function identifyCommandType(command) {
  const cmd = command.trim().toLowerCase();
  
  // PowerShell检测
  if (cmd.startsWith('powershell') || cmd.startsWith('pwsh')) {
    return {
      type: 'powershell',
      platform: 'windows',
      shell: 'powershell'
    };
  }
  
  // CMD检测
  if (platformUtils.isWindows && (cmd.startsWith('cmd') || /^[a-z]:\\/.test(cmd))) {
    return {
      type: 'cmd',
      platform: 'windows',
      shell: 'cmd'
    };
  }
  
  // Unix shell检测
  if (cmd.startsWith('bash') || cmd.startsWith('sh') || cmd.startsWith('zsh')) {
    return {
      type: 'shell',
      platform: 'unix',
      shell: cmd.split(' ')[0]
    };
  }
  
  // 默认类型
  return {
    type: platformUtils.isWindows ? 'cmd' : 'shell',
    platform: platformUtils.isWindows ? 'windows' : 'unix',
    shell: platformUtils.isWindows ? 'cmd' : 'bash'
  };
}

/**
 * 评估命令安全性
 * @param {string} command - 要评估的命令
 * @param {Object} options - 选项
 * @param {boolean} options.allowSudo - 是否允许sudo命令
 * @param {boolean} options.checkSudoConfig - 是否检查sudo配置
 * @returns {Promise<Object>} 评估结果
 */
async function evaluate(command, options = {}) {
  const { allowSudo = false, checkSudoConfig: checkSudo = false } = options;
  const cmd = command.trim();
  const cmdType = identifyCommandType(cmd);
  
  const result = {
    level: 'allow',
    reason: null,
    platform: cmdType.platform,
    commandType: cmdType.type,
    suggestions: [],
    sudoInfo: null
  };
  
  // 空命令检查
  if (!cmd) {
    result.level = 'deny';
    result.reason = '空命令';
    return result;
  }
  
  // 根据平台选择对应的检查规则
  let denyPatterns = [];
  let warnPatterns = [];
  
  if (platformUtils.isWindows) {
    denyPatterns = [...WINDOWS_DENY];
    warnPatterns = [...WINDOWS_WARN];
    
    // PowerShell特定检查
    if (cmdType.type === 'powershell') {
      denyPatterns.push(...POWERSHELL_DENY);
      warnPatterns.push(...POWERSHELL_WARN);
    }
  } else {
    denyPatterns = [...UNIX_DENY];
    warnPatterns = [...UNIX_WARN];
  }
  
  // 检查拒绝列表
  for (const pattern of denyPatterns) {
    if (pattern.test(cmd)) {
      result.level = 'deny';
      result.reason = '禁止的危险命令';
      return result;
    }
  }
  
  // 检查警告列表
  for (const pattern of warnPatterns) {
    if (pattern.test(cmd)) {
      // sudo特定处理
      if (/\bsudo\b/i.test(cmd)) {
        if (checkSudo) {
          result.sudoInfo = await checkSudoConfig();
        }
        
        if (!allowSudo) {
          result.level = 'warn';
          result.reason = 'sudo命令需要特殊权限';
          result.suggestions.push('如果在Linux系统上，请考虑配置sudoers文件');
          result.suggestions.push('或者使用allowSudo选项允许sudo命令');
          return result;
        } else if (result.sudoInfo && !result.sudoInfo.noPassword) {
          result.level = 'warn';
          result.reason = 'sudo需要密码验证，可能导致阻塞';
          result.suggestions.push('建议配置无密码sudo以提高自动化程度');
          return result;
        }
      } else {
        result.level = 'warn';
        result.reason = '高风险命令';
        return result;
      }
    }
  }
  
  return result;
}

/**
 * 获取平台特定的安全建议
 * @returns {Object} 安全建议
 */
function getSecurityRecommendations() {
  const recommendations = {
    platform: platformUtils.getPlatformInfo(),
    general: [
      '避免使用具有系统级影响的命令',
      '在执行高风险命令前进行备份',
      '使用最小权限原则'
    ],
    platform_specific: []
  };
  
  if (platformUtils.isWindows) {
    recommendations.platform_specific = [
      '避免使用diskpart、format等磁盘操作命令',
      '谨慎使用PowerShell的Remove-*命令',
      '不要随意修改注册表HKLM分支',
      '使用icacls时请明确指定路径和权限'
    ];
  } else if (platformUtils.isLinux) {
    recommendations.platform_specific = [
      '配置sudoers文件以支持无密码sudo（限定命令）',
      '避免使用rm -rf对重要目录操作',
      '谨慎使用systemctl停止核心服务',
      '使用chmod时避免777权限'
    ];
  } else if (platformUtils.isMacOS) {
    recommendations.platform_specific = [
      '谨慎使用diskutil命令',
      '避免修改系统目录权限',
      '使用launchctl时注意服务依赖关系'
    ];
  }
  
  return recommendations;
}

/**
 * 可用的无密码sudo配置模板
 */
const SUDOERS_TEMPLATES = {
  // 基本文件操作
  file_operations: {
    description: '允许无密码执行文件操作命令',
    rules: [
      'username ALL=(ALL) NOPASSWD: /bin/chmod, /bin/chown, /bin/mkdir',
      'username ALL=(ALL) NOPASSWD: /bin/cp, /bin/mv, /bin/rm'
    ]
  },
  // 系统服务管理
  service_management: {
    description: '允许无密码管理系统服务',
    rules: [
      'username ALL=(ALL) NOPASSWD: /bin/systemctl start, /bin/systemctl stop',
      'username ALL=(ALL) NOPASSWD: /bin/systemctl restart, /bin/systemctl reload'
    ]
  },
  // 网络配置
  network_config: {
    description: '允许无密码配置网络',
    rules: [
      'username ALL=(ALL) NOPASSWD: /sbin/iptables',
      'username ALL=(ALL) NOPASSWD: /usr/sbin/ufw'
    ]
  }
};

module.exports = {
  evaluate,
  checkSudoConfig,
  identifyCommandType,
  getSecurityRecommendations,
  SUDOERS_TEMPLATES,
  
  // 向后兼容导出
  platformUtils
};
