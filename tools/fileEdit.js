/**
 * 文件编辑工具模块
 * 支持删除行、插入行、替换行、追加行等操作
 */

const fs = require('fs').promises;

class FileEditTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const { operation, path: filePath, file_path, start_line, end_line, content, encoding = 'utf8', output_format = 'text' } = args;
    const target = filePath || file_path;
    if (!target) throw new Error('缺少 path 或 file_path 参数');

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(target)) {
      throw new Error(`不允许操作路径: ${target}`);
    }

    try {
      // 读取文件内容
  const fileContent = await fs.readFile(target, encoding);
      const lines = fileContent.split(/\r?\n/);
      const totalLines = lines.length;

      let result;
      let modifiedLines = [...lines];

      switch (operation) {
        case 'delete_lines':
          if (!start_line || !end_line) {
            throw new Error('删除行操作需要指定 start_line 和 end_line');
          }
          if (start_line < 1 || end_line > totalLines || start_line > end_line) {
            throw new Error(`行号范围无效: ${start_line}-${end_line}，文件总行数: ${totalLines}`);
          }
          modifiedLines = lines.filter((_, index) => index < start_line - 1 || index >= end_line);
          result = `成功删除第 ${start_line} 到第 ${end_line} 行`;
          break;

        case 'insert_lines':
          if (!start_line || !content) {
            throw new Error('插入行操作需要指定 start_line 和 content');
          }
          if (start_line < 1 || start_line > totalLines + 1) {
            throw new Error(`插入位置无效: ${start_line}，文件总行数: ${totalLines}`);
          }
          const insertContent = content.split(/\r?\n/);
          modifiedLines.splice(start_line - 1, 0, ...insertContent);
          result = `成功在第 ${start_line} 行插入内容`;
          break;

        case 'replace_lines':
          if (!start_line || !end_line || !content) {
            throw new Error('替换行操作需要指定 start_line、end_line 和 content');
          }
          if (start_line < 1 || end_line > totalLines || start_line > end_line) {
            throw new Error(`行号范围无效: ${start_line}-${end_line}，文件总行数: ${totalLines}`);
          }
          const replaceContent = content.split(/\r?\n/);
          modifiedLines.splice(start_line - 1, end_line - start_line + 1, ...replaceContent);
          result = `成功替换第 ${start_line} 到第 ${end_line} 行`;
          break;

        case 'append_lines':
          if (!content) {
            throw new Error('追加行操作需要指定 content');
          }
          const appendContent = content.split(/\r?\n/);
          modifiedLines.push(...appendContent);
          result = `成功在文件末尾追加内容`;
          break;

        default:
          throw new Error(`不支持的操作类型: ${operation}`);
      }

      // 写回文件
      const newContent = modifiedLines.join('\n');
      await fs.writeFile(target, newContent, encoding);
      if (output_format === 'json') {
        return { content: [{ type: 'json', json: { action: operation, path: target, total_lines_before: totalLines, total_lines_after: modifiedLines.length } }] };
      }
      return { content: [{ type: 'text', text: `${result}\n文件: ${target}\n总行数: ${totalLines} → ${modifiedLines.length}` }] };

    } catch (error) {
      if (error.code === 'ENOENT') {
  throw new Error(`文件不存在: ${target}`);
      } else if (error.code === 'EACCES') {
  throw new Error(`没有权限操作文件: ${target}`);
      } else {
        throw new Error(`文件编辑失败: ${error.message}`);
      }
    }
  }
}

module.exports = FileEditTool;
