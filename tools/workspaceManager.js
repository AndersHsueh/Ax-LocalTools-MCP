/**
 * 工作目录管理工具
 * 处理工作目录的配置、切换和验证
 */

const fs = require('fs');
const path = require('path');
const { getEnvironmentValue, updateEnvironment } = require('./environmentMemory.js');

// 单例实例
let instance = null;

class WorkspaceManager {
    constructor(securityValidator) {
        this.securityValidator = securityValidator;
        this.tempWorkspace = null; // 临时工作目录（会话内有效）
        this.logger = console; // 日志记录器
        
        // 确保单例
        if (instance) {
            return instance;
        }
        instance = this;
    }

    /**
     * 从用户输入中解析工作目录命令
     * @param {string} userInput 用户输入文本
     * @returns {string|null} 解析出的工作目录路径，如果没有则返回null
     */
    parseWorkspaceCommand(userInput) {
        const regex = /当前工作目录是：(.*)/;
        const match = userInput.match(regex);
        if (match && match[1]) {
            const workspacePath = match[1].trim();
            this.logger.log(`[WorkspaceManager] 解析到工作目录命令: ${workspacePath}`);
            return workspacePath;
        }
        return null;
    }

    /**
     * 设置临时工作目录
     * @param {string} workspacePath 工作目录路径
     * @returns {boolean} 是否设置成功
     */
    setTempWorkspace(workspacePath) {
        if (this.validateWorkspace(workspacePath)) {
            this.tempWorkspace = workspacePath;
            this.logger.log(`[WorkspaceManager] 临时工作目录已设置为: ${workspacePath}`);
            return true;
        }
        this.logger.error(`[WorkspaceManager] 无效的工作目录: ${workspacePath}`);
        return false;
    }

    /**
     * 获取当前有效的工作目录
     * @returns {string} 当前工作目录路径
     */
    getCurrentWorkspace() {
        // 临时工作目录优先级高于默认工作目录
        if (this.tempWorkspace) {
            return this.tempWorkspace;
        }
        
        // 获取默认工作目录
        const defaultWorkspace = getEnvironmentValue('DEFAULT_WORKSPACE');
        if (defaultWorkspace) {
            return defaultWorkspace;
        }
        
        // 使用默认值
        const fallbackWorkspace = path.join(require('os').homedir(), '.axlocalop', 'workspace');
        this.logger.log(`[WorkspaceManager] 使用回退工作目录: ${fallbackWorkspace}`);
        return fallbackWorkspace;
    }

    /**
     * 设置默认工作目录（持久化）
     * @param {string} workspacePath 工作目录路径
     * @returns {boolean} 是否设置成功
     */
    setDefaultWorkspace(workspacePath) {
        if (this.validateWorkspace(workspacePath)) {
            updateEnvironment('DEFAULT_WORKSPACE', workspacePath, 'Default workspace directory');
            this.logger.log(`[WorkspaceManager] 默认工作目录已设置为: ${workspacePath}`);
            return true;
        }
        this.logger.error(`[WorkspaceManager] 无效的默认工作目录: ${workspacePath}`);
        return false;
    }

    /**
     * 验证工作目录的有效性
     * @param {string} workspacePath 工作目录路径
     * @returns {boolean} 是否有效
     */
    validateWorkspace(workspacePath) {
        if (!workspacePath) {
            return false;
        }
        
        try {
            // 解析为绝对路径
            const absolutePath = path.isAbsolute(workspacePath) 
                ? workspacePath 
                : path.join(process.cwd(), workspacePath);
            
            // 检查目录是否存在，如果不存在则尝试创建
            if (!fs.existsSync(absolutePath)) {
                fs.mkdirSync(absolutePath, { recursive: true });
                this.logger.log(`[WorkspaceManager] 创建工作目录: ${absolutePath}`);
            }
            
            // 检查是否有读写权限
            fs.accessSync(absolutePath, fs.constants.R_OK | fs.constants.W_OK);
            return true;
        } catch (error) {
            this.logger.error(`[WorkspaceManager] 验证工作目录失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 清除临时工作目录设置
     */
    clearTempWorkspace() {
        this.tempWorkspace = null;
        this.logger.log(`[WorkspaceManager] 临时工作目录已清除`);
    }

    /**
     * 获取工作目录状态信息
     * @returns {Object} 工作目录状态
     */
    getStatus() {
        return {
            tempWorkspace: this.tempWorkspace,
            defaultWorkspace: getEnvironmentValue('DEFAULT_WORKSPACE'),
            currentWorkspace: this.getCurrentWorkspace()
        };
    }

    /**
     * 工具接口的handle方法
     * @param {Object} args 工具参数
     * @returns {Promise<Object>} 处理结果
     */
    async handle(args) {
        const { operation, workspace_path, output_format = 'text' } = args;

        try {
            switch (operation) {
                case 'get_current': {
                    const currentWorkspace = this.getCurrentWorkspace();
                    const data = { status: 'ok', current_workspace: currentWorkspace };
                    if (output_format === 'json') return { content: [{ type: 'json', json: data }] };
                    if (output_format === 'both') return { content: [{ type: 'text', text: currentWorkspace }, { type: 'json', json: data }] };
                    return { content: [{ type: 'text', text: currentWorkspace }] };
                }

                case 'set_temp': {
                    if (!workspace_path) throw new Error('设置临时工作目录需要提供workspace_path参数');
                    this.setTempWorkspace(workspace_path);
                    const data = { status: 'ok', action: 'set_temp', workspace_path };
                    if (output_format === 'json') return { content: [{ type: 'json', json: data }] };
                    if (output_format === 'both') return { content: [{ type: 'text', text: `成功设置临时工作目录: ${workspace_path}` }, { type: 'json', json: data }] };
                    return { content: [{ type: 'text', text: `成功设置临时工作目录: ${workspace_path}` }] };
                }

                case 'set_default': {
                    if (!workspace_path) throw new Error('设置默认工作目录需要提供workspace_path参数');
                    this.setDefaultWorkspace(workspace_path);
                    const data = { status: 'ok', action: 'set_default', workspace_path };
                    if (output_format === 'json') return { content: [{ type: 'json', json: data }] };
                    if (output_format === 'both') return { content: [{ type: 'text', text: `成功设置默认工作目录: ${workspace_path}` }, { type: 'json', json: data }] };
                    return { content: [{ type: 'text', text: `成功设置默认工作目录: ${workspace_path}` }] };
                }

                case 'clear_temp': {
                    this.clearTempWorkspace();
                    const data = { status: 'ok', action: 'clear_temp' };
                    if (output_format === 'json') return { content: [{ type: 'json', json: data }] };
                    if (output_format === 'both') return { content: [{ type: 'text', text: '已清除临时工作目录设置' }, { type: 'json', json: data }] };
                    return { content: [{ type: 'text', text: '已清除临时工作目录设置' }] };
                }

                case 'status': {
                    const status = this.getStatus();
                    if (output_format === 'json') return { content: [{ type: 'json', json: status }] };
                    if (output_format === 'both') return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }, { type: 'json', json: status }] };
                    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
                }

                default:
                    throw new Error(`不支持的操作: ${operation}`);
            }
        } catch (error) {
            throw new Error(`工作目录管理工具错误: ${error.message}`);
        }
    }
}

// 导出类
module.exports = WorkspaceManager;
