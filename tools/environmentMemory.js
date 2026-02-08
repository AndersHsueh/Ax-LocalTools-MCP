/**
 * 环境记忆工具
 * 该工具用于管理环境信息，提供环境变量的读取和更新功能
 * 
 * 功能：
 * 1. 启动时读取 ~/.local_file_operations/.env 文件
 * 2. 当识别到环境相关信息时，记录到环境文件中
 * 3. 在会话中根据需要使用或验证环境信息
 */

const fs = require('fs');
const path = require('path');

// 环境文件路径
const ENV_DIR = path.join(require('os').homedir(), '.local_file_operations');
const ENV_FILE = path.join(ENV_DIR, '.env');

// 默认环境变量模板
const DEFAULT_ENV = {
    "LLM_CURRENT_PATH": {
        "description": "current path of llm",
        "value": "~/"
    },
    "DEFAULT_WORKSPACE": {
        "description": "Default workspace directory",
        "value": require('path').join(require('os').homedir(), '.axlocalop', 'workspace')
    },
    "OS": {
        "description": "os of current machine",
        "value": "macOS"
    },
    "HW_CPU": {
        "description": "cpu of current machine",
        "value": "Apple Silicon, M4 Pro"
    },
    "HW_GPU": {
        "description": "gpu of current machine",
        "value": "Apple M4 Pro"
    },
    "HW_MEMORY": {
        "description": "memory of current machine",
        "value": "48G"
    },
    "HW_STORAGE": {
        "description": "storage of current machine",
        "value": "1TB"
    }
};

/**
 * 确保环境文件存在，如果不存在则创建
 */
function ensureEnvFile() {
    // 创建目录（如果不存在）
    if (!fs.existsSync(ENV_DIR)) {
        fs.mkdirSync(ENV_DIR, { recursive: true });
    }
    
    // 创建环境文件（如果不存在）
    if (!fs.existsSync(ENV_FILE)) {
        fs.writeFileSync(ENV_FILE, JSON.stringify(DEFAULT_ENV, null, 4));
        console.log(`Created default environment file at ${ENV_FILE}`);
    }
}

/**
 * 读取环境变量
 * @returns {Object} 环境变量对象
 */
function readEnvironment() {
    ensureEnvFile();
    
    try {
        const envContent = fs.readFileSync(ENV_FILE, 'utf8');
        return JSON.parse(envContent);
    } catch (error) {
        console.error(`Error reading environment file: ${error.message}`);
        return DEFAULT_ENV;
    }
}

/**
 * 更新环境变量
 * @param {string} key 环境变量键
 * @param {string} value 环境变量值
 * @param {string} description 环境变量描述
 */
function updateEnvironment(key, value, description = '') {
    ensureEnvFile();
    
    try {
        // 读取现有环境变量
        const env = readEnvironment();
        
        // 更新或添加新的环境变量
        env[key] = {
            value: value,
            description: description || (env[key] ? env[key].description : '')
        };
        
        // 写回文件
        fs.writeFileSync(ENV_FILE, JSON.stringify(env, null, 4));
        console.log(`Updated environment variable: ${key}=${value}`);
    } catch (error) {
        console.error(`Error updating environment file: ${error.message}`);
    }
}

/**
 * 获取特定环境变量的值
 * @param {string} key 环境变量键
 * @returns {string|null} 环境变量值，如果不存在则返回null
 */
function getEnvironmentValue(key) {
    const env = readEnvironment();
    return env[key] ? env[key].value : null;
}

/**
 * 检查环境变量是否存在
 * @param {string} key 环境变量键
 * @returns {boolean} 是否存在
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