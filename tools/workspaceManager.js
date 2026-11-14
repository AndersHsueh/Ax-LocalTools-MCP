/**
 * 工作目录管理工具
 *
 * 工作目录的三种来源，优先级从高到低：
 *   1. 临时工作区（本次会话内 set_temp 设置）
 *   2. 默认工作区（持久化在 environment.json 的 DEFAULT_WORKSPACE）
 *   3. 兜底路径 <home>/axlocalop/workspace
 *
 * 注意：兜底路径必须位于非隐藏目录，SecurityValidator 会拒绝隐藏目录下的路径。
 */

const fs = require('fs');
const path = require('path');
const EnvironmentMemoryTool = require('./environmentMemory.js');
const { buildOutput } = require('../lib/output');
const { ERR } = require('../errors');

let instance = null;

class WorkspaceManager {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
    this.tempWorkspace = null;
    if (instance) return instance;
    instance = this;
  }

  /**
   * 校验工作区路径是否可用。
   * 默认不创建目录——校验函数不应带写副作用。
   */
  validateWorkspace(workspacePath, { create = false } = {}) {
    if (!workspacePath || typeof workspacePath !== 'string') return false;
    try {
      const abs = path.resolve(workspacePath);
      if (!fs.existsSync(abs)) {
        if (!create) return false;
        fs.mkdirSync(abs, { recursive: true });
      }
      if (!fs.statSync(abs).isDirectory()) return false;
      fs.accessSync(abs, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** 兜底工作区（非隐藏目录） */
  getDefaultWorkspacePath() {
    return EnvironmentMemoryTool.defaultWorkspacePath();
  }

  getCurrentWorkspace() {
    if (this.tempWorkspace) return this.tempWorkspace;

    const configured = EnvironmentMemoryTool.getEnvironmentValue('DEFAULT_WORKSPACE');
    if (configured) {
      // 迁移：旧版本默认值在隐藏目录 ~/.axlocalop/workspace，会被路径校验拒绝
      if (path.resolve(configured) === path.resolve(EnvironmentMemoryTool.LEGACY_WORKSPACE)) {
        const migrated = this.getDefaultWorkspacePath();
        try {
          EnvironmentMemoryTool.updateEnvironment('DEFAULT_WORKSPACE', migrated, 'Default workspace directory');
        } catch {
          // 迁移失败不影响本次返回，仍用新路径
        }
        return migrated;
      }
      return configured;
    }

    return this.getDefaultWorkspacePath();
  }

  setTempWorkspace(workspacePath) {
    if (!this.validateWorkspace(workspacePath, { create: true })) return false;
    this.tempWorkspace = path.resolve(workspacePath);
    return true;
  }

  setDefaultWorkspace(workspacePath) {
    if (!this.validateWorkspace(workspacePath, { create: true })) return false;
    EnvironmentMemoryTool.updateEnvironment('DEFAULT_WORKSPACE', path.resolve(workspacePath), 'Default workspace directory');
    return true;
  }

  clearTempWorkspace() {
    this.tempWorkspace = null;
  }

  getStatus() {
    return {
      tempWorkspace: this.tempWorkspace,
      defaultWorkspace: EnvironmentMemoryTool.getEnvironmentValue('DEFAULT_WORKSPACE') || this.getDefaultWorkspacePath(),
      currentWorkspace: this.getCurrentWorkspace()
    };
  }

  async handle(args) {
    const { operation, workspace_path, output_format: fmt = 'text' } = args;

    switch (operation) {
      case 'get_current': {
        const cur = this.getCurrentWorkspace();
        return buildOutput(fmt, cur, { status: 'ok', current_workspace: cur });
      }

      case 'set_temp': {
        if (!workspace_path) throw ERR.INVALID_ARGS('设置临时工作目录需要提供 workspace_path 参数');
        if (!this.setTempWorkspace(workspace_path)) {
          throw ERR.INVALID_ARGS(`工作目录不可用（不存在、不是目录或不可读写）: ${workspace_path}`);
        }
        return buildOutput(fmt,
          `成功设置临时工作目录: ${this.tempWorkspace}`,
          { status: 'ok', action: 'set_temp', workspace_path: this.tempWorkspace });
      }

      case 'set_default': {
        if (!workspace_path) throw ERR.INVALID_ARGS('设置默认工作目录需要提供 workspace_path 参数');
        if (!this.setDefaultWorkspace(workspace_path)) {
          throw ERR.INVALID_ARGS(`工作目录不可用（不存在、不是目录或不可读写）: ${workspace_path}`);
        }
        const abs = path.resolve(workspace_path);
        return buildOutput(fmt,
          `成功设置默认工作目录: ${abs}`,
          { status: 'ok', action: 'set_default', workspace_path: abs });
      }

      case 'clear_temp': {
        this.clearTempWorkspace();
        return buildOutput(fmt, '已清除临时工作目录设置', { status: 'ok', action: 'clear_temp' });
      }

      case 'status': {
        const status = this.getStatus();
        return buildOutput(fmt, JSON.stringify(status, null, 2), status);
      }

      default:
        throw ERR.INVALID_ARGS(`不支持的操作: ${operation}`);
    }
  }
}

module.exports = WorkspaceManager;
