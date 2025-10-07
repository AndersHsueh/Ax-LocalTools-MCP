function text(t) { return { content: [{ type: 'text', text: t }] }; }
function json(obj) { return { content: [{ type: 'json', json: obj }] }; }
function both(obj, label='') { return { content: [ { type:'text', text: label || JSON.stringify(obj, null, 2) }, { type:'json', json: obj } ] }; }
module.exports = { text, json, both };
