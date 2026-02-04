/**
 * 文件操作工具模块
 * 支持读取、写入、列表目录、创建目录、删除文件等操作
 * 包含文件大小限制，防止内存溢出
 */

const fs = require('fs').promises;
const path = require('path');
const { buildOutput } = require('../lib/output');
const { ERR } = require('../errors');

// 配置常量
const MAX_FILE_SIZE = 10 * 1024 * 1024;  // 最大文件大小: 10MB
const MAX_READ_SIZE = 2 * 1024 * 1024;   // 最大读取内容: 2MB（用于输出）
const MAX_ENTRIES = 1000;                // 目录列表最大条目数

class FileOperationTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  // 兼容旧方法（将逐步移除）
  resolvePath(filePath, workingDirectory = null) {
    return this.securityValidator.resolveAndAssert(filePath, workingDirectory);
  }

  async handle(args) {
    const {
      operation,
      path: filePath,
      file_path,
      dir_path,
      content,
      working_directory,
      output_format = 'text',
      max_size = MAX_FILE_SIZE
    } = args;

    const targetPath = filePath || file_path || dir_path; // alias 归一
    if (!targetPath) throw ERR.INVALID_ARGS('缺少 path/file_path/dir_path 参数');

    // 检查路径是否被允许（支持工作目录；相对路径默认home）
    if (!this.securityValidator.isPathAllowed(targetPath, working_directory)) {
      throw ERR.PATH_DENIED(targetPath);
    }

    switch (operation) {
      case 'read':
        return await this.readFile(targetPath, working_directory, output_format, max_size);
      case 'write':
        return await this.writeFile(targetPath, content, working_directory, output_format, max_size);
      case 'list':
        return await this.listDirectory(targetPath, working_directory, output_format);
      case 'create_dir':
        return await this.createDirectory(targetPath, working_directory, output_format);
      case 'delete':
        return await this.deleteFileOrDirectory(targetPath, working_directory, output_format);
      default:
        throw new Error(`不支持的操作类型: ${operation}`);
    }
  }

  async readFile(filePath, workingDirectory = null, outputFormat, maxSize = MAX_FILE_SIZE) {
    try {
      const fullPath = this.securityValidator.resolveAndAssert(filePath, workingDirectory);

      // 检查文件大小
      const stats = await fs.stat(fullPath);
      if (stats.size > maxSize) {
        throw ERR.FILE_TOO_LARGE(stats.size, maxSize);
      }

      // 读取文件的前几个字节来检测是否为二进制文件
      const fd = await fs.open(fullPath, 'r');
      const buffer = Buffer.alloc(512); // 读取前512字节作为样本
      const { bytesRead } = await fd.read(buffer, 0, 512, 0);
      await fd.close();

      // 检查已读取的字节范围（0到bytesRead）是否包含null字节，这通常是二进制文件的标志
      let isBinary = false;
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          isBinary = true;
          break;
        }
      }

      if (isBinary) {
        throw new Error(`不支持读取二进制文件: ${filePath}`);
      }

      // 更精确地检查：检查已读取的字节中是否包含过多的不可打印字符，也可能是二进制文件
      let binaryCount = 0;
      let totalChecked = 0;
      for (let i = 0; i < bytesRead; i++) {
        totalChecked++;
        // 检查是否为不可打印的ASCII字符（除了常见的空白字符等）
        if ((buffer[i] < 32 && ![0x09, 0x0A, 0x0D].includes(buffer[i])) || buffer[i] === 0x7F) {
          binaryCount++;
        }
      }

      // 如果不可打印字符超过一定比例，判定为二进制文件
      if (totalChecked > 0 && (binaryCount / totalChecked) > 0.3) {
        throw new Error(`不支持读取二进制文件: ${filePath}`);
      }

      // 如果不是二进制文件，则正常读取全部内容
      let contentData = await fs.readFile(fullPath, 'utf8');

      // 限制输出内容大小
      let truncated = false;
      if (contentData.length > MAX_READ_SIZE) {
        contentData = contentData.slice(0, MAX_READ_SIZE);
        truncated = true;
      }

      const resultData = {
        action: 'read',
        path: fullPath,
        content: contentData,
        size: stats.size,
        truncated
      };

      const truncationMsg = truncated ? `\n\n[内容已截断，显示前 ${formatBytes(MAX_READ_SIZE)}]` : '';
      return buildOutput(outputFormat, `文件内容 (${fullPath}, ${formatBytes(stats.size)}):\n${contentData}${truncationMsg}`, resultData);
    } catch (error) {
      if (error.code === 'E_FILE_TOO_LARGE') throw error;
      if (error.message.includes('不支持读取二进制文件')) {
        throw ERR.INVALID_ARGS(error.message);
      } else if (error.code === 'ENOENT') {
        throw ERR.NOT_FOUND(filePath);
      } else if (error.code === 'E_PATH_DENIED') {
        throw error;
      } else {
        throw ERR.INVALID_ARGS(`读取文件失败: ${error.message}`);
      }
    }
  }

  async writeFile(filePath, content, workingDirectory = null, outputFormat, maxSize = MAX_FILE_SIZE) {
    try {
      const fullPath = this.securityValidator.resolveAndAssert(filePath, workingDirectory);
      const contentBytes = Buffer.byteLength(content || '', 'utf8');

      // 检查写入大小
      if (contentBytes > maxSize) {
        throw ERR.FILE_TOO_LARGE(contentBytes, maxSize);
      }

      await fs.writeFile(fullPath, content, 'utf8');
      return buildOutput(outputFormat, `成功写入文件: ${fullPath}`, {
        action: 'write',
        path: fullPath,
        size: contentBytes
      });
    } catch (error) {
      if (error.code === 'E_FILE_TOO_LARGE') throw error;
      if (error.code === 'E_PATH_DENIED') throw error;
      if (error.code === 'EACCES') throw ERR.INVALID_ARGS(`没有权限写入文件: ${filePath}`);
      throw ERR.INVALID_ARGS(`写入文件失败: ${error.message}`);
    }
  }

  async listDirectory(dirPath, workingDirectory = null, outputFormat) {
    try {
      const fullPath = this.securityValidator.resolveAndAssert(dirPath, workingDirectory);
      const items = await fs.readdir(fullPath, { withFileTypes: true });

      // 限制条目数量
      let entries = items.map(i => ({ name: i.name, type: i.isDirectory() ? 'directory' : 'file' }));
      let truncated = false;
      if (entries.length > MAX_ENTRIES) {
        entries = entries.slice(0, MAX_ENTRIES);
        truncated = true;
      }

      const resultText = entries.map(item => {
        const type = item.type === 'directory' ? '[目录]' : '[文件]';
        return `${type} ${item.name}`;
      }).join('\n');

      const truncationMsg = truncated ? `\n[仅显示前 ${MAX_ENTRIES} 个条目]` : '';
      const jsonData = {
        action: 'list',
        path: fullPath,
        entries,
        total: items.length,
        truncated
      };

      return buildOutput(outputFormat, `目录内容 (${fullPath}):\n${resultText}${truncationMsg}`, jsonData);
    } catch (error) {
      if (error.code === 'ENOENT') throw ERR.NOT_FOUND(dirPath);
      if (error.code === 'E_PATH_DENIED') throw error;
      throw ERR.INVALID_ARGS(`列出目录失败: ${error.message}`);
    }
  }

  async createDirectory(dirPath, workingDirectory = null, outputFormat) {
    try {
      const fullPath = this.securityValidator.resolveAndAssert(dirPath, workingDirectory);
      await fs.mkdir(fullPath, { recursive: true });
      return buildOutput(outputFormat, `成功创建目录: ${fullPath}`, {
        action: 'create_dir',
        path: fullPath,
        created: true
      });
    } catch (error) {
      if (error.code === 'E_PATH_DENIED') throw error;
      if (error.code === 'EACCES') throw ERR.INVALID_ARGS(`没有权限创建目录: ${dirPath}`);
      throw ERR.INVALID_ARGS(`创建目录失败: ${error.message}`);
    }
  }

  async deleteFileOrDirectory(filePath, workingDirectory = null, outputFormat) {
    try {
      const fullPath = this.securityValidator.resolveAndAssert(filePath, workingDirectory);
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        await fs.rmdir(fullPath, { recursive: true });
        return buildOutput(outputFormat, `成功删除目录: ${fullPath}`, {
          action: 'delete',
          path: fullPath,
          type: 'directory',
          deleted: true
        });
      } else {
        await fs.unlink(fullPath);
        return buildOutput(outputFormat, `成功删除文件: ${fullPath}`, {
          action: 'delete',
          path: fullPath,
          type: 'file',
          deleted: true
        });
      }
    } catch (error) {
      if (error.code === 'ENOENT') throw ERR.NOT_FOUND(filePath);
      if (error.code === 'E_PATH_DENIED') throw error;
      if (error.code === 'EACCES') throw ERR.INVALID_ARGS(`没有权限删除: ${filePath}`);
      throw ERR.INVALID_ARGS(`删除失败: ${error.message}`);
    }
  }
}

// 辅助函数：格式化字节
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

module.exports = FileOperationTool;
