class ToolError extends Error {
  constructor(code, message, meta = {}) { super(message); this.code = code; this.meta = meta; }
}
const ERR = {
  PATH_DENIED: (p) => new ToolError('E_PATH_DENIED', `路径不允许: ${p}`),
  NOT_FOUND: (p) => new ToolError('E_NOT_FOUND', `对象不存在: ${p}`),
  INVALID_ARGS: (m) => new ToolError('E_INVALID_ARGS', m),
  DANGEROUS_CMD: (c) => new ToolError('E_DANGEROUS_CMD', `危险命令: ${c}`),
  LIMIT_REACHED: (m) => new ToolError('E_LIMIT_REACHED', m)
};
module.exports = { ToolError, ERR };
