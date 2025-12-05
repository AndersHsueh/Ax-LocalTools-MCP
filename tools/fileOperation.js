/**
 * 文件操作工具模块
 * 支持读取、写入、列表目录、创建目录、删除文件等操作
 */

const fs = require('fs').promises;
const path = require('path');
const { buildOutput } = require('../lib/output');
const { ERR } = require('../errors');

class FileOperationTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  // 兼容旧方法（将逐步移除）
  resolvePath(filePath, workingDirectory = null) {
    return this.securityValidator.resolveAndAssert(filePath, workingDirectory);
  }

  async handle(args) {
  const { operation, path: filePath, file_path, dir_path, content, working_directory, output_format = 'text' } = args;
    const targetPath = filePath || file_path || dir_path; // alias 归一
    if (!targetPath) throw ERR.INVALID_ARGS('缺少 path/file_path/dir_path 参数');

    // 检查路径是否被允许（支持工作目录；相对路径默认home）
    if (!this.securityValidator.isPathAllowed(targetPath, working_directory)) {
      throw ERR.PATH_DENIED(targetPath);
    }

    switch (operation) {
      case 'read':
  return await this.readFile(targetPath, working_directory, output_format);
      case 'write':
  return await this.writeFile(targetPath, content, working_directory, output_format);
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

  async readFile(filePath, workingDirectory = null, outputFormat) {
    try {
      const fullPath = this.securityValidator.resolveAndAssert(filePath, workingDirectory);
      
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
      const contentData = await fs.readFile(fullPath, 'utf8');
      return buildOutput(outputFormat, `文件内容 (${fullPath}):\n${contentData}`, { action: 'read', path: fullPath, content: contentData });
    } catch (error) {
      if (error.message.includes('不支持读取二进制文件')) {
        // 重新抛出我们自己定义的二进制文件错误
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

  async writeFile(filePath, content, workingDirectory = null, outputFormat) {
    try {
      const fullPath = this.securityValidator.resolveAndAssert(filePath, workingDirectory);
      await fs.writeFile(fullPath, content, 'utf8');
  return buildOutput(outputFormat, `成功写入文件: ${fullPath}`, { action: 'write', path: fullPath, size: Buffer.byteLength(content || '', 'utf8') });
    } catch (error) {
      if (error.code === 'E_PATH_DENIED') throw error;
      if (error.code === 'EACCES') throw ERR.INVALID_ARGS(`没有权限写入文件: ${filePath}`);
      throw ERR.INVALID_ARGS(`写入文件失败: ${error.message}`);
    }
  }

  async listDirectory(dirPath, workingDirectory = null, outputFormat) {
    try {
      const fullPath = this.securityValidator.resolveAndAssert(dirPath, workingDirectory);
      const items = await fs.readdir(fullPath, { withFileTypes: true });
      const result = items.map(item => {
        const type = item.isDirectory() ? '[目录]' : '[文件]';
        return `${type} ${item.name}`;
      }).join('\n');
      return buildOutput(outputFormat, `目录内容 (${fullPath}):\n${result}`, { action: 'list', path: fullPath, entries: items.map(i => ({ name: i.name, type: i.isDirectory() ? 'directory' : 'file' })) });
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
  return buildOutput(outputFormat, `成功创建目录: ${fullPath}`, { action: 'create_dir', path: fullPath, created: true });
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
  return buildOutput(outputFormat, `成功删除目录: ${fullPath}`, { action: 'delete', path: fullPath, type: 'directory', deleted: true });
      } else {
        await fs.unlink(fullPath);
  return buildOutput(outputFormat, `成功删除文件: ${fullPath}`, { action: 'delete', path: fullPath, type: 'file', deleted: true });
      }
    } catch (error) {
      if (error.code === 'ENOENT') throw ERR.NOT_FOUND(filePath);
      if (error.code === 'E_PATH_DENIED') throw error;
      if (error.code === 'EACCES') throw ERR.INVALID_ARGS(`没有权限删除: ${filePath}`);
      throw ERR.INVALID_ARGS(`删除失败: ${error.message}`);
    }
  }
}

module.exports = FileOperationTool;
