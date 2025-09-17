/**
 * 文件哈希工具模块
 * 支持计算文件的MD5、SHA1、SHA256哈希值
 */

const fs = require('fs').promises;
const crypto = require('crypto');

class FileHashTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  async handle(args) {
    const { path: filePath, algorithm = 'md5' } = args;

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(filePath)) {
      throw new Error(`不允许操作路径: ${filePath}`);
    }

    // 验证算法
    const supportedAlgorithms = ['md5', 'sha1', 'sha256', 'sha512'];
    if (!supportedAlgorithms.includes(algorithm.toLowerCase())) {
      throw new Error(`不支持的哈希算法: ${algorithm}。支持的算法: ${supportedAlgorithms.join(', ')}`);
    }

    try {
      const hash = await this.calculateFileHash(filePath, algorithm.toLowerCase());
      const stats = await fs.stat(filePath);
      
      return {
        content: [
          {
            type: 'text',
            text: `文件哈希计算结果:\n文件: ${filePath}\n算法: ${algorithm.toUpperCase()}\n哈希值: ${hash}\n文件大小: ${stats.size} 字节\n修改时间: ${stats.mtime.toISOString()}`
          }
        ]
      };

    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`文件不存在: ${filePath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`没有权限读取文件: ${filePath}`);
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
