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

// 生成带最小 JSON Schema 的工具描述，客户端（如 Qwen）要求每个工具含 inputSchema
function createDescriptor(name, description, properties = {}, required = []) {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      additionalProperties: true,
      properties,
      required
    }
  };
}

const descriptors = [
  createDescriptor('file_operation', '文件操作：读/写/列目录/创建/删除，支持工作目录解析', {
    operation: { type: 'string', enum: ['read','write','list','create_dir','delete'] },
    path: { type: 'string' },
    working_directory: { type: 'string' },
    content: { type: 'string', description: '写入/追加内容' },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }, ['operation']),
  createDescriptor('time_tool', '时间工具：多格式当前时间获取（ISO/UNIX/本地）', {
    format: { type: 'string', enum: ['iso','unix','unix_ms','rfc3339','locale'] },
    include_milliseconds: { type: 'boolean' },
    time_zone: { type: 'string' },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }),
  createDescriptor('file_edit', '文件行级编辑：删除/插入/替换/追加', {
    operation: { type: 'string', enum: ['delete_lines','insert_lines','replace_lines','append_lines'] },
    path: { type: 'string' },
    start_line: { type: 'number' },
    end_line: { type: 'number' },
    content: { type: 'string' },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }, ['operation','path']),
  createDescriptor('file_search', '文件内容搜索：支持正则、类型过滤、深度/数量/忽略/超时控制', {
    search_path: { type: 'string' },
    pattern: { type: 'string' },
    file_types: { type: 'string', description: '逗号分隔扩展名列表' },
    case_sensitive: { type: 'boolean' },
    max_results: { type: 'number' },
    max_depth: { type: 'number' },
    timeout_ms: { type: 'number' },
    ignore: { type: 'array', items: { type: 'string' } },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }, ['search_path','pattern']),
  createDescriptor('file_compare', '文件差异比较：文本/JSON 输出', {
    file1: { type: 'string' },
    file2: { type: 'string' },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }, ['file1','file2']),
  createDescriptor('file_hash', '文件哈希：md5/sha1/sha256/sha512', {
    path: { type: 'string' },
    algorithm: { type: 'string', enum: ['md5','sha1','sha256','sha512'] },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }, ['path']),
  createDescriptor('file_permissions', '跨平台文件权限管理（Unix/Windows，支持递归）', {
    path: { type: 'string' },
    mode: { type: 'string' },
    permissions: { type: 'object', description: 'Windows权限设置' },
    recursive: { type: 'boolean' },
    max_depth: { type: 'number' },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }, ['path']),
  createDescriptor('file_archive', '压缩/解压：zip/tar/gz/tar.gz（spawn 安全参数）', {
    operation: { type: 'string', enum: ['compress','extract'] },
    source: { type: 'string' },
    destination: { type: 'string' },
    format: { type: 'string', enum: ['zip','tar','gz','tar.gz'] },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }, ['operation','source']),
  createDescriptor('file_watch', '跨平台文件监控：增强的变化监听（Linux手动递归优化）', {
    path: { type: 'string' },
    events: { type: 'string' },
    duration: { type: 'number' },
    recursive: { type: 'boolean' },
    max_depth: { type: 'number' },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }, ['path']),
  createDescriptor('execute_command', '跨平台命令执行：增强策略评估 + sudo支持', {
    command: { type: 'string' },
    working_directory: { type: 'string' },
    confirm: { type: 'boolean' },
    timeout_ms: { type: 'number' },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }, ['command']),
  createDescriptor('task_manager', '任务管理：创建/更新/完成/列表/清空', {
    operation: { type: 'string', enum: ['create','list','update','complete','clear'] },
    model_name: { type: 'string' },
    task_id: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    priority: { type: 'string', enum: ['low','medium','high','urgent'] },
    due_date: { type: 'string' },
    progress: { type: 'number' },
    subtasks: { type: 'array', items: { type: 'string' } },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }, ['operation','model_name']),
  createDescriptor('environment_memory', '环境记忆：读取/更新/获取键值', {
    operation: { type: 'string', enum: ['read','update','get'] },
    key: { type: 'string' },
    value: { type: 'string' },
    output_format: { type: 'string', enum: ['text','json','both'] }
  }, ['operation'])
];

// 只在Linux系统上添加sudo配置工具描述符
if (platformUtils.isLinux) {
  descriptors.push(
    createDescriptor('sudo_config', 'Linux Sudo无密码配置管理：生成/安装/测试/管理sudoers配置', {
      action: { type: 'string', enum: ['status','generate','install','remove','list','test','recommendations'] },
      username: { type: 'string' },
      scope: { type: 'string', enum: ['limited','extended','full'] },
      commands: { type: 'array', items: { type: 'string' } },
      config_name: { type: 'string' },
      dry_run: { type: 'boolean' },
      output_format: { type: 'string', enum: ['text','json','both'] }
    }, ['action'])
  );
}

function getToolInstance(name) { return instances[name]; }
function listToolNames() { return Object.keys(instances); }

module.exports = { instances, getToolInstance, listToolNames, descriptors, securityValidator };