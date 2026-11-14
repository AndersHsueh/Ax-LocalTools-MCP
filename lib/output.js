// 统一输出格式辅助模块
// 提供 buildOutput(format, textMsg, jsonObj) => { content: [...], structuredContent? }
// format: 'text' | 'json' | 'both'
//
// MCP 规范的 ContentBlock.type 仅允许：text / image / audio / resource / resource_link
// 结构化数据一律以 text 块承载（JSON 字符串），同时通过 structuredContent 下发，
// 这样声明了 outputSchema 的工具才有合规的机器可读输出。

function buildOutput(format = 'text', textMsg = '', jsonObj = null) {
  const payload = jsonObj ?? { message: textMsg };

  switch (format) {
    case 'json':
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload
      };
    case 'both':
      return {
        content: [
          { type: 'text', text: textMsg },
          { type: 'text', text: JSON.stringify(payload, null, 2) }
        ],
        structuredContent: payload
      };
    case 'text':
    default:
      // 纯文本模式也附带结构化数据：声明了 outputSchema 的工具才有机器可读输出
      return jsonObj === null
        ? { content: [{ type: 'text', text: textMsg }] }
        : { content: [{ type: 'text', text: textMsg }], structuredContent: payload };
  }
}

function textOnly(msg) { return buildOutput('text', msg); }
function jsonOnly(obj) { return buildOutput('json', '', obj); }
function both(textMsg, obj) { return buildOutput('both', textMsg, obj); }

module.exports = { buildOutput, textOnly, jsonOnly, both };
