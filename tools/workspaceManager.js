/**
 * 工作目录管理工具
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const EnvironmentMemoryTool = require('./environmentMemory.js');

let instance = null;

// 统一输出辅助
function respond(fmt, text, data) {
  if (fmt === 'json') return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  if (fmt === 'both') return { content: [{ type: 'text', text }, { type: 'text', text: JSON.stringify(data) }] };
  return { content: [{ type: 'text', text }] };
}

class WorkspaceManager {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
    this.tempWorkspace = null;
    if (instance) return instance;
    instance = this;
  }

  parseWorkspaceCommand(userInput) {
    const match = userInput.match(/当前工作目录是：(.*)/);
    return match ? match[1].trim() : null;
  }

  validateWorkspace(workspacePath) {
    if (!workspacePath) return false;
    try {
      const abs = path.isAbsolute(workspacePath)
        ? workspacePath
        : path.join(process.cwd(), workspacePath);
      if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
      fs.accessSync(abs, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  getCurrentWorkspace() {
    return this.tempWorkspace
      || EnvironmentMemoryTool.getEnvironmentValue('DEFAULT_WORKSPACE')
      || path.join(os.homedir(), '.axlocalop', 'workspace');
  }

  setTempWorkspace(workspacePath) {
    if (!this.validateWorkspace(workspacePath)) return false;
    this.tempWorkspace = workspacePath;
    return true;
  }

  setDefaultWorkspace(workspacePath) {
    if (!this.validateWorkspace(workspacePath)) return false;
    EnvironmentMemoryTool.updateEnvironment('DEFAULT_WORKSPACE', workspacePath, 'Default workspace directory');
    return true;
  }

  clearTempWorkspace() {
    this.tempWorkspace = null;
  }

  getStatus() {
    return {
      tempWorkspace: this.tempWorkspace,
      defaultWorkspace: EnvironmentMemoryTool.getEnvironmentValue('DEFAULT_WORKSPACE'),
      currentWorkspace: this.getCurrentWorkspace()
    };
  }

  async handle(args) {
    const { operation, workspace_path, output_format: fmt = 'text' } = args;
    try {
      switch (operation) {
        case 'get_current': {
          const cur = this.getCurrentWorkspace();
          return respond(fmt, cur, { status: 'ok', current_workspace: cur });
        }
        case 'set_temp': {
          if (!workspace_path) throw new Error('设置临时工作目录需要提供 workspace_path 参数');
          this.setTempWorkspace(workspace_path);
          return respond(fmt, `成功设置临时工作目录: ${workspace_path}`, { status: 'ok', action: 'set_temp', workspace_path });
        }
        case 'set_default': {
          if (!workspace_path) throw new Error('设置默认工作目录需要提供 workspace_path 参数');
          this.setDefaultWorkspace(workspace_path);
          return respond(fmt, `成功设置默认工作目录: ${workspace_path}`, { status: 'ok', action: 'set_default', workspace_path });
        }
        case 'clear_temp': {
          this.clearTempWorkspace();
          return respond(fmt, '已清除临时工作目录设置', { status: 'ok', action: 'clear_temp' });
        }
        case 'status': {
          const status = this.getStatus();
          return respond(fmt, JSON.stringify(status, null, 2), status);
        }
        default:
          throw new Error(`不支持的操作: ${operation}`);
      }
    } catch (error) {
      throw new Error(`工作目录管理工具错误: ${error.message}`);
    }
  }
}

module.exports = WorkspaceManager;
