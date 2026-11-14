/**
 * 文件编辑工具模块
 * 支持删除行、插入行、替换行、追加行等操作
 * 保留原文件行尾风格（CRLF/LF），支持 working_directory
 * 修改前自动备份到 <文件>.bak
 */

const fs = require('fs').promises;
const { ERR } = require('../errors');
const { buildOutput } = require('../lib/output');

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
      output_format = 'text',
      backup = true
    } = args;

    const rawTarget = filePath || file_path;
    if (!rawTarget) throw ERR.INVALID_ARGS('缺少 path 或 file_path 参数');

    const workDir = working_directory || working_dir;

    // 使用 resolveAndAssert 解析并验证路径（支持全路径）
    const target = this.securityValidator.resolveAndAssert(rawTarget, workDir);

    for (const [name, v] of [['start_line', start_line], ['end_line', end_line]]) {
      if (v != null && (!Number.isInteger(v) || v < 1)) {
        throw ERR.INVALID_ARGS(`${name} 必须是不小于 1 的整数，实际: ${v}`);
      }
    }

    try {
      // 读取文件，保留原始内容以检测行尾风格
      const rawContent = await fs.readFile(target, encoding);

      // 检测行尾风格：如果有 \r\n 则为 CRLF，否则为 LF
      const hasCRLF = rawContent.includes('\r\n');
      const eol = hasCRLF ? '\r\n' : '\n';

      // 统一按 LF 分割（去掉 \r），操作完成后再按原风格写回
      const allLines = rawContent.split(/\r?\n/);

      // 文件以换行结尾时，split 会多出一个空串。它不是"最后一行"，
      // 必须单独记下来，否则行号会整体偏移、追加时会多出空行。
      const trailingNewline = allLines.length > 0 && allLines[allLines.length - 1] === '';
      const lines = trailingNewline ? allLines.slice(0, -1) : allLines;

      const totalLines = lines.length;
      let modifiedLines = [...lines];
      let result;

      switch (operation) {
        case 'delete_lines': {
          if (start_line == null || end_line == null) {
            throw ERR.INVALID_ARGS('删除行操作需要指定 start_line 和 end_line');
          }
          if (start_line > end_line) {
            throw ERR.INVALID_ARGS(`行号范围无效: ${start_line}-${end_line}`);
          }
          if (start_line > totalLines) {
            throw ERR.INVALID_ARGS(`行号超出范围: ${start_line}，文件总行数: ${totalLines}`);
          }
          const end = Math.min(end_line, totalLines);
          modifiedLines = lines.filter((_, i) => i < start_line - 1 || i >= end);
          result = `成功删除第 ${start_line} 到第 ${end} 行`;
          break;
        }

        case 'insert_lines': {
          if (start_line == null || content == null) {
            throw ERR.INVALID_ARGS('插入行操作需要指定 start_line 和 content');
          }
          if (start_line > totalLines + 1) {
            throw ERR.INVALID_ARGS(`插入位置无效: ${start_line}，文件总行数: ${totalLines}`);
          }
          const insertContent = String(content).split(/\r?\n/);
          modifiedLines.splice(start_line - 1, 0, ...insertContent);
          result = `成功在第 ${start_line} 行插入内容`;
          break;
        }

        case 'replace_lines': {
          if (start_line == null || end_line == null || content == null) {
            throw ERR.INVALID_ARGS('替换行操作需要指定 start_line、end_line 和 content');
          }
          if (start_line > end_line) {
            throw ERR.INVALID_ARGS(`行号范围无效: ${start_line}-${end_line}`);
          }
          if (start_line > totalLines) {
            throw ERR.INVALID_ARGS(`行号超出范围: ${start_line}，文件总行数: ${totalLines}`);
          }
          const end = Math.min(end_line, totalLines);
          const replaceContent = String(content).split(/\r?\n/);
          modifiedLines.splice(start_line - 1, end - start_line + 1, ...replaceContent);
          result = `成功替换第 ${start_line} 到第 ${end} 行`;
          break;
        }

        case 'append_lines': {
          if (content == null) throw ERR.INVALID_ARGS('追加行操作需要指定 content');
          const appendContent = String(content).split(/\r?\n/);
          modifiedLines.push(...appendContent);
          result = '成功在文件末尾追加内容';
          break;
        }

        default:
          throw ERR.INVALID_ARGS(`不支持的操作类型: ${operation}`);
      }

      // 备份原文件（描述承诺"操作前自动备份"）
      let backupPath = null;
      if (backup) {
        backupPath = `${target}.bak`;
        await fs.writeFile(backupPath, rawContent, encoding);
      }

      // 按原文件行尾风格写回；原文件以换行结尾则保持以换行结尾
      const newContent = modifiedLines.join(eol) + (trailingNewline ? eol : '');
      await fs.writeFile(target, newContent, encoding);

      const payload = {
        action: operation,
        path: target,
        backup_path: backupPath,
        eol: hasCRLF ? 'CRLF' : 'LF',
        total_lines_before: totalLines,
        total_lines_after: modifiedLines.length
      };

      const text = `${result}\n文件: ${target}\n总行数: ${totalLines} → ${modifiedLines.length}` +
        (backupPath ? `\n备份: ${backupPath}` : '');
      return buildOutput(output_format, text, payload);

    } catch (error) {
      if (error.code && String(error.code).startsWith('E_')) throw error;
      if (error.code === 'ENOENT') throw ERR.NOT_FOUND(target);
      if (error.code === 'EACCES') throw ERR.INVALID_ARGS(`没有权限操作文件: ${target}`);
      throw ERR.INVALID_ARGS(`文件编辑失败: ${error.message}`);
    }
  }
}

module.exports = FileEditTool;
