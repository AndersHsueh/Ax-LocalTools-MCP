/**
 * 文件搜索工具模块
 * 支持在文件中搜索内容，支持正则表达式
 */

const fs = require('fs').promises;
const path = require('path');
const { buildOutput } = require('../lib/output');
const { ERR } = require('../errors');

// 默认忽略的目录：不忽略的话 search_path="." 会扫进依赖和版本库
const DEFAULT_IGNORE = ['node_modules', '.git'];

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
      output_format = 'text',
      working_directory,
      working_dir
    } = args;
    const rawTarget = search_path || root_path;
    if (!rawTarget) throw ERR.INVALID_ARGS('缺少搜索路径参数: 需要 search_path 或 root_path');
    if (!pattern) throw ERR.INVALID_ARGS('缺少 pattern 参数');

    const workDir = working_directory || working_dir;

    // 解析成绝对路径后统一使用，避免校验对象与实际遍历目录不一致
    const targetPath = this.securityValidator.resolveAndAssert(rawTarget, workDir);

    let regex;
    try {
      regex = new RegExp(pattern, case_sensitive ? '' : 'i');
    } catch (e) {
      throw ERR.INVALID_ARGS(`正则表达式无效: ${e.message}`);
    }

    const ignoreList = [...new Set([...DEFAULT_IGNORE, ...this.normalizeIgnore(ignore)])];

    try {
      const controller = { cancelled: false };
      const timer = setTimeout(() => { controller.cancelled = true; }, timeout_ms);
      const started = Date.now();
      const results = await this.searchInDirectory(targetPath, regex, file_types, max_results, 0, max_depth, ignoreList, controller);
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
        ignore_normalized: ignoreList
      };

      if (results.length === 0) {
        return buildOutput(output_format,
          `在 ${targetPath} 中未找到匹配 "${pattern}" 的内容`,
          { ...summary, results: [] });
      }

      const resultText = results.map(result =>
        `文件: ${result.file}\n行 ${result.line}: ${result.content}\n${'='.repeat(50)}`
      ).join('\n');

      const header = `搜索结果 (${results.length} 个匹配) | depth<=${max_depth} | 用时 ${elapsed}ms${controller.cancelled ? ' (超时截断)' : ''}`;
      return buildOutput(output_format, `${header}:\n\n${resultText}`, { ...summary, results });

    } catch (error) {
      if (error.code === 'E_PATH_DENIED') throw error;
      if (error.code === 'ENOENT') throw ERR.NOT_FOUND(targetPath);
      throw ERR.INVALID_ARGS(`搜索失败: ${error.message}`);
    }
  }

  async searchInDirectory(dirPath, regex, fileTypes, maxResults, depth, maxDepth, ignoreList, controller) {
    const results = [];

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
          const subResults = await this.searchInDirectory(fullPath, regex, fileTypes, maxResults - results.length, depth + 1, maxDepth, ignoreList, controller);
          results.push(...subResults);
        } else if (item.isFile()) {
          if (this.matchesFileType(item.name, fileTypes)) {
            const fileResults = await this.searchInFile(fullPath, regex, maxResults - results.length, controller);
            results.push(...fileResults);
          }
        }
      }
    } catch (error) {
      // 忽略权限错误，继续搜索其他文件
      if (error.code !== 'EACCES' && error.code !== 'ENOENT') {
        throw error;
      }
    }

    return results;
  }

  async searchInFile(filePath, regex, maxResults, controller = { cancelled: false }) {
    const results = [];

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        // 大文件里也要响应超时，否则单个文件就能把进程卡死
        if ((i & 0x3ff) === 0 && controller.cancelled) break;

        const line = lines[i];
        if (regex.test(line)) {
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
