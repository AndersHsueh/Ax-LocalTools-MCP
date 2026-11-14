// 输出响应工厂（保留旧接口，统一委托给 lib/output.js）
// text(t) / json(obj) / both(obj, label)

const { buildOutput, textOnly, jsonOnly } = require('./lib/output');

function text(t) { return textOnly(t); }
function json(obj) { return jsonOnly(obj); }
function both(obj, label = '') {
  return buildOutput('both', label || JSON.stringify(obj, null, 2), obj);
}

module.exports = { text, json, both };
