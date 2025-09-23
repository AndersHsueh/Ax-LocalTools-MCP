#!/usr/bin/env node

/**
 * 安全MCP服务器 - Node.js版本 v1.2.0
 * 支持文件操作、文件编辑、文件搜索、文件比较、文件哈希、文件权限、文件压缩、文件监控和命令执行
 * 包含安全限制，禁止操作敏感目录
 */

// 注意：@modelcontextprotocol/sdk 是 ESM-only，需使用动态 import 以兼容 CommonJS
// 我们在启动阶段动态加载并注入依赖，避免 ERR_REQUIRE_ESM

// 导入工具模块
const SecurityValidator = require('./tools/securityValidator.js');
const FileOperationTool = require('./tools/fileOperation.js');
const FileEditTool = require('./tools/fileEdit.js');
const FileSearchTool = require('./tools/fileSearch.js');
const FileCompareTool = require('./tools/fileCompare.js');
const FileHashTool = require('./tools/fileHash.js');
const FilePermissionsTool = require('./tools/filePermissions.js');
const FileArchiveTool = require('./tools/fileArchive.js');
const FileWatchTool = require('./tools/fileWatch.js');
const CommandExecutionTool = require('./tools/commandExecution.js');
const TaskManagerTool = require('./tools/taskManager.js');

class SecureMCPServer {
  constructor({ Server, StdioServerTransport, CallToolRequestSchema, ListToolsRequestSchema }) {
    this.Server = Server;
    this.StdioServerTransport = StdioServerTransport;
    this.CallToolRequestSchema = CallToolRequestSchema;
    this.ListToolsRequestSchema = ListToolsRequestSchema;

    this.server = new Server(
      {
        name: 'secure-mcp-server',
        version: '2.0.1',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 初始化安全验证器和工具
    this.securityValidator = new SecurityValidator();
    this.tools = {
      file_operation: new FileOperationTool(this.securityValidator),
      file_edit: new FileEditTool(this.securityValidator),
      file_search: new FileSearchTool(this.securityValidator),
      file_compare: new FileCompareTool(this.securityValidator),
      file_hash: new FileHashTool(this.securityValidator),
      file_permissions: new FilePermissionsTool(this.securityValidator),
      file_archive: new FileArchiveTool(this.securityValidator),
      file_watch: new FileWatchTool(this.securityValidator),
      execute_command: new CommandExecutionTool(this.securityValidator),
      task_manager: new TaskManagerTool(this.securityValidator)
    };

    this.setupHandlers();
  }

  setupHandlers() {
    // 列出可用工具
    this.server.setRequestHandler(this.ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'file_operation',
            description: '统一的文件操作工具，支持读取、写入、列表目录、创建目录、删除文件等操作。支持工作目录概念，可在指定目录下进行相对路径操作',
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
                  description: '文件或目录路径（可以是相对路径或绝对路径）'
                },
                content: {
                  type: 'string',
                  description: '写入文件时的内容（仅在operation为write时需要）'
                },
                working_directory: {
                  type: 'string',
                  description: '工作目录（可选），当path为相对路径时，会基于此目录解析。如果未指定，则基于当前工作目录'
                }
              },
              required: ['operation', 'path']
            }
          },
          {
            name: 'file_edit',
            description: '文件行级编辑工具，支持删除行、插入行、替换行等操作',
            inputSchema: {
              type: 'object',
              properties: {
                operation: {
                  type: 'string',
                  enum: ['delete_lines', 'insert_lines', 'replace_lines', 'append_lines'],
                  description: '操作类型：delete_lines(删除行), insert_lines(插入行), replace_lines(替换行), append_lines(追加行)'
                },
                path: {
                  type: 'string',
                  description: '文件路径'
                },
                start_line: {
                  type: 'integer',
                  description: '起始行号（从1开始）'
                },
                end_line: {
                  type: 'integer',
                  description: '结束行号（仅delete_lines和replace_lines需要）'
                },
                content: {
                  type: 'string',
                  description: '要插入或替换的内容'
                },
                encoding: {
                  type: 'string',
                  default: 'utf8',
                  description: '文件编码（可选，默认utf8）'
                }
              },
              required: ['operation', 'path']
            }
          },
          {
            name: 'file_search',
            description: '文件搜索工具，支持在文件中搜索内容，支持正则表达式',
            inputSchema: {
              type: 'object',
              properties: {
                search_path: {
                  type: 'string',
                  description: '搜索路径'
                },
                pattern: {
                  type: 'string',
                  description: '搜索模式（支持正则表达式）'
                },
                file_types: {
                  type: 'string',
                  default: '*',
                  description: '文件类型过滤（如：txt,js,py 或 * 表示所有类型）'
                },
                case_sensitive: {
                  type: 'boolean',
                  default: false,
                  description: '是否区分大小写'
                },
                max_results: {
                  type: 'integer',
                  default: 100,
                  description: '最大搜索结果数量'
                }
              },
              required: ['search_path', 'pattern']
            }
          },
          {
            name: 'file_compare',
            description: '文件比较工具，比较两个文件的差异',
            inputSchema: {
              type: 'object',
              properties: {
                file1: {
                  type: 'string',
                  description: '第一个文件路径'
                },
                file2: {
                  type: 'string',
                  description: '第二个文件路径'
                },
                output_format: {
                  type: 'string',
                  enum: ['text', 'json'],
                  default: 'text',
                  description: '输出格式'
                }
              },
              required: ['file1', 'file2']
            }
          },
          {
            name: 'file_hash',
            description: '文件哈希工具，计算文件的MD5、SHA1、SHA256哈希值',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: '文件路径'
                },
                algorithm: {
                  type: 'string',
                  enum: ['md5', 'sha1', 'sha256', 'sha512'],
                  default: 'md5',
                  description: '哈希算法'
                }
              },
              required: ['path']
            }
          },
          {
            name: 'file_permissions',
            description: '文件权限工具，修改文件权限',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: '文件路径'
                },
                mode: {
                  type: 'string',
                  description: '权限模式（如：755, 644）'
                },
                recursive: {
                  type: 'boolean',
                  default: false,
                  description: '是否递归应用权限'
                }
              },
              required: ['path', 'mode']
            }
          },
          {
            name: 'file_archive',
            description: '文件压缩/解压工具，支持ZIP、TAR、GZ格式',
            inputSchema: {
              type: 'object',
              properties: {
                operation: {
                  type: 'string',
                  enum: ['compress', 'extract'],
                  description: '操作类型：compress(压缩), extract(解压)'
                },
                source: {
                  type: 'string',
                  description: '源文件或目录'
                },
                destination: {
                  type: 'string',
                  description: '目标文件或目录（可选）'
                },
                format: {
                  type: 'string',
                  enum: ['zip', 'tar', 'gz', 'tar.gz'],
                  default: 'zip',
                  description: '压缩格式'
                }
              },
              required: ['operation', 'source']
            }
          },
          {
            name: 'file_watch',
            description: '文件监控工具，监控文件变化',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: '监控路径'
                },
                events: {
                  type: 'string',
                  default: 'create,delete,modify',
                  description: '监控事件（create,delete,modify）'
                },
                duration: {
                  type: 'integer',
                  default: 30,
                  description: '监控时长（秒）'
                },
                output_format: {
                  type: 'string',
                  enum: ['text', 'json'],
                  default: 'text',
                  description: '输出格式'
                }
              },
              required: ['path']
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
          },
          {
            name: 'task_manager',
            description: '任务管理工具，支持任务分解、排期、进度跟踪',
            inputSchema: {
              type: 'object',
              properties: {
                operation: {
                  type: 'string',
                  enum: ['create', 'update', 'delete', 'list', 'complete', 'get', 'clear'],
                  description: '操作类型：create(创建), update(更新), delete(删除), list(列表), complete(完成), get(获取), clear(清空)'
                },
                model_name: {
                  type: 'string',
                  default: 'default',
                  description: '模型名称，用于区分不同模型的任务列表'
                },
                task_id: {
                  type: 'string',
                  description: '任务ID（更新、删除、完成、获取时需要）'
                },
                title: {
                  type: 'string',
                  description: '任务标题'
                },
                description: {
                  type: 'string',
                  description: '任务描述'
                },
                priority: {
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'urgent'],
                  default: 'medium',
                  description: '优先级'
                },
                due_date: {
                  type: 'string',
                  description: '截止日期（ISO格式，如：2024-01-15T10:00:00Z）'
                },
                subtasks: {
                  type: 'array',
                  description: '子任务列表'
                },
                status: {
                  type: 'string',
                  enum: ['pending', 'in_progress', 'completed', 'cancelled'],
                  default: 'pending',
                  description: '任务状态'
                },
                progress: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 100,
                  default: 0,
                  description: '任务进度（0-100）'
                }
              },
              required: ['operation']
            }
          }
        ]
      };
    });

    // 处理工具调用
  this.server.setRequestHandler(this.CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (this.tools[name]) {
          return await this.tools[name].handle(args);
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

  async start() {
    const transport = new this.StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP服务器已启动');
  }
}

// 启动服务器（动态加载 ESM 依赖）
(async () => {
  try {
    const [{ Server }, { StdioServerTransport }, { CallToolRequestSchema, ListToolsRequestSchema }] = await Promise.all([
      import('@modelcontextprotocol/sdk/server/index.js'),
      import('@modelcontextprotocol/sdk/server/stdio.js'),
      import('@modelcontextprotocol/sdk/types.js'),
    ]);

    const server = new SecureMCPServer({
      Server,
      StdioServerTransport,
      CallToolRequestSchema,
      ListToolsRequestSchema,
    });
    await server.start();
  } catch (err) {
    console.error('启动失败: ', err);
    process.exitCode = 1;
  }
})();