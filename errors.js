class ToolError extends Error {
  constructor(code, message, meta = {}) { super(message); this.code = code; this.meta = meta; }
}
const ERR = {
  PATH_DENIED: (p) => new ToolError('E_PATH_DENIED', `路径不允许: ${p}`),
  NOT_FOUND: (p) => new ToolError('E_NOT_FOUND', `对象不存在: ${p}`),
  INVALID_ARGS: (m) => new ToolError('E_INVALID_ARGS', m),
  DANGEROUS_CMD: (c) => new ToolError('E_DANGEROUS_CMD', `危险命令: ${c}`),
  LIMIT_REACHED: (m) => new ToolError('E_LIMIT_REACHED', m),
  FILE_TOO_LARGE: (size, limit) => new ToolError('E_FILE_TOO_LARGE', `文件大小 (${formatBytes(size)}) 超过限制 (${formatBytes(limit)})，请使用分块读取`)
};
module.exports = { ToolError, ERR };

// 辅助函数：格式化字节
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}
