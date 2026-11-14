/**
 * 环境记忆工具
 * 管理持久化的环境信息，存储于 <数据目录>/environment.json
 * （历史版本曾用 .env 存放 JSON，读取时自动迁移）
 * 默认值在首次创建时根据当前平台动态生成
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 数据目录可通过 AXLOCALOP_DATA_DIR 覆盖（测试/多实例隔离用）
const DATA_DIR = process.env.AXLOCALOP_DATA_DIR || path.join(os.homedir(), '.local_file_operations');

// 环境文件路径
const ENV_DIR = DATA_DIR;
const ENV_FILE = path.join(ENV_DIR, 'environment.json');
const LEGACY_ENV_FILE = path.join(ENV_DIR, '.env');

// 历史默认工作区（位于隐藏目录，会被路径校验拒绝），仅用于迁移识别
const LEGACY_WORKSPACE = path.join(os.homedir(), '.axlocalop', 'workspace');

/**
 * 默认工作区路径。
 * 注意：必须落在非隐藏目录，否则 SecurityValidator 会拒绝其下所有相对路径。
 */
function defaultWorkspacePath() {
  return path.join(os.homedir(), 'axlocalop', 'workspace');
}

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
      "value": defaultWorkspacePath()
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
 * 若存在旧版 .env 文件，迁移其内容到新文件。
 */
function ensureEnvFile() {
  if (!fs.existsSync(ENV_DIR)) {
    fs.mkdirSync(ENV_DIR, { recursive: true });
  }
  if (fs.existsSync(ENV_FILE)) return;

  let initial = buildDefaultEnv();
  if (fs.existsSync(LEGACY_ENV_FILE)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(LEGACY_ENV_FILE, 'utf8'));
      if (legacy && typeof legacy === 'object') initial = { ...initial, ...legacy };
    } catch {
      // 旧文件损坏则忽略，使用默认值
    }
  }
  fs.writeFileSync(ENV_FILE, JSON.stringify(initial, null, 4));
}

/**
 * 读取环境变量（带 mtime 缓存，避免每次工具调用都同步读盘）
 */
let _cache = null; // { mtimeMs, data }

function readEnvironment() {
  ensureEnvFile();
  try {
    const { mtimeMs } = fs.statSync(ENV_FILE);
    if (_cache && _cache.mtimeMs === mtimeMs) return _cache.data;

    const envContent = fs.readFileSync(ENV_FILE, 'utf8');
    const data = JSON.parse(envContent);
    _cache = { mtimeMs, data };
    return data;
  } catch {
    // 文件损坏时返回动态默认值（不打印到 stdout/stderr）
    return buildDefaultEnv();
  }
}

/**
 * 更新环境变量
 * 写入失败时抛出（调用方需要知道配置没存下来）
 */
function updateEnvironment(key, value, description = '') {
  ensureEnvFile();
  const env = readEnvironment();
  env[key] = {
    value: value,
    description: description || (env[key] ? env[key].description : '')
  };
  fs.writeFileSync(ENV_FILE, JSON.stringify(env, null, 4));
  _cache = null;
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
  defaultWorkspacePath,
  LEGACY_WORKSPACE,
  DATA_DIR,
  ENV_FILE
};
