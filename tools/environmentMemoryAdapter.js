/**
 * 环境记忆工具适配器
 * 该适配器将环境记忆工具模块包装为一个类，以便与其他工具保持一致的接口
 */

const EnvironmentMemoryTool = require('./environmentMemory.js');

class EnvironmentMemoryAdapter {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
    this.environmentMemory = EnvironmentMemoryTool;
  }

  /**
   * 处理工具调用
   * @param {Object} args 工具参数
   * @returns {Promise<Object>} 处理结果
   */
  async handle(args) {
    const { operation, key, value, description, output_format = 'text' } = args;

    try {
      switch (operation) {
        case 'read': {
          const envData = this.environmentMemory.readEnvironment();
          if (output_format === 'json') {
            return { content: [{ type: 'json', json: envData }] };
          } else if (output_format === 'both') {
            return { content: [ { type: 'text', text: JSON.stringify(envData, null, 2) }, { type: 'json', json: envData } ] };
          }
          return { content: [{ type: 'text', text: JSON.stringify(envData, null, 2) }] };
        }

        case 'update': {
          if (!key || !value) throw new Error('更新操作需要提供key和value参数');
          this.environmentMemory.updateEnvironment(key, value, description);
          const data = { status: 'ok', action: 'update', key, value, description: description || '' };
          if (output_format === 'json') return { content: [{ type: 'json', json: data }] };
          if (output_format === 'both') return { content: [ { type: 'text', text: `成功更新环境变量: ${key}=${value}` }, { type: 'json', json: data } ] };
          return { content: [{ type: 'text', text: `成功更新环境变量: ${key}=${value}` }] };
        }

        case 'get': {
          if (!key) throw new Error('获取操作需要提供key参数');
          const envValue = this.environmentMemory.getEnvironmentValue(key);
          if (envValue === null) {
            if (output_format === 'json') return { content: [{ type: 'json', json: { status: 'not_found', key } }] };
            if (output_format === 'both') return { content: [ { type: 'text', text: `环境变量 ${key} 不存在` }, { type: 'json', json: { status: 'not_found', key } } ] };
            return { content: [{ type: 'text', text: `环境变量 ${key} 不存在` }] };
          }
          if (output_format === 'json') return { content: [{ type: 'json', json: { status: 'ok', key, value: envValue } }] };
          if (output_format === 'both') return { content: [ { type: 'text', text: envValue }, { type: 'json', json: { status: 'ok', key, value: envValue } } ] };
          return { content: [{ type: 'text', text: envValue }] };
        }

        default:
          throw new Error(`不支持的操作: ${operation}`);
      }
    } catch (error) {
      throw new Error(`环境记忆工具错误: ${error.message}`);
    }
  }
}

module.exports = EnvironmentMemoryAdapter;