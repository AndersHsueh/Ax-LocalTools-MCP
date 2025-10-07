/**
 * 文件搜索工具模块
 * 支持在文件中搜索内容，支持正则表达式
 */

const fs = require('fs').promises;
const path = require('path');

class FileSearchTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const { 
      search_path,
      root_path,
      pattern, 
      file_types = '*', 
      case_sensitive = false,
      max_results = 100,
      max_depth = 8,
      timeout_ms = 5000,
      ignore = [],
      output_format = 'text'
    } = args;
    const targetPath = search_path || root_path;
    if (!targetPath) throw new Error('缺少搜索路径参数: 需要 search_path 或 root_path');

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(targetPath)) {
      throw new Error(`不允许搜索路径: ${targetPath}`);
    }

    try {
  const controller = { cancelled: false };
  const timer = setTimeout(()=> { controller.cancelled = true; }, timeout_ms);
  const started = Date.now();
  const results = await this.searchInDirectory(targetPath, pattern, file_types, case_sensitive, max_results, 0, max_depth, this.normalizeIgnore(ignore), controller);
  clearTimeout(timer);
  const elapsed = Date.now() - started;
      
      const summary = {
        pattern,
        path: targetPath,
        matches: results.length,
        max_results,
        truncated: results.length >= max_results,
        depth_limit: max_depth,
        elapsed_ms: elapsed,
        timeout_ms,
        timed_out: controller.cancelled,
        case_sensitive,
        file_types,
        ignore_normalized: this.normalizeIgnore(ignore)
      };

      if (results.length === 0) {
        if (output_format === 'json') {
          return { content: [{ type: 'json', json: { ...summary, results: [] } }] };
        } else if (output_format === 'both') {
          return { content: [
            { type: 'text', text: `未找到匹配: pattern="${pattern}" path=${targetPath}` },
            { type: 'json', json: { ...summary, results: [] } }
          ]};
        }
        return { content: [{ type: 'text', text: `在 ${targetPath} 中未找到匹配 "${pattern}" 的内容` }] };
      }

      const resultText = results.map(result => 
        `文件: ${result.file}\n行 ${result.line}: ${result.content}\n${'='.repeat(50)}`
      ).join('\n');

      if (output_format === 'json') {
        return { content: [{ type: 'json', json: { ...summary, results } }] };
      } else if (output_format === 'both') {
        return { content: [
          { type: 'text', text: `搜索结果 (${results.length} 个匹配) | depth<=${max_depth} | 用时 ${elapsed}ms${controller.cancelled ? ' (超时截断)' : ''}:\n\n${resultText}` },
          { type: 'json', json: { ...summary, results } }
        ]};
      }
      return { content: [{ type: 'text', text: `搜索结果 (${results.length} 个匹配) | depth<=${max_depth} | 用时 ${elapsed}ms${controller.cancelled ? ' (超时截断)' : ''}:\n\n${resultText}` }] };

    } catch (error) {
      throw new Error(`搜索失败: ${error.message}`);
    }
  }

  async searchInDirectory(dirPath, pattern, fileTypes, caseSensitive, maxResults, depth, maxDepth, ignoreList, controller) {
    const results = [];
    const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

    try {
      if (controller.cancelled) return results;
      if (depth > maxDepth) return results;
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        if (results.length >= maxResults) break;
        if (controller.cancelled) break;
        if (this.isIgnored(item.name, ignoreList)) continue;

        const fullPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          const subResults = await this.searchInDirectory(fullPath, pattern, fileTypes, caseSensitive, maxResults - results.length, depth + 1, maxDepth, ignoreList, controller);
          results.push(...subResults);
        } else if (item.isFile()) {
          // 检查文件类型
          if (this.matchesFileType(item.name, fileTypes)) {
            const fileResults = await this.searchInFile(fullPath, regex, maxResults - results.length);
            results.push(...fileResults);
          }
        }
      }
    } catch (error) {
      // 忽略权限错误，继续搜索其他文件
      if (error.code !== 'EACCES') {
        throw error;
      }
    }

    return results;
  }

  async searchInFile(filePath, regex, maxResults) {
    const results = [];
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        const line = lines[i];
        const matches = line.match(regex);
        
        if (matches) {
          results.push({
            file: filePath,
            line: i + 1,
            content: line.trim()
          });
        }
      }
    } catch (error) {
      // 忽略无法读取的文件
      if (error.code !== 'EACCES' && error.code !== 'ENOENT') {
        throw error;
      }
    }

    return results;
  }

  matchesFileType(fileName, fileTypes) {
    if (fileTypes === '*') return true;
    
    const extensions = fileTypes.split(',').map(ext => ext.trim().toLowerCase());
    const fileExt = path.extname(fileName).toLowerCase().substring(1);
    
    return extensions.includes(fileExt) || extensions.includes('*');
  }

  normalizeIgnore(ignore) {
    if (Array.isArray(ignore)) return ignore.filter(Boolean);
    if (typeof ignore === 'string') return ignore.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  }

  isIgnored(name, ignoreList) {
    return ignoreList.some(pattern => {
      if (pattern === name) return true;
      if (pattern.startsWith('*') && name.endsWith(pattern.slice(1))) return true;
      if (pattern.endsWith('*') && name.startsWith(pattern.slice(0, -1))) return true;
      return false;
    });
  }
}

module.exports = FileSearchTool;
