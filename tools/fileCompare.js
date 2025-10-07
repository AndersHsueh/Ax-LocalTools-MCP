/**
 * 文件比较工具模块
 * 支持比较两个文件的差异
 */

const fs = require('fs').promises;
const crypto = require('crypto');

class FileCompareTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const { file1, file2, source_path, target_path, output_format = 'text' } = args;
    const left = file1 || source_path;
    const right = file2 || target_path;
    if (!left || !right) throw new Error('缺少文件参数: 需要 file1/file2 或 source_path/target_path');

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(left) || !this.securityValidator.isPathAllowed(right)) {
      throw new Error('不允许比较指定路径的文件');
    }

    try {
      const [content1, content2] = await Promise.all([
        fs.readFile(left, 'utf8'),
        fs.readFile(right, 'utf8')
      ]);

      const comparison = this.compareContents(content1, content2, left, right);
      const stats = this.diffStats(comparison.differences);
      const payload = { ...comparison, diff_stats: stats };
      
      if (output_format === 'json') {
        return { content: [{ type: 'json', json: payload }] };
      } else if (output_format === 'both') {
        return { content: [
          { type: 'text', text: this.formatTextComparison(payload) },
          { type: 'json', json: payload }
        ]};
      }
      return { content: [{ type: 'text', text: this.formatTextComparison(payload) }] };

    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`文件不存在: ${error.path}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`没有权限读取文件: ${error.path}`);
      } else {
        throw new Error(`比较文件失败: ${error.message}`);
      }
    }
  }

  compareContents(content1, content2, file1, file2) {
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');
    
    const maxLines = Math.max(lines1.length, lines2.length);
    const differences = [];
    
    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i] || '';
      const line2 = lines2[i] || '';
      
      if (line1 !== line2) {
        differences.push({
          line: i + 1,
          file1_content: line1,
          file2_content: line2,
          type: line1 === '' ? 'added' : line2 === '' ? 'removed' : 'modified'
        });
      }
    }

    // 计算文件哈希
    const hash1 = crypto.createHash('md5').update(content1).digest('hex');
    const hash2 = crypto.createHash('md5').update(content2).digest('hex');

    return {
      files: {
        file1: file1,
        file2: file2
      },
      identical: differences.length === 0,
      total_lines: {
        file1: lines1.length,
        file2: lines2.length
      },
      differences_count: differences.length,
      differences: differences,
      hashes: {
        file1: hash1,
        file2: hash2
      }
    };
  }

  formatTextComparison(comparison) {
    let result = `文件比较结果:\n`;
    result += `文件1: ${comparison.files.file1}\n`;
    result += `文件2: ${comparison.files.file2}\n`;
    result += `行数: ${comparison.total_lines.file1} vs ${comparison.total_lines.file2}\n`;
    result += `差异数量: ${comparison.differences_count}\n`;
    result += `是否相同: ${comparison.identical ? '是' : '否'}\n\n`;

    if (comparison.differences_count > 0) {
      result += `差异详情:\n`;
      result += `${'='.repeat(60)}\n`;
      
      comparison.differences.forEach(diff => {
        result += `行 ${diff.line}:\n`;
        result += `  文件1: ${diff.file1_content}\n`;
        result += `  文件2: ${diff.file2_content}\n`;
        result += `  类型: ${diff.type}\n`;
        result += `${'-'.repeat(40)}\n`;
      });
    }

    return result;
  }

  diffStats(differences) {
    const stats = { added: 0, removed: 0, modified: 0 };
    for (const d of differences) {
      if (d.type === 'added') stats.added++;
      else if (d.type === 'removed') stats.removed++;
      else if (d.type === 'modified') stats.modified++;
    }
    return stats;
  }
}

module.exports = FileCompareTool;
