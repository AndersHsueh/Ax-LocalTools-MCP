/**
 * 文件哈希工具模块
 * 支持计算文件的MD5、SHA1、SHA256哈希值
 */

const fs = require('fs').promises;
const crypto = require('crypto');
const { buildOutput } = require('../lib/output');
const { ERR } = require('../errors');

class FileHashTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const { path: filePath, file_path, algorithm = 'md5', output_format = 'text',
      working_directory, working_dir } = args;
    const rawTarget = filePath || file_path;
    if (!rawTarget) {
      throw ERR.INVALID_ARGS('缺少 path 或 file_path 参数');
    }

    const workDir = working_directory || working_dir;

    // 解析后统一使用绝对路径校验 + 计算，避免"校验的是 A、读的是 B"
    const target = this.securityValidator.resolveAndAssert(rawTarget, workDir);

    // 验证算法
    const supportedAlgorithms = ['md5', 'sha1', 'sha256', 'sha512'];
    if (!supportedAlgorithms.includes(String(algorithm).toLowerCase())) {
      throw ERR.INVALID_ARGS(`不支持的哈希算法: ${algorithm}。支持的算法: ${supportedAlgorithms.join(', ')}`);
    }

    try {
      const hash = await this.calculateFileHash(target, algorithm.toLowerCase());
      const stats = await fs.stat(target);

      const jsonObj = { path: target, algorithm: algorithm.toUpperCase(), hash, size: stats.size, mtime: stats.mtime.toISOString() };
      return buildOutput(output_format, `文件哈希计算结果:\n文件: ${target}\n算法: ${algorithm.toUpperCase()}\n哈希值: ${hash}\n文件大小: ${stats.size} 字节\n修改时间: ${stats.mtime.toISOString()}`, jsonObj);

    } catch (error) {
      if (error.code === 'E_PATH_DENIED') throw error;
      if (error.code === 'ENOENT') throw ERR.NOT_FOUND(target);
      if (error.code === 'EACCES') throw ERR.INVALID_ARGS(`没有权限读取文件: ${target}`);
      throw ERR.INVALID_ARGS(`计算哈希失败: ${error.message}`);
    }
  }

  async calculateFileHash(filePath, algorithm) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash(algorithm);
      const stream = require('fs').createReadStream(filePath);
      
      stream.on('data', (data) => {
        hash.update(data);
      });
      
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }
}

module.exports = FileHashTool;
