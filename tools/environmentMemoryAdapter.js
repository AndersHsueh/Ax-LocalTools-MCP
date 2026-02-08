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
          const result = { operation: 'read', status: 'ok', data: envData };
          
          if (output_format === 'json') {
            return { content: [{ type: 'json', json: result }] };
          } else if (output_format === 'both') {
            return { content: [ 
              { type: 'text', text: JSON.stringify(envData, null, 2) }, 
              { type: 'json', json: result } 
            ]};
          }
          return { content: [{ type: 'text', text: JSON.stringify(envData, null, 2) }] };
        }

        case 'update': {
          if (!key || !value) {
            const errorResult = { 
              operation: 'update', 
              status: 'error', 
              error: '更新操作需要提供key和value参数',
              key: key || null
            };
            
            if (output_format === 'json') {
              return { content: [{ type: 'json', json: errorResult }], isError: true };
            } else if (output_format === 'both') {
              return { 
                content: [ 
                  { type: 'text', text: `错误: 更新操作需要提供key和value参数` }, 
                  { type: 'json', json: errorResult } 
                ], 
                isError: true 
              };
            }
            return { 
              content: [{ type: 'text', text: `错误: 更新操作需要提供key和value参数` }], 
              isError: true 
            };
          }
          
          this.environmentMemory.updateEnvironment(key, value, description);
          const result = { 
            status: 'ok', 
            operation: 'update', 
            key, 
            value: value ? '[HIDDEN]' : undefined, 
            description: description || '' 
          };
          
          if (output_format === 'json') {
            return { content: [{ type: 'json', json: result }] };
          }
          if (output_format === 'both') {
            return { 
              content: [ 
                { type: 'text', text: `成功更新环境变量: ${key}` }, 
                { type: 'json', json: result } 
              ] 
            };
          }
          return { content: [{ type: 'text', text: `成功更新环境变量: ${key}` }] };
        }

        case 'get': {
          if (!key) {
            const errorResult = { 
              operation: 'get', 
              status: 'error', 
              error: '获取操作需要提供key参数'
            };
            
            if (output_format === 'json') {
              return { content: [{ type: 'json', json: errorResult }], isError: true };
            } else if (output_format === 'both') {
              return { 
                content: [ 
                  { type: 'text', text: `错误: 获取操作需要提供key参数` }, 
                  { type: 'json', json: errorResult } 
                ], 
                isError: true 
              };
            }
            return { 
              content: [{ type: 'text', text: `错误: 获取操作需要提供key参数` }], 
              isError: true 
            };
          }
          
          const envValue = this.environmentMemory.getEnvironmentValue(key);
          if (envValue === null) {
            const result = { operation: 'get', status: 'not_found', key };
            
            if (output_format === 'json') {
              return { content: [{ type: 'json', json: result }] };
            }
            if (output_format === 'both') {
              return { 
                content: [ 
                  { type: 'text', text: `环境变量 ${key} 不存在` }, 
                  { type: 'json', json: result } 
                ] 
              };
            }
            return { content: [{ type: 'text', text: `环境变量 ${key} 不存在` }] };
          }
          
          const result = { status: 'ok', operation: 'get', key, value: envValue };
          
          if (output_format === 'json') {
            return { content: [{ type: 'json', json: result }] };
          }
          if (output_format === 'both') {
            return { 
              content: [ 
                { type: 'text', text: envValue }, 
                { type: 'json', json: result } 
              ] 
            };
          }
          return { content: [{ type: 'text', text: envValue }] };
        }

        default:
          const errorResult = { 
            operation, 
            status: 'error', 
            error: `不支持的操作: ${operation}` 
          };
          
          if (output_format === 'json') {
            return { content: [{ type: 'json', json: errorResult }], isError: true };
          } else if (output_format === 'both') {
            return { 
              content: [ 
                { type: 'text', text: `错误: 不支持的操作: ${operation}` }, 
                { type: 'json', json: errorResult } 
              ], 
              isError: true 
            };
          }
          return { 
            content: [{ type: 'text', text: `错误: 不支持的操作: ${operation}` }], 
            isError: true 
          };
      }
    } catch (error) {
      const errorResult = { 
        operation, 
        status: 'error', 
        error: `环境记忆工具错误: ${error.message}`,
        key: key || null
      };
      
      if (output_format === 'json') {
        return { content: [{ type: 'json', json: errorResult }], isError: true };
      } else if (output_format === 'both') {
        return { 
          content: [ 
            { type: 'text', text: `环境记忆工具错误: ${error.message}` }, 
            { type: 'json', json: errorResult } 
          ], 
          isError: true 
        };
      }
      return { 
        content: [{ type: 'text', text: `环境记忆工具错误: ${error.message}` }], 
        isError: true 
      };
    }
  }
}

module.exports = EnvironmentMemoryAdapter;