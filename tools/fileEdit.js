/**
 * 文件编辑工具模块
 * 支持删除行、插入行、替换行、追加行等操作
 * 保留原文件行尾风格（CRLF/LF），支持 working_directory
 */

const fs = require('fs').promises;
const { ERR } = require('../errors');

class FileEditTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const {
      operation,
      path: filePath,
      file_path,
      start_line,
      end_line,
      content,
      encoding = 'utf8',
      working_directory,
      working_dir,
      output_format = 'text'
    } = args;

    const rawTarget = filePath || file_path;
    if (!rawTarget) throw ERR.INVALID_ARGS('缺少 path 或 file_path 参数');

    const workDir = working_directory || working_dir;

    // 使用 resolveAndAssert 解析并验证路径（支持全路径）
    let target;
    try {
      target = this.securityValidator.resolveAndAssert(rawTarget, workDir);
    } catch (e) {
      if (e.code === 'E_PATH_DENIED') throw e;
      throw ERR.PATH_DENIED(rawTarget);
    }

    try {
      // 读取文件，保留原始内容以检测行尾风格
      const rawContent = await fs.readFile(target, encoding);

      // 检测行尾风格：如果有 \r\n 则为 CRLF，否则为 LF
      const hasCRLF = rawContent.includes('\r\n');
      const eol = hasCRLF ? '\r\n' : '\n';

      // 分割时统一去掉 \r，操作完成后再按原风格写回
      const lines = rawContent.split(/\r?\n/);
      const totalLines = lines.length;

      let modifiedLines = [...lines];
      let result;

      switch (operation) {
        case 'delete_lines': {
          if (start_line == null || end_line == null) {
            throw ERR.INVALID_ARGS('删除行操作需要指定 start_line 和 end_line');
          }
          if (start_line < 1 || end_line > totalLines || start_line > end_line) {
            throw ERR.INVALID_ARGS(`行号范围无效: ${start_line}-${end_line}，文件总行数: ${totalLines}`);
          }
          modifiedLines = lines.filter((_, i) => i < start_line - 1 || i >= end_line);
          result = `成功删除第 ${start_line} 到第 ${end_line} 行`;
          break;
        }

        case 'insert_lines': {
          if (start_line == null || !content) {
            throw ERR.INVALID_ARGS('插入行操作需要指定 start_line 和 content');
          }
          if (start_line < 1 || start_line > totalLines + 1) {
            throw ERR.INVALID_ARGS(`插入位置无效: ${start_line}，文件总行数: ${totalLines}`);
          }
          const insertContent = content.split(/\r?\n/);
          modifiedLines.splice(start_line - 1, 0, ...insertContent);
          result = `成功在第 ${start_line} 行插入内容`;
          break;
        }

        case 'replace_lines': {
          if (start_line == null || end_line == null || !content) {
            throw ERR.INVALID_ARGS('替换行操作需要指定 start_line、end_line 和 content');
          }
          if (start_line < 1 || end_line > totalLines || start_line > end_line) {
            throw ERR.INVALID_ARGS(`行号范围无效: ${start_line}-${end_line}，文件总行数: ${totalLines}`);
          }
          const replaceContent = content.split(/\r?\n/);
          modifiedLines.splice(start_line - 1, end_line - start_line + 1, ...replaceContent);
          result = `成功替换第 ${start_line} 到第 ${end_line} 行`;
          break;
        }

        case 'append_lines': {
          if (!content) throw ERR.INVALID_ARGS('追加行操作需要指定 content');
          const appendContent = content.split(/\r?\n/);
          modifiedLines.push(...appendContent);
          result = `成功在文件末尾追加内容`;
          break;
        }

        default:
          throw ERR.INVALID_ARGS(`不支持的操作类型: ${operation}`);
      }

      // 按原文件行尾风格写回
      const newContent = modifiedLines.join(eol);
      await fs.writeFile(target, newContent, encoding);

      if (output_format === 'json') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              action: operation,
              path: target,
              eol: hasCRLF ? 'CRLF' : 'LF',
              total_lines_before: totalLines,
              total_lines_after: modifiedLines.length
            })
          }]
        };
      }
      return {
        content: [{
          type: 'text',
          text: `${result}\n文件: ${target}\n总行数: ${totalLines} → ${modifiedLines.length}`
        }]
      };

    } catch (error) {
      if (error.code && error.code.startsWith('E_')) throw error;
      if (error.code === 'ENOENT') throw ERR.NOT_FOUND(target);
      if (error.code === 'EACCES') throw ERR.INVALID_ARGS(`没有权限操作文件: ${target}`);
      throw ERR.INVALID_ARGS(`文件编辑失败: ${error.message}`);
    }
  }
}

module.exports = FileEditTool;
