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
      pattern, 
      file_types = '*', 
      case_sensitive = false,
      max_results = 100 
    } = args;

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(search_path)) {
      throw new Error(`不允许搜索路径: ${search_path}`);
    }

    try {
      const results = await this.searchInDirectory(search_path, pattern, file_types, case_sensitive, max_results);
      
      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `在 ${search_path} 中未找到匹配 "${pattern}" 的内容`
            }
          ]
        };
      }

      const resultText = results.map(result => 
        `文件: ${result.file}\n行 ${result.line}: ${result.content}\n${'='.repeat(50)}`
      ).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `搜索结果 (${results.length} 个匹配):\n\n${resultText}`
          }
        ]
      };

    } catch (error) {
      throw new Error(`搜索失败: ${error.message}`);
    }
  }

  async searchInDirectory(dirPath, pattern, fileTypes, caseSensitive, maxResults) {
    const results = [];
    const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          // 递归搜索子目录
          const subResults = await this.searchInDirectory(fullPath, pattern, fileTypes, caseSensitive, maxResults - results.length);
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
}

module.exports = FileSearchTool;
