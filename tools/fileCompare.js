/**
 * 文件比较工具模块
 * 支持比较两个文件的差异
 */

const fs = require('fs').promises;
const crypto = require('crypto');
const { buildOutput } = require('../lib/output');
const { ERR } = require('../errors');

class FileCompareTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const { file1, file2, source_path, target_path, output_format = 'text',
            working_directory, working_dir } = args;
    const leftRaw = file1 || source_path;
    const rightRaw = file2 || target_path;
    if (!leftRaw || !rightRaw) throw ERR.INVALID_ARGS('缺少文件参数: 需要 file1/file2 或 source_path/target_path');

    const workDir = working_directory || working_dir;

    // 必须先解析成绝对路径，再用同一个绝对路径做校验和读取
    // （否则校验对象与实际操作对象不一致，相对路径会按 process.cwd() 解析）
    const left = this.securityValidator.resolveAndAssert(leftRaw, workDir);
    const right = this.securityValidator.resolveAndAssert(rightRaw, workDir);

    try {
      const [content1, content2] = await Promise.all([
        fs.readFile(left, 'utf8'),
        fs.readFile(right, 'utf8')
      ]);

      const comparison = this.compareContents(content1, content2, left, right);
      const stats = this.diffStats(comparison.differences);
      const payload = { ...comparison, diff_stats: stats };

      return buildOutput(output_format, this.formatTextComparison(payload), payload);

    } catch (error) {
      if (error.code === 'E_PATH_DENIED') throw error;
      if (error.code === 'ENOENT') throw ERR.NOT_FOUND(error.path || leftRaw);
      if (error.code === 'EACCES') throw ERR.INVALID_ARGS(`没有权限读取文件: ${error.path}`);
      throw ERR.INVALID_ARGS(`比较文件失败: ${error.message}`);
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
