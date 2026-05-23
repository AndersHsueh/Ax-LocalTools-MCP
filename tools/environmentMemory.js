/**
 * 环境记忆工具
 * 管理持久化的环境信息，存储于 ~/.local_file_operations/.env
 * 默认值在首次创建时根据当前平台动态生成
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 环境文件路径
const ENV_DIR = path.join(os.homedir(), '.local_file_operations');
const ENV_FILE = path.join(ENV_DIR, '.env');

/**
 * 根据当前平台生成默认环境变量
 */
function buildDefaultEnv() {
  const platform = process.platform;
  let osName;
  if (platform === 'win32') osName = 'Windows';
  else if (platform === 'darwin') osName = 'macOS';
  else osName = 'Linux';

  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : '未知';
  const memoryGB = Math.round(os.totalmem() / (1024 ** 3)) + 'G';

  return {
    "LLM_CURRENT_PATH": {
      "description": "current path of llm",
      "value": os.homedir()
    },
    "DEFAULT_WORKSPACE": {
      "description": "Default workspace directory",
      "value": path.join(os.homedir(), '.axlocalop', 'workspace')
    },
    "OS": {
      "description": "os of current machine",
      "value": osName
    },
    "HW_CPU": {
      "description": "cpu of current machine",
      "value": cpuModel
    },
    "HW_MEMORY": {
      "description": "memory of current machine",
      "value": memoryGB
    }
  };
}

/**
 * 确保环境文件存在，如果不存在则创建（带动态默认值）
 */
function ensureEnvFile() {
  if (!fs.existsSync(ENV_DIR)) {
    fs.mkdirSync(ENV_DIR, { recursive: true });
  }
  if (!fs.existsSync(ENV_FILE)) {
    const defaultEnv = buildDefaultEnv();
    fs.writeFileSync(ENV_FILE, JSON.stringify(defaultEnv, null, 4));
  }
}

/**
 * 读取环境变量
 */
function readEnvironment() {
  ensureEnvFile();
  try {
    const envContent = fs.readFileSync(ENV_FILE, 'utf8');
    return JSON.parse(envContent);
  } catch {
    // 文件损坏时返回动态默认值（不打印到 stdout/stderr）
    return buildDefaultEnv();
  }
}

/**
 * 更新环境变量
 */
function updateEnvironment(key, value, description = '') {
  ensureEnvFile();
  try {
    const env = readEnvironment();
    env[key] = {
      value: value,
      description: description || (env[key] ? env[key].description : '')
    };
    fs.writeFileSync(ENV_FILE, JSON.stringify(env, null, 4));
  } catch {
    // 静默失败，不输出到 stdout
  }
}

/**
 * 获取特定环境变量的值
 */
function getEnvironmentValue(key) {
  const env = readEnvironment();
  return env[key] ? env[key].value : null;
}

/**
 * 检查环境变量是否存在
 */
function hasEnvironmentKey(key) {
  const env = readEnvironment();
  return key in env;
}

module.exports = {
  readEnvironment,
  updateEnvironment,
  getEnvironmentValue,
  hasEnvironmentKey,
  ENV_FILE
};
