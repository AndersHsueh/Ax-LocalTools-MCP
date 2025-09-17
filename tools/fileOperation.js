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

  async handle(args) {
    const { operation, path: filePath, content } = args;

    // 检查路径是否被允许
    if (!this.securityValidator.isPathAllowed(filePath)) {
      throw new Error(`不允许操作路径: ${filePath}`);
    }

    switch (operation) {
      case 'read':
        return await this.readFile(filePath);
      case 'write':
        return await this.writeFile(filePath, content);
      case 'list':
        return await this.listDirectory(filePath);
      case 'create_dir':
        return await this.createDirectory(filePath);
      case 'delete':
        return await this.deleteFileOrDirectory(filePath);
      default:
        throw new Error(`不支持的操作类型: ${operation}`);
    }
  }

  async readFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return {
        content: [
          {
            type: 'text',
            text: `文件内容 (${filePath}):\n${content}`
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

  async writeFile(filePath, content) {
    try {
      await fs.writeFile(filePath, content, 'utf8');
      return {
        content: [
          {
            type: 'text',
            text: `成功写入文件: ${filePath}`
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

  async listDirectory(dirPath) {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      const result = items.map(item => {
        const type = item.isDirectory() ? '[目录]' : '[文件]';
        return `${type} ${item.name}`;
      }).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `目录内容 (${dirPath}):\n${result}`
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

  async createDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return {
        content: [
          {
            type: 'text',
            text: `成功创建目录: ${dirPath}`
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

  async deleteFileOrDirectory(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        await fs.rmdir(filePath, { recursive: true });
        return {
          content: [
            {
              type: 'text',
              text: `成功删除目录: ${filePath}`
            }
          ]
        };
      } else {
        await fs.unlink(filePath);
        return {
          content: [
            {
              type: 'text',
              text: `成功删除文件: ${filePath}`
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
