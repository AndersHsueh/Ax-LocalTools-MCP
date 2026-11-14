/**
 * 工具调用分发器
 *
 * 从 index.js 抽出的请求处理逻辑，使 MCP 请求路径可以被直接测试
 * （不依赖 @modelcontextprotocol/sdk 的 stdio 传输层）。
 *
 * index.js 的 stdio 处理器只负责把 request.params 交给这里。
 */

const { ERR } = require('../errors');
const { descriptors } = require('../tools/registry');

// MCP SDK 规定：工具描述符声明了 outputSchema 时，成功结果必须带 structuredContent
// （客户端会以 -32600 拒绝），并会用 Ajv 按 schema 校验。这里统一兜底，
// 避免某个工具的某个分支漏掉，导致整个调用在真实客户端上失败。
const OUTPUT_SCHEMA_TOOLS = new Set(
  (descriptors || []).filter(d => d.outputSchema).map(d => d.name)
);

function deriveStructuredContent(result, args) {
  // 不少工具把 JSON 放在最后一个 text 块里，优先复用真实数据
  for (const block of [...(result.content || [])].reverse()) {
    if (block.type !== 'text') continue;
    const raw = String(block.text || '').trim();
    if (!raw.startsWith('{') && !raw.startsWith('[')) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // 不是 JSON 文本，继续尝试下一个块
    }
  }
  // outputSchema 都未声明 required / additionalProperties:false，最小对象即可合规
  const fallback = {};
  if (typeof args.operation === 'string') fallback.operation = args.operation;
  if (typeof args.command === 'string') fallback.command = args.command;
  return fallback;
}

/**
 * 统一的错误结果。保留错误码，避免上层只剩一句中文。
 */
function errorResult(error) {
  const rawCode = error && error.code;
  const code = typeof rawCode === 'string' && rawCode.startsWith('E_') ? rawCode : 'E_INTERNAL';
  const message = (error && error.message) || '未知错误';
  return {
    content: [{ type: 'text', text: `[${code}] ${message}` }],
    structuredContent: { error: { code, message } },
    isError: true
  };
}

/**
 * 分发一次工具调用。
 *
 * @param {string} name 工具名
 * @param {object} rawArgs 调用参数
 * @param {object} deps { getToolInstance, workspaceManager }
 * @returns {Promise<object>} MCP CallToolResult
 */
async function dispatch(name, rawArgs, deps) {
  const { getToolInstance, workspaceManager } = deps;
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};

  try {
    // 为工具调用补充工作目录（未显式提供时）
    const toolArgs = { ...args };
    if (!toolArgs.working_directory && !toolArgs.working_dir) {
      toolArgs.working_directory = workspaceManager.getCurrentWorkspace();
    }

    const tool = getToolInstance(name);
    if (!tool) throw ERR.INVALID_ARGS(`未知工具: ${name}`);

    const result = await tool.handle(toolArgs);
    if (result && !result.isError && OUTPUT_SCHEMA_TOOLS.has(name) && !result.structuredContent) {
      result.structuredContent = deriveStructuredContent(result, toolArgs);
    }
    return result;
  } catch (error) {
    return errorResult(error);
  }
}

module.exports = { dispatch, errorResult };
