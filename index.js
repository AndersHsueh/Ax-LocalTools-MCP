#!/usr/bin/env node

/**
 * 安全MCP服务器 - Node.js版本
 * 支持文件读写和本地命令执行
 * 包含安全限制，禁止操作敏感目录
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// 禁止操作的目录列表
const FORBIDDEN_PATHS = [
  '/',
  `/Users/${process.env.USER || 'unknown'}`,
  '/etc',
  '/bin',
  '/usr/bin',
  '/sbin',
  '/usr/sbin',
  '/System',
  '/Applications',
  '/Library',
  '/private',
];

class SecureMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'secure-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    // 列出可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'file_operation',
            description: '统一的文件操作工具，支持读取、写入、列表目录、创建目录、删除文件等操作',
            inputSchema: {
              type: 'object',
              properties: {
                operation: {
                  type: 'string',
                  enum: ['read', 'write', 'list', 'create_dir', 'delete'],
                  description: '操作类型：read(读取文件), write(写入文件), list(列出目录), create_dir(创建目录), delete(删除文件/目录)'
                },
                path: {
                  type: 'string',
                  description: '文件或目录路径'
                },
                content: {
                  type: 'string',
                  description: '写入文件时的内容（仅在operation为write时需要）'
                }
              },
              required: ['operation', 'path']
            }
          },
          {
            name: 'execute_command',
            description: '执行本地命令',
            inputSchema: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  description: '要执行的命令'
                },
                working_directory: {
                  type: 'string',
                  description: '命令执行的工作目录（可选）'
                }
              },
              required: ['command']
            }
          }
        ]
      };
    });

    // 处理工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === 'file_operation') {
          return await this.handleFileOperation(args);
        } else if (name === 'execute_command') {
          return await this.handleExecuteCommand(args);
        } else {
          throw new Error(`未知工具: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `错误: ${error.message}`
            }
          ]
        };
      }
    });
  }

  isPathAllowed(filePath) {
    try {
      // 转换为绝对路径
      const absPath = path.resolve(filePath);
      
      // 允许临时目录和当前项目目录
      if (absPath.startsWith('/tmp') || absPath.startsWith('/var/folders')) {
        return true;
      }
      
      // 允许当前项目目录
      const currentDir = path.resolve(__dirname);
      if (absPath.startsWith(currentDir)) {
        return true;
      }
      
      // 检查是否在禁止的路径中
      for (const forbidden of FORBIDDEN_PATHS) {
        if (absPath.startsWith(forbidden)) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  async handleFileOperation(args) {
    const { operation, path: filePath, content = '' } = args;

    if (!this.isPathAllowed(filePath)) {
      return {
        content: [
          {
            type: 'text',
            text: `错误: 不允许访问路径 ${filePath}`
          }
        ]
      };
    }

    try {
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
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `错误: ${error.message}`
          }
        ]
      };
    }
  }

  async readFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        content: [
          {
            type: 'text',
            text: `文件内容:\n${content}`
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
      // 确保目录存在
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      await fs.writeFile(filePath, content, 'utf-8');
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
      const items = await fs.readdir(dirPath);
      let result = `目录 ${dirPath} 的内容:\n`;
      
      for (const item of items.sort()) {
        const itemPath = path.join(dirPath, item);
        try {
          const stats = await fs.stat(itemPath);
          if (stats.isDirectory()) {
            result += `[目录] ${item}/\n`;
          } else {
            result += `[文件] ${item}\n`;
          }
        } catch (error) {
          result += `[未知] ${item}\n`;
        }
      }
      
      return {
        content: [
          {
            type: 'text',
            text: result
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
        await fs.rmdir(filePath); // 只删除空目录
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

  async handleExecuteCommand(args) {
    const { command, working_directory } = args;

    // 检查工作目录是否被允许
    if (working_directory && !this.isPathAllowed(working_directory)) {
      return {
        content: [
          {
            type: 'text',
            text: `错误: 不允许在工作目录 ${working_directory} 中执行命令`
          }
        ]
      };
    }

    // 检查命令是否包含危险操作
    const dangerousCommands = ['rm -rf', 'sudo', 'su', 'chmod 777', 'chown', 'passwd'];
    if (dangerousCommands.some(dangerous => command.includes(dangerous))) {
      return {
        content: [
          {
            type: 'text',
            text: `错误: 不允许执行危险命令: ${command}`
          }
        ]
      };
    }

    try {
      const cwd = working_directory || process.cwd();
      
      // 执行命令，设置30秒超时
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: 30000
      });

      let output = `命令: ${command}\n`;
      output += `工作目录: ${cwd}\n`;
      output += `返回码: 0\n`;

      if (stdout) {
        output += `标准输出:\n${stdout}\n`;
      }

      if (stderr) {
        output += `标准错误:\n${stderr}\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: output
          }
        ]
      };
    } catch (error) {
      if (error.code === 'TIMEOUT') {
        return {
          content: [
            {
              type: 'text',
              text: `错误: 命令执行超时: ${command}`
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `错误: 执行命令失败 ${error.message}`
            }
          ]
        };
      }
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP服务器已启动');
  }
}

// 启动服务器
async function main() {
  const server = new SecureMCPServer();
  await server.run();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('服务器启动失败:', error);
    process.exit(1);
  });
}

module.exports = SecureMCPServer;
