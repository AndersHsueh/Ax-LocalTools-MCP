// 统一输出格式辅助模块
// 提供 buildOutput(format, textMsg, jsonObj) => { content: [...] }
// format: 'text' | 'json' | 'both'

function buildOutput(format = 'text', textMsg = '', jsonObj = null) {
  switch (format) {
    case 'json':
      return { content: [ { type: 'json', json: jsonObj ?? { message: textMsg } } ] };
    case 'both':
      return { content: [
        { type: 'text', text: textMsg },
        { type: 'json', json: jsonObj ?? { message: textMsg } }
      ]};
    case 'text':
    default:
      return { content: [ { type: 'text', text: textMsg } ] };
  }
}

function textOnly(msg) { return buildOutput('text', msg); }
function jsonOnly(obj) { return buildOutput('json', '', obj); }
function both(textMsg, obj) { return buildOutput('both', textMsg, obj); }

module.exports = { buildOutput, textOnly, jsonOnly, both };
