/**
 * 文件操作工具模块
 * 支持读取、写入、列表目录、创建目录、删除文件等操作
 */

const fs = require('fs').promises;
const path = require('path');

class FileOperationTool {
  constructor(securityValidator) {
    this.securityValidator = securityValidator;
  }

  // 解析路径，支持工作目录
  resolvePath(filePath, workingDirectory = null) {
    if (workingDirectory && !path.isAbsolute(filePath)) {
      return path.resolve(workingDirectory, filePath);
    }
    return path.resolve(filePath);
  }

  async handle(args) {
    const { operation, path: filePath, content, working_directory } = args;

    // 检查路径是否被允许（支持工作目录）
    if (!this.securityValidator.isPathAllowed(filePath, working_directory)) {
      throw new Error(`不允许操作路径: ${filePath}`);
    }

    switch (operation) {
  async readFile(filePath, workingDirectory = null) {
    try {
      const fullPath = this.resolvePath(filePath, workingDirectory);
      
      // 读取文件的一部分来检测是否为二进制文件
      const fd = await fs.open(fullPath, 'r');
      const buffer = Buffer.alloc(512); // 读取前512字节作为样本
      const { bytesRead } = await fd.read(buffer, 0, 512, 0);
      await fd.close();

      // 检查缓冲区是否包含null字节，这通常是二进制文件的标志
      if (buffer.indexOf(0) !== -1) {
        throw new Error(`不支持读取二进制文件: ${filePath}`);
      }

      // 如果不是二进制文件，则正常读取全部内容
      const content = await fs.readFile(fullPath, 'utf8');
      return {
        content: [
          {
            type: 'text',
            text: `文件内容 (${fullPath}):\n${content}`
          }
        ]
      };
    } catch (error) {
      if (error.message.includes('不支持读取二进制文件')) {
        // 重新抛出我们自己定义的二进制文件错误
        throw error;
      } else if (error.code === 'ENOENT') {
        throw new Error(`文件不存在: ${filePath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`没有权限读取文件: ${filePath}`);
      } else {
        throw new Error(`读取文件失败: ${error.message}`);
      }
    }
  }
    try {
      const fullPath = this.resolvePath(filePath, workingDirectory);
      const content = await fs.readFile(fullPath, 'utf8');
      return {
        content: [
          {
            type: 'text',
            text: `文件内容 (${fullPath}):\n${content}`
          }
        ]
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`文件不存在: ${filePath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`没有权限读取文件: ${filePath}`);
      } else {
        throw new Error(`读取文件失败: ${error.message}`);
      }
    }
  }

  async writeFile(filePath, content, workingDirectory = null) {
    try {
      const fullPath = this.resolvePath(filePath, workingDirectory);
      await fs.writeFile(fullPath, content, 'utf8');
      return {
        content: [
          {
            type: 'text',
            text: `成功写入文件: ${fullPath}`
          }
        ]
      };
    } catch (error) {
      if (error.code === 'EACCES') {
        throw new Error(`没有权限写入文件: ${filePath}`);
      } else {
        throw new Error(`写入文件失败: ${error.message}`);
      }
    }
  }

  async listDirectory(dirPath, workingDirectory = null) {
    try {
      const fullPath = this.resolvePath(dirPath, workingDirectory);
      const items = await fs.readdir(fullPath, { withFileTypes: true });
      const result = items.map(item => {
        const type = item.isDirectory() ? '[目录]' : '[文件]';
        return `${type} ${item.name}`;
      }).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `目录内容 (${fullPath}):\n${result}`
          }
        ]
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`目录不存在: ${dirPath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`没有权限访问目录: ${dirPath}`);
      } else {
        throw new Error(`列出目录失败: ${error.message}`);
      }
    }
  }

  async createDirectory(dirPath, workingDirectory = null) {
    try {
      const fullPath = this.resolvePath(dirPath, workingDirectory);
      await fs.mkdir(fullPath, { recursive: true });
      return {
        content: [
          {
            type: 'text',
            text: `成功创建目录: ${fullPath}`
          }
        ]
      };
    } catch (error) {
      if (error.code === 'EACCES') {
        throw new Error(`没有权限创建目录: ${dirPath}`);
      } else {
        throw new Error(`创建目录失败: ${error.message}`);
      }
    }
  }

  async deleteFileOrDirectory(filePath, workingDirectory = null) {
    try {
      const fullPath = this.resolvePath(filePath, workingDirectory);
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        await fs.rmdir(fullPath, { recursive: true });
        return {
          content: [
            {
              type: 'text',
              text: `成功删除目录: ${fullPath}`
            }
          ]
        };
      } else {
        await fs.unlink(fullPath);
        return {
          content: [
            {
              type: 'text',
              text: `成功删除文件: ${fullPath}`
            }
          ]
        };
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`路径不存在: ${filePath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`没有权限删除: ${filePath}`);
      } else {
        throw new Error(`删除失败: ${error.message}`);
      }
    }
  }
}

module.exports = FileOperationTool;
