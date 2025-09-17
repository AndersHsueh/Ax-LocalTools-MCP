/**
 * 文件监控工具模块
 * 支持监控文件变化
 */

const fs = require('fs').promises;
const path = require('path');

class FileWatchTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
    this.watchers = new Map();
  }

  async handle(args) {
    const { 
      path: watchPath, 
      events = 'create,delete,modify', 
      duration = 30,
      output_format = 'text'
    } = args;

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(watchPath)) {
      throw new Error(`不允许监控路径: ${watchPath}`);
    }

    // 验证事件类型
    const validEvents = ['create', 'delete', 'modify'];
    const eventList = events.split(',').map(e => e.trim().toLowerCase());
    const invalidEvents = eventList.filter(e => !validEvents.includes(e));
    
    if (invalidEvents.length > 0) {
      throw new Error(`无效的监控事件: ${invalidEvents.join(', ')}。有效事件: ${validEvents.join(', ')}`);
    }

    try {
      const results = await this.watchPath(watchPath, eventList, duration);
      
      if (output_format === 'json') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                watch_path: watchPath,
                duration: duration,
                events: eventList,
                changes: results
              }, null, 2)
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: this.formatWatchResults(watchPath, duration, eventList, results)
            }
          ]
        };
      }

    } catch (error) {
      throw new Error(`文件监控失败: ${error.message}`);
    }
  }

  async watchPath(watchPath, events, duration) {
    return new Promise((resolve, reject) => {
      const changes = [];
      const startTime = Date.now();
      
      // 检查路径是否存在
      fs.stat(watchPath).catch(() => {
        // 如果路径不存在，创建目录
        return fs.mkdir(watchPath, { recursive: true });
      }).then(() => {
        // 使用 fs.watch 监控文件变化
        const watcher = require('fs').watch(watchPath, { recursive: true }, (eventType, filename) => {
          const changeTime = new Date().toISOString();
          const relativePath = path.join(watchPath, filename);
          
          let changeType;
          switch (eventType) {
            case 'rename':
              // 需要检查文件是否存在来判断是创建还是删除
              fs.stat(relativePath).then(() => {
                changes.push({
                  type: 'create',
                  path: relativePath,
                  time: changeTime
                });
              }).catch(() => {
                changes.push({
                  type: 'delete',
                  path: relativePath,
                  time: changeTime
                });
              });
              break;
            case 'change':
              changes.push({
                type: 'modify',
                path: relativePath,
                time: changeTime
              });
              break;
          }
        });

        // 设置超时
        const timeout = setTimeout(() => {
          watcher.close();
          resolve(changes);
        }, duration * 1000);

        // 存储监控器引用
        this.watchers.set(watchPath, { watcher, timeout });

      }).catch(reject);
    });
  }

  formatWatchResults(watchPath, duration, events, changes) {
    let result = `文件监控结果:\n`;
    result += `监控路径: ${watchPath}\n`;
    result += `监控时长: ${duration} 秒\n`;
    result += `监控事件: ${events.join(', ')}\n`;
    result += `变化数量: ${changes.length}\n\n`;

    if (changes.length > 0) {
      result += `变化详情:\n`;
      result += `${'='.repeat(60)}\n`;
      
      changes.forEach((change, index) => {
        result += `${index + 1}. 类型: ${change.type}\n`;
        result += `   路径: ${change.path}\n`;
        result += `   时间: ${change.time}\n`;
        result += `${'-'.repeat(40)}\n`;
      });
    } else {
      result += `在监控期间未检测到任何变化。\n`;
    }

    return result;
  }

  // 清理所有监控器
  cleanup() {
    for (const [path, { watcher, timeout }] of this.watchers) {
      watcher.close();
      clearTimeout(timeout);
    }
    this.watchers.clear();
  }
}

module.exports = FileWatchTool;
