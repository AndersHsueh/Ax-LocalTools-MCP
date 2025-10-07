/**
 * 跨平台文件监控工具模块
 * 支持监控文件变化，在Linux上优化递归监控实现
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const platformUtils = require('../lib/platformUtils');
const { EventEmitter } = require('events');

/**
 * 跨平台文件监控器
 */
class CrossPlatformWatcher extends EventEmitter {
  constructor(watchPath, options = {}) {
    super();
    this.watchPath = watchPath;
    this.options = {
      recursive: options.recursive !== false,
      maxDepth: options.maxDepth || 10,
      debounceMs: options.debounceMs || 100,
      ignorePatterns: options.ignorePatterns || []
    };
    
    this.watchers = new Map();
    this.debounceTimers = new Map();
    this.isActive = false;
    this.stats = {
      watchersCount: 0,
      eventsCount: 0,
      startTime: null
    };
  }

  async start() {
    if (this.isActive) {
      throw new Error('监控器已经在运行');
    }

    this.isActive = true;
    this.stats.startTime = Date.now();
    
    try {
      if (platformUtils.supportsRecursiveWatch() && this.options.recursive) {
        await this.startNativeRecursiveWatch();
      } else {
        await this.startManualRecursiveWatch();
      }
      
      this.emit('ready', {
        platform: platformUtils.getPlatformInfo().platform,
        recursive: this.options.recursive,
        nativeRecursive: platformUtils.supportsRecursiveWatch(),
        watchersCount: this.stats.watchersCount
      });
    } catch (error) {
      this.isActive = false;
      throw error;
    }
  }

  stop() {
    if (!this.isActive) return;
    
    this.isActive = false;
    
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch (error) {
        // 忽略关闭错误
      }
    }
    this.watchers.clear();
    
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    
    this.emit('stopped', {
      duration: Date.now() - this.stats.startTime,
      eventsCount: this.stats.eventsCount
    });
  }

  async startNativeRecursiveWatch() {
    const watcher = fs.watch(this.watchPath, 
      { recursive: true, persistent: true }, 
      (eventType, filename) => {
        if (filename) {
          this.handleFileEvent(eventType, path.join(this.watchPath, filename));
        }
      }
    );
    
    this.watchers.set(this.watchPath, watcher);
    this.stats.watchersCount = 1;
    
    watcher.on('error', (error) => {
      this.emit('error', error);
    });
  }

  async startManualRecursiveWatch() {
    await this.setupWatchersRecursively(this.watchPath, 0);
  }

  async setupWatchersRecursively(dirPath, depth) {
    if (depth >= this.options.maxDepth) return;

    try {
      const stats = await fsPromises.stat(dirPath);
      if (!stats.isDirectory() || this.shouldIgnorePath(dirPath)) return;

      const watcher = fs.watch(dirPath, { persistent: true }, 
        (eventType, filename) => {
          if (filename) {
            const fullPath = path.join(dirPath, filename);
            this.handleFileEvent(eventType, fullPath);
            
            if (eventType === 'rename') {
              this.handlePotentialNewDirectory(fullPath, depth);
            }
          }
        }
      );

      watcher.on('error', (error) => {
        this.emit('error', { path: dirPath, error });
      });

      this.watchers.set(dirPath, watcher);
      this.stats.watchersCount++;

      if (this.options.recursive) {
        const entries = await fsPromises.readdir(dirPath);
        for (const entry of entries) {
          const entryPath = path.join(dirPath, entry);
          try {
            const entryStats = await fsPromises.stat(entryPath);
            if (entryStats.isDirectory()) {
              await this.setupWatchersRecursively(entryPath, depth + 1);
            }
          } catch (error) {
            // 忽略无法访问的文件/目录
          }
        }
      }
    } catch (error) {
      this.emit('error', { path: dirPath, error });
    }
  }

  async handlePotentialNewDirectory(filePath, currentDepth) {
    try {
      const stats = await fsPromises.stat(filePath);
      if (stats.isDirectory() && !this.watchers.has(filePath)) {
        await this.setupWatchersRecursively(filePath, currentDepth + 1);
      }
    } catch (error) {
      // 文件可能已被删除
    }
  }

  handleFileEvent(eventType, filePath) {
    if (this.shouldIgnorePath(filePath)) return;

    const eventKey = `${eventType}:${filePath}`;
    
    if (this.debounceTimers.has(eventKey)) {
      clearTimeout(this.debounceTimers.get(eventKey));
    }
    
    const timer = setTimeout(() => {
      this.debounceTimers.delete(eventKey);
      this.processFileEvent(eventType, filePath);
    }, this.options.debounceMs);
    
    this.debounceTimers.set(eventKey, timer);
  }

  async processFileEvent(eventType, filePath) {
    this.stats.eventsCount++;
    
    let changeType;
    const timestamp = new Date().toISOString();
    
    try {
      if (eventType === 'rename') {
        try {
          await fsPromises.access(filePath);
          changeType = 'create';
        } catch {
          changeType = 'delete';
          if (this.watchers.has(filePath)) {
            const watcher = this.watchers.get(filePath);
            watcher.close();
            this.watchers.delete(filePath);
            this.stats.watchersCount--;
          }
        }
      } else {
        changeType = eventType === 'change' ? 'modify' : eventType;
      }
      
      this.emit('change', {
        type: changeType,
        path: filePath,
        time: timestamp,
        platform: platformUtils.getPlatformInfo().platform
      });
      
    } catch (error) {
      this.emit('error', { path: filePath, error });
    }
  }

  shouldIgnorePath(filePath) {
    const basename = path.basename(filePath);
    const defaultIgnorePatterns = [
      /^\./,           // 隐藏文件
      /\.tmp$/,        // 临时文件
      /node_modules/,  // Node.js 依赖
      /\.git/          // Git 目录
    ];
    
    const allPatterns = [...defaultIgnorePatterns, ...this.options.ignorePatterns];
    
    return allPatterns.some(pattern => {
      if (pattern instanceof RegExp) {
        return pattern.test(basename) || pattern.test(filePath);
      } else if (typeof pattern === 'string') {
        return basename.includes(pattern) || filePath.includes(pattern);
      }
      return false;
    });
  }

  getStats() {
    return {
      ...this.stats,
      isActive: this.isActive,
      platform: platformUtils.getPlatformInfo().platform,
      nativeRecursive: platformUtils.supportsRecursiveWatch(),
      uptime: this.isActive ? Date.now() - this.stats.startTime : 0
    };
  }
}

class FileWatchTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
    this.activeWatchers = new Map();
  }
  async handle(args) {
    const { 
      path: watchPath, 
      events = 'create,delete,modify', 
      duration = 30,
      output_format = 'text',
      recursive = true,
      max_depth = 10
    } = args;

    if (!this.securityValidator.isPathAllowed(watchPath)) {
      throw new Error(`不允许监控路径: ${watchPath}`);
    }

    const validEvents = ['create', 'delete', 'modify'];
    const eventList = events.split(',').map(e => e.trim().toLowerCase());
    const invalidEvents = eventList.filter(e => !validEvents.includes(e));
    
    if (invalidEvents.length > 0) {
      throw new Error(`无效的监控事件: ${invalidEvents.join(', ')}`);
    }

    try {
      const results = await this.watchPathEnhanced(watchPath, {
        events: eventList,
        duration,
        recursive,
        maxDepth: max_depth
      });
      
      if (output_format === 'json') {
        return { 
          content: [{ 
            type: 'json', 
            json: {
              watch_path: watchPath,
              duration,
              events: eventList,
              changes: results.changes,
              stats: results.stats,
              capabilities: results.capabilities
            }
          }] 
        };
      }
      
      return { 
        content: [{ 
          type: 'text', 
          text: this.formatWatchResults(watchPath, duration, eventList, results) 
        }] 
      };

    } catch (error) {
      throw new Error(`文件监控失败: ${error.message}`);
    }
  }

  async watchPathEnhanced(watchPath, options) {
    return new Promise(async (resolve, reject) => {
      const changes = [];
      
      try {
        try {
          await fsPromises.access(watchPath);
        } catch {
          await fsPromises.mkdir(watchPath, { recursive: true });
        }
        
        const watcher = new CrossPlatformWatcher(watchPath, {
          recursive: options.recursive,
          maxDepth: options.maxDepth
        });
        
        watcher.on('change', (eventData) => {
          if (options.events.includes(eventData.type)) {
            changes.push(eventData);
          }
        });
        
        watcher.on('error', (error) => {
          console.error('监控错误:', error);
        });
        
        this.activeWatchers.set(watchPath, watcher);
        await watcher.start();
        
        const timeout = setTimeout(() => {
          const stats = watcher.getStats();
          watcher.stop();
          this.activeWatchers.delete(watchPath);
          
          resolve({
            changes,
            stats,
            capabilities: {
              platform: platformUtils.getPlatformInfo().platform,
              nativeRecursive: platformUtils.supportsRecursiveWatch(),
              recursive: options.recursive,
              watchersCount: stats.watchersCount
            }
          });
        }, options.duration * 1000);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  formatWatchResults(watchPath, duration, events, results) {
    const { changes, stats, capabilities } = results;
    
    let result = `文件监控结果 (增强版):\n`;
    result += `监控路径: ${watchPath}\n`;
    result += `监控时长: ${duration} 秒\n`;
    result += `监控事件: ${events.join(', ')}\n`;
    result += `平台: ${capabilities.platform}\n`;
    result += `递归支持: ${capabilities.nativeRecursive ? '原生支持' : '手动实现'}\n`;
    result += `监控器数量: ${capabilities.watchersCount}\n`;
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

    if (stats) {
      result += `\n性能统计:\n`;
      result += `事件总数: ${stats.eventsCount}\n`;
      result += `运行时间: ${stats.uptime}ms\n`;
    }

    return result;
  }

  cleanup() {
    for (const watcher of this.activeWatchers.values()) {
      watcher.stop();
    }
    this.activeWatchers.clear();
  }

  getActiveWatchersStats() {
    const stats = [];
    for (const [path, watcher] of this.activeWatchers.entries()) {
      stats.push({
        path,
        ...watcher.getStats()
      });
    }
    return stats;
  }

  supportsRecursiveWatch() {
    return platformUtils.supportsRecursiveWatch();
  }
}

module.exports = FileWatchTool;
