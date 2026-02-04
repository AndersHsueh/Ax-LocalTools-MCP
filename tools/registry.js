const SecurityValidator = require('./securityValidator');
const FileOperationTool = require('./fileOperation');
const FileEditTool = require('./fileEdit');
const FileSearchTool = require('./fileSearch');
const FileCompareTool = require('./fileCompare');
const FileHashTool = require('./fileHash');
const FilePermissionsTool = require('./filePermissions');
const FileArchiveTool = require('./fileArchive');
const FileWatchTool = require('./fileWatch');
const CommandExecutionTool = require('./commandExecution');
const TaskManagerTool = require('./taskManager');
const TimeTool = require('./timeTool');
const EnvironmentMemoryAdapter = require('./environmentMemoryAdapter');
const SudoConfigTool = require('./sudoConfig');
const platformUtils = require('../lib/platformUtils');

const securityValidator = new SecurityValidator();

// 工具实例
const instances = {
  file_operation: new FileOperationTool(securityValidator),
  file_edit: new FileEditTool(securityValidator),
  file_search: new FileSearchTool(securityValidator),
  file_compare: new FileCompareTool(securityValidator),
  file_hash: new FileHashTool(securityValidator),
  file_permissions: new FilePermissionsTool(securityValidator),
  file_archive: new FileArchiveTool(securityValidator),
  file_watch: new FileWatchTool(securityValidator),
  execute_command: new CommandExecutionTool(securityValidator),
  task_manager: new TaskManagerTool(securityValidator),
  time_tool: new TimeTool(securityValidator),
  environment_memory: new EnvironmentMemoryAdapter(securityValidator)
};

// 只在Linux系统上添加sudo配置工具
if (platformUtils.isLinux) {
  instances.sudo_config = new SudoConfigTool(securityValidator);
}

/**
 * 生成带 JSON Schema 的工具描述，支持 annotations 和 outputSchema（MCP 规范）
 * @param {string} name - 工具名称
 * @param {string} description - 工具描述
 * @param {Object} properties - 输入参数 schema
 * @param {string[]} required - 必填参数列表
 * @param {Object} annotations - MCP annotations (readOnlyHint, destructiveHint 等)
 * @param {Object} outputSchema - 输出 schema 定义
 */
function createDescriptor(name, description, properties = {}, required = [], annotations = {}, outputSchema = null) {
  const schema = {
    name,
    description,
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties,
      required
    }
  };
  // 只有非空 annotations 才添加
  if (Object.keys(annotations).length > 0) {
    schema.annotations = annotations;
  }
  // 只有非空 outputSchema 才添加
  if (outputSchema && Object.keys(outputSchema).length > 0) {
    schema.outputSchema = outputSchema;
  }
  return schema;
}

// 通用参数描述
const DESCS = {
  path: '文件或目录的绝对路径，或相对于 working_directory 的相对路径',
  working_directory: '工作目录路径，所有相对路径以此为基础解析',
  output_format: '输出格式：text(纯文本)、json(结构化JSON)、both(两者兼有)',
  operation: '要执行的操作类型',
  operation_crud: '操作类型：create(创建)、read(读取)、update(更新)、delete(删除)、list(列表)',
  command: '要执行的系统命令，支持管道和重定向',
  timeout_ms: '超时时间（毫秒），防止命令长时间阻塞，默认60000',
  stdout_max: 'stdout最大输出长度，超出会被截断，默认4000',
  stderr_max: 'stderr最大输出长度，超出会被截断，默认2000',
  confirm: '确认执行高风险命令，需要在 warn 策略下设为 true',
  max_depth: '最大递归深度，0表示不递归，默认8',
  max_results: '最大结果数量，超过会截断，默认100',
  recursive: '是否递归处理子目录',
  case_sensitive: '是否区分大小写搜索',
  pattern: '正则表达式搜索模式',
  file_types: '逗号分隔的文件扩展名列表，如 "js,ts,json"',
  ignore: '要忽略的文件/目录模式列表，支持通配符如 "*.log"、"node_modules"',
  content: '要写入或追加的文件内容',
  start_line: '起始行号（从1开始）',
  end_line: '结束行号（从1开始）',
  algorithm: '哈希算法：md5、sha1、sha256、sha512',
  mode: '文件权限模式，如 "755"(rwxr-xr-x)、"644"(rw-r--r--)',
  format: '压缩格式：zip、tar、gz、tar.gz',
  source: '源文件或源目录路径',
  destination: '目标文件或目标目录路径',
  events: '监控的事件类型，逗号分隔，如 "create,delete,modify"',
  duration: '监控持续时间（秒），0表示持续监控直到手动停止',
  model_name: '模型名称，用于任务隔离存储',
  task_id: '任务ID，用于更新或完成特定任务',
  title: '任务标题',
  description: '任务详细描述',
  priority: '任务优先级：low(低)、medium(中)、high(高)、urgent(紧急)',
  due_date: '任务截止日期，ISO 8601格式',
  progress: '任务完成进度（0-100）',
  subtasks: '子任务列表',
  key: '环境变量键名',
  value: '环境变量值',
  username: '用户名',
  scope: 'sudo配置范围：limited(有限)、extended(扩展)、full(完全)',
  commands: '允许无密码执行的命令列表',
  config_name: '配置文件名称',
  dry_run: '演练模式，只显示操作而不实际执行',
  action: 'sudo_config 专用：要执行的操作',
  file1: '第一个比较文件路径',
  file2: '第二个比较文件路径',
  time_zone: 'IANA时区名称，如 "Asia/Shanghai"',
  include_milliseconds: '是否包含毫秒',
  permissions: 'Windows权限设置对象'
};

// outputSchema 定义
const OUTPUT_SCHEMAS = {
  file_operation: {
    type: 'object',
    properties: {
      action: { type: 'string', description: '执行的操类型' },
      path: { type: 'string', description: '文件/目录绝对路径' },
      content: { type: 'string', description: '读取的文件内容' },
      size: { type: 'number', description: '文件大小（字节）' },
      entries: {
        type: 'array',
        description: '目录列表',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['file', 'directory'] }
          }
        }
      },
      deleted: { type: 'boolean', description: '是否删除成功' },
      created: { type: 'boolean', description: '是否创建成功' }
    }
  },
  file_search: {
    type: 'object',
    properties: {
      matches: { type: 'number', description: '匹配数量' },
      results: {
        type: 'array',
        description: '搜索结果',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string', description: '文件路径' },
            line: { type: 'number', description: '行号' },
            content: { type: 'string', description: '匹配行内容' }
          }
        }
      },
      timed_out: { type: 'boolean', description: '是否超时' },
      truncated: { type: 'boolean', description: '结果是否被截断' }
    }
  },
  file_compare: {
    type: 'object',
    properties: {
      file1: { type: 'string', description: '源文件路径' },
      file2: { type: 'string', description: '目标文件路径' },
      identical: { type: 'boolean', description: '文件是否完全相同' },
      diff_stats: {
        type: 'object',
        description: '差异统计',
        properties: {
          added: { type: 'number', description: '新增行数' },
          removed: { type: 'number', description: '删除行数' },
          modified: { type: 'number', description: '修改行数' }
        }
      }
    }
  },
  file_hash: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      algorithm: { type: 'string', description: '使用的哈希算法' },
      hash: { type: 'string', description: '计算得到的哈希值' }
    }
  },
  file_permissions: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件/目录路径' },
      mode: { type: 'string', description: '设置的权限模式' },
      recursive: { type: 'boolean', description: '是否递归处理' },
      changed: { type: 'boolean', description: '权限是否更改成功' }
    }
  },
  file_archive: {
    type: 'object',
    properties: {
      operation: { type: 'string', description: '压缩/解压操作' },
      source: { type: 'string', description: '源路径' },
      destination: { type: 'string', description: '目标路径' },
      format: { type: 'string', description: '压缩格式' }
    }
  },
  execute_command: {
    type: 'object',
    properties: {
      status: { type: 'string', description: '执行状态：ok/error/need_confirm' },
      command: { type: 'string', description: '执行的命令' },
      cwd: { type: 'string', description: '工作目录' },
      exit_code: { type: 'number', description: '进程退出码' },
      stdout: { type: 'string', description: '标准输出' },
      stderr: { type: 'string', description: '错误输出' },
      duration_ms: { type: 'number', description: '执行耗时（毫秒）' },
      truncated: { type: 'boolean', description: '输出是否被截断' }
    }
  },
  task_manager: {
    type: 'object',
    properties: {
      operation: { type: 'string', description: '执行的操作' },
      tasks: {
        type: 'array',
        description: '任务列表',
        items: {
          type: 'object',
          properties: {
            task_id: { type: 'string', description: '任务ID' },
            title: { type: 'string', description: '任务标题' },
            status: { type: 'string', description: '任务状态' },
            priority: { type: 'string', description: '优先级' },
            progress: { type: 'number', description: '完成进度' }
          }
        }
      },
      created_task_id: { type: 'string', description: '创建的任务ID' }
    }
  },
  time_tool: {
    type: 'object',
    properties: {
      format: { type: 'string', description: '时间格式' },
      timestamp: { type: 'string', description: '格式化后的时间字符串' },
      time_zone: { type: 'string', description: '使用的时区' }
    }
  },
  environment_memory: {
    type: 'object',
    properties: {
      operation: { type: 'string', description: '执行的操作' },
      key: { type: 'string', description: '环境变量键' },
      value: { type: 'string', description: '环境变量值' }
    }
  }
};

const descriptors = [
  // file_operation: 混合操作（读/写/列目录/创建/删除）
  createDescriptor('file_operation',
    '文件操作：读取、写入、列出目录、创建目录、删除文件或目录。支持工作目录解析和相对路径。\n\n' +
    '示例：读取文件 { "operation": "read", "path": "src/index.js", "output_format": "json" }\n' +
    '示例：写入文件 { "operation": "write", "path": "test.txt", "content": "Hello", "output_format": "text" }', {
    operation: { type: 'string', enum: ['read', 'write', 'list', 'create_dir', 'delete'], description: DESCS.operation },
    path: { type: 'string', description: DESCS.path },
    working_directory: { type: 'string', description: DESCS.working_directory },
    content: { type: 'string', description: DESCS.content },
    max_size: { type: 'number', description: '最大文件大小限制（字节），默认 10485760 (10MB)' },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, ['operation'], {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false
  }, OUTPUT_SCHEMAS.file_operation),

  // time_tool: 只读获取时间
  createDescriptor('time_tool',
    '时间工具：获取当前时间，支持多种格式输出（ISO、UNIX、RFC3339、本地格式）。\n\n' +
    '示例：获取 ISO 格式 { "format": "iso", "output_format": "json" }\n' +
    '示例：获取指定时区 { "format": "locale", "time_zone": "Asia/Shanghai", "output_format": "text" }', {
    format: { type: 'string', enum: ['iso', 'unix', 'unix_ms', 'rfc3339', 'locale'], description: '时间格式：iso(ISO 8601)、unix(UNIX时间戳秒)、unix_ms(毫秒)、rfc3339(RFC 3339)、locale(本地格式)' },
    include_milliseconds: { type: 'boolean', description: DESCS.include_milliseconds },
    time_zone: { type: 'string', description: DESCS.time_zone },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, [], {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }, OUTPUT_SCHEMAS.time_tool),

  // file_edit: 修改文件内容
  createDescriptor('file_edit',
    '文件行级编辑：在指定位置删除、插入、替换或追加内容。操作前自动备份原文件。\n\n' +
    '示例：删除第 3-5 行 { "operation": "delete_lines", "path": "test.js", "start_line": 3, "end_line": 5 }\n' +
    '示例：插入内容到第 2 行后 { "operation": "insert_lines", "path": "test.js", "start_line": 2, "content": "new line" }', {
    operation: { type: 'string', enum: ['delete_lines', 'insert_lines', 'replace_lines', 'append_lines'], description: '编辑操作：delete_lines(删除行)、insert_lines(插入行)、replace_lines(替换行)、append_lines(追加行)' },
    path: { type: 'string', description: DESCS.path },
    start_line: { type: 'number', description: DESCS.start_line },
    end_line: { type: 'number', description: DESCS.end_line },
    content: { type: 'string', description: DESCS.content },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, ['operation', 'path'], {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false
  }),

  // file_search: 只读搜索
  createDescriptor('file_search',
    '文件内容搜索：在目录中搜索匹配正则表达式的内容。支持文件类型过滤、深度限制、超时控制和忽略模式。\n\n' +
    '示例：搜索 JS 文件中的函数定义 { "search_path": "src", "pattern": "function\\s+\\w+", "file_types": "js,ts" }\n' +
    '示例：忽略 node_modules 搜索 { "search_path": ".", "pattern": "TODO", "ignore": ["node_modules", "*.log"] }', {
    search_path: { type: 'string', description: '搜索起始目录路径' },
    pattern: { type: 'string', description: DESCS.pattern },
    file_types: { type: 'string', description: DESCS.file_types },
    case_sensitive: { type: 'boolean', description: DESCS.case_sensitive },
    max_results: { type: 'number', description: DESCS.max_results },
    max_depth: { type: 'number', description: DESCS.max_depth },
    timeout_ms: { type: 'number', description: DESCS.timeout_ms },
    ignore: { type: 'array', items: { type: 'string' }, description: DESCS.ignore },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, ['search_path', 'pattern'], {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }, OUTPUT_SCHEMAS.file_search),

  // file_compare: 只读比较
  createDescriptor('file_compare',
    '文件差异比较：比较两个文件的差异，以文本或JSON格式输出差异统计和详细对比。\n\n' +
    '示例：比较两个文件 { "file1": "a.js", "file2": "b.js", "output_format": "json" }', {
    file1: { type: 'string', description: DESCS.file1 },
    file2: { type: 'string', description: DESCS.file2 },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, ['file1', 'file2'], {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }, OUTPUT_SCHEMAS.file_compare),

  // file_hash: 只读计算哈希
  createDescriptor('file_hash',
    '文件哈希计算：使用MD5、SHA1、SHA256或SHA512算法计算文件哈希值，用于完整性验证。\n\n' +
    '示例：计算 SHA256 { "path": "package.json", "algorithm": "sha256", "output_format": "json" }', {
    path: { type: 'string', description: DESCS.path },
    algorithm: { type: 'string', enum: ['md5', 'sha1', 'sha256', 'sha512'], description: DESCS.algorithm },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, ['path'], {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  }, OUTPUT_SCHEMAS.file_hash),

  // file_permissions: 修改权限
  createDescriptor('file_permissions',
    '跨平台文件权限管理：Unix系统使用chmod，Windows系统使用icacls。支持递归设置。\n\n' +
    '示例：设置文件权限 { "path": "script.sh", "mode": "755" }\n' +
    '示例：递归设置目录权限 { "path": "project", "mode": "644", "recursive": true, "max_depth": 3 }', {
    path: { type: 'string', description: DESCS.path },
    mode: { type: 'string', description: DESCS.mode },
    permissions: { type: 'object', description: DESCS.permissions },
    recursive: { type: 'boolean', description: DESCS.recursive },
    max_depth: { type: 'number', description: DESCS.max_depth },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, ['path'], {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false
  }, OUTPUT_SCHEMAS.file_permissions),

  // file_archive: 压缩/解压
  createDescriptor('file_archive',
    '文件压缩/解压：支持ZIP、TAR、GZ、TAR.GZ格式。使用spawn安全参数，防止命令注入。\n\n' +
    '示例：压缩目录 { "operation": "compress", "source": "project", "destination": "backup.zip", "format": "zip" }\n' +
    '示例：解压文件 { "operation": "extract", "source": "archive.tar.gz", "destination": "./extracted" }', {
    operation: { type: 'string', enum: ['compress', 'extract'], description: '操作类型：compress(压缩)、extract(解压)' },
    source: { type: 'string', description: DESCS.source },
    destination: { type: 'string', description: DESCS.destination },
    format: { type: 'string', enum: ['zip', 'tar', 'gz', 'tar.gz'], description: DESCS.format },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, ['operation', 'source'], {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false
  }, OUTPUT_SCHEMAS.file_archive),

  // file_watch: 只读监控
  createDescriptor('file_watch',
    '文件监控：监控文件或目录的创建、删除、修改事件。支持递归监控和深度限制。\n\n' +
    '示例：监控目录变化 { "path": "src", "events": "create,delete,modify", "duration": 60 }\n' +
    '示例：递归监控 { "path": "project", "events": "modify", "recursive": true, "max_depth": 3 }', {
    path: { type: 'string', description: DESCS.path },
    events: { type: 'string', description: '监控的事件类型，可选值：create(创建)、delete(删除)、modify(修改)，逗号分隔' },
    duration: { type: 'number', description: DESCS.duration },
    recursive: { type: 'boolean', description: DESCS.recursive },
    max_depth: { type: 'number', description: DESCS.max_depth },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, ['path'], {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  }),

  // execute_command: 执行命令（高风险）
  createDescriptor('execute_command',
    '命令执行：在系统中执行shell命令。支持管道、重定向，集成命令策略评估和sudo配置。\n\n' +
    '示例：列出文件 { "command": "ls -la", "output_format": "json" }\n' +
    '示例：带工作目录执行 { "command": "npm test", "working_directory": "/project", "timeout_ms": 120000 }', {
    command: { type: 'string', description: DESCS.command },
    working_directory: { type: 'string', description: DESCS.working_directory },
    confirm: { type: 'boolean', description: DESCS.confirm },
    timeout_ms: { type: 'number', description: DESCS.timeout_ms },
    stdout_max: { type: 'number', description: DESCS.stdout_max },
    stderr_max: { type: 'number', description: DESCS.stderr_max },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, ['command'], {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false
  }, OUTPUT_SCHEMAS.execute_command),

  // task_manager: 任务管理
  createDescriptor('task_manager',
    '任务管理：创建、更新、完成、列出和清空任务。支持优先级、截止日期、子任务和进度跟踪。\n\n' +
    '示例：创建任务 { "operation": "create", "model_name": "claude", "title": "完成文档", "priority": "high" }\n' +
    '示例：更新进度 { "operation": "update", "model_name": "claude", "task_id": "xxx", "progress": 50 }', {
    operation: { type: 'string', enum: ['create', 'list', 'update', 'complete', 'clear'], description: DESCS.operation_crud },
    model_name: { type: 'string', description: DESCS.model_name },
    task_id: { type: 'string', description: DESCS.task_id },
    title: { type: 'string', description: DESCS.title },
    description: { type: 'string', description: DESCS.description },
    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: DESCS.priority },
    due_date: { type: 'string', description: DESCS.due_date },
    progress: { type: 'number', description: DESCS.progress },
    subtasks: { type: 'array', items: { type: 'string' }, description: DESCS.subtasks },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, ['operation', 'model_name'], {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false
  }, OUTPUT_SCHEMAS.task_manager),

  // environment_memory: 环境变量存储
  createDescriptor('environment_memory',
    '环境记忆：读取、更新和获取环境变量。环境变量存储在 ~/.local_file_operations/.env 文件中。\n\n' +
    '示例：读取全部 { "operation": "read", "output_format": "json" }\n' +
    '示例：设置变量 { "operation": "update", "key": "PROJECT_PATH", "value": "/project" }', {
    operation: { type: 'string', enum: ['read', 'update', 'get'], description: '操作：read(读取全部)、update(更新/新增)、get(获取指定)' },
    key: { type: 'string', description: DESCS.key },
    value: { type: 'string', description: DESCS.value },
    output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
  }, ['operation'], {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false
  }, OUTPUT_SCHEMAS.environment_memory)
];

// 只在Linux系统上添加sudo配置工具描述符
if (platformUtils.isLinux) {
  descriptors.push(
    createDescriptor('sudo_config',
      'Linux Sudo无密码配置管理：生成、安装、测试和管理sudoers配置。支持dry-run演练模式。\n\n' +
      '示例：检查sudo状态 { "action": "status" }\n' +
      '示例：生成配置 { "action": "generate", "username": "user", "scope": "limited", "dry_run": true }', {
      action: { type: 'string', enum: ['status', 'generate', 'install', 'remove', 'list', 'test', 'recommendations'], description: '操作：status(状态)、generate(生成)、install(安装)、remove(移除)、list(列表)、test(测试)、recommendations(建议)' },
      username: { type: 'string', description: DESCS.username },
      scope: { type: 'string', enum: ['limited', 'extended', 'full'], description: DESCS.scope },
      commands: { type: 'array', items: { type: 'string' }, description: DESCS.commands },
      config_name: { type: 'string', description: DESCS.config_name },
      dry_run: { type: 'boolean', description: DESCS.dry_run },
      output_format: { type: 'string', enum: ['text', 'json', 'both'], description: DESCS.output_format }
    }, ['action'], {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    })
  );
}

function getToolInstance(name) { return instances[name]; }
function listToolNames() { return Object.keys(instances); }

module.exports = { instances, getToolInstance, listToolNames, descriptors, securityValidator };
