/**
 * 文件哈希工具模块
 * 支持计算文件的MD5、SHA1、SHA256哈希值
 */

const fs = require('fs').promises;
const crypto = require('crypto');
const { buildOutput } = require('../lib/output');

class FileHashTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
  const { path: filePath, file_path, algorithm = 'md5', output_format = 'text' } = args;
    const target = filePath || file_path;
    if (!target) {
      throw new Error('缺少 path 或 file_path 参数');
    }

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(target)) {
      throw new Error(`不允许操作路径: ${target}`);
    }

    // 验证算法
    const supportedAlgorithms = ['md5', 'sha1', 'sha256', 'sha512'];
    if (!supportedAlgorithms.includes(algorithm.toLowerCase())) {
      throw new Error(`不支持的哈希算法: ${algorithm}。支持的算法: ${supportedAlgorithms.join(', ')}`);
    }

    try {
  const hash = await this.calculateFileHash(target, algorithm.toLowerCase());
  const stats = await fs.stat(target);
      
      const jsonObj = { path: target, algorithm: algorithm.toUpperCase(), hash, size: stats.size, mtime: stats.mtime.toISOString() };
      return buildOutput(output_format, `文件哈希计算结果:\n文件: ${target}\n算法: ${algorithm.toUpperCase()}\n哈希值: ${hash}\n文件大小: ${stats.size} 字节\n修改时间: ${stats.mtime.toISOString()}`, jsonObj);

    } catch (error) {
      if (error.code === 'ENOENT') {
  throw new Error(`文件不存在: ${target}`);
      } else if (error.code === 'EACCES') {
  throw new Error(`没有权限读取文件: ${target}`);
      } else {
        throw new Error(`计算哈希失败: ${error.message}`);
      }
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
