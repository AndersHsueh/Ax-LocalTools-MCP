/**
 * 环境记忆工具适配器
 * 将环境记忆模块包装成统一的 handle(args) 接口
 */

const EnvironmentMemoryTool = require('./environmentMemory.js');
const { buildOutput } = require('../lib/output');
const { ERR } = require('../errors');

class EnvironmentMemoryAdapter {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
    this.environmentMemory = EnvironmentMemoryTool;
  }

  async handle(args) {
    const { operation, key, value, description, output_format = 'text' } = args;

    switch (operation) {
      case 'read': {
        const envData = this.environmentMemory.readEnvironment();
        return buildOutput(output_format, JSON.stringify(envData, null, 2),
          { operation: 'read', status: 'ok', data: envData });
      }

      case 'update': {
        if (!key || value === undefined || value === null || value === '') {
          throw ERR.INVALID_ARGS('更新操作需要提供 key 和 value 参数');
        }
        // 写入失败会抛出，避免"报了成功但没存下来"
        this.environmentMemory.updateEnvironment(key, value, description);
        return buildOutput(output_format, `成功更新环境变量: ${key}`,
          { operation: 'update', status: 'ok', key, value, description: description || '' });
      }

      case 'get': {
        if (!key) throw ERR.INVALID_ARGS('获取操作需要提供 key 参数');
        const envValue = this.environmentMemory.getEnvironmentValue(key);
        if (envValue === null) {
          return buildOutput(output_format, `环境变量 ${key} 不存在`,
            { operation: 'get', status: 'not_found', key });
        }
        return buildOutput(output_format, String(envValue),
          { operation: 'get', status: 'ok', key, value: envValue });
      }

      default:
        throw ERR.INVALID_ARGS(`不支持的操作: ${operation}`);
    }
  }
}

module.exports = EnvironmentMemoryAdapter;
