/* Squizzle's brain. Vercel serverless function: POST { message, history, tools, page }  ->  { reply, actions }
 * The API key lives only in the environment (ANTHROPIC_API_KEY). Nothing here is reachable from the browser's code.
 * If the key is missing or the call fails, we answer 503 and the page falls back to its built-in rules. */

const MODEL = process.env.SQUIZZLE_MODEL || 'claude-haiku-5-5';

const MAP = require('../assets/page-map.json');      /* the same file the browser reads: one source of truth for what is on the page */
const KEYS = MAP.sections.map(x => x.key), AUD = MAP.audiences.map(x => x.key), R = MAP.rulesDial;

function pageGuide() {
  return MAP.sections.map(x => `- ${x.key} (${x.label}): ${x.summary}` + (x.demo ? ` Demo: ${x.demo}` : '') +
    (x.actions.length ? ` Tools: ${x.actions.map(a => `${a.tool} when ${a.when}`).join('; ')}.` : '')).join('\n') +
    '\nAudiences (tabs in who): ' + MAP.audiences.map(a => `${a.key} = ${a.label}`).join('; ') + '.';
}

const SYSTEM = `You are Squizzle, the on-page guide for Squeez (trysqueez.com).
About Squeez, and nothing beyond it:
- ${MAP.company.what}
- ${MAP.company.live} Tagline: "${MAP.company.tagline}" Based in ${MAP.company.based}.
- To partner: ${MAP.company.contact} . You cannot send messages or book anything yourself.

THIS PAGE, section by section (use these keys with the goto tool):
${pageGuide()}

How to guide:
- When a question is answered by a section or a demo, show it: call goto for that section, then the demo tool if one fits, and say in one short line what the visitor is looking at.
- The visitor's current position is given under WHERE THE VISITOR IS. Do not send them to a section they are already on; talk about what is in front of them instead.
- Be warm, plain and brief (under 60 words, no lists unless asked). If you do not know something (pricing, dates, integrations, numbers), say so and point to the contact page. Never invent partners, figures or promises.`;

const TOOLS = [
  { name: 'goto', description: 'Scroll the page to a section and highlight it.', input_schema: { type: 'object', properties: { key: { type: 'string', enum: KEYS } }, required: ['key'] } },
  { name: 'redeem', description: 'Run the sample member moment: the member taps Use my points.', input_schema: { type: 'object', properties: {} } },
  { name: 'restartMoment', description: 'Reset the member moment demo.', input_schema: { type: 'object', properties: {} } },
  { name: 'audience', description: 'Open one of the Who it is for tabs.', input_schema: { type: 'object', properties: { key: { type: 'string', enum: AUD } }, required: ['key'] } },
  { name: 'setRules', description: `Set the rules demo sliders. Whole dollars per player, ${R.min} to ${R.max}. Floor must not exceed auto.`, input_schema: { type: 'object', properties: { floor: { type: 'integer', minimum: R.min, maximum: R.max }, auto: { type: 'integer', minimum: R.min, maximum: R.max }, offer: { type: 'integer', minimum: R.min, maximum: R.max } }, required: ['floor', 'auto', 'offer'] } }
];

/* What the browser tells us about the visitor's position. Only keys and numbers we recognise get through: never free text. */
function whereLine(c) {
  c = c && typeof c === 'object' ? c : {};
  const sec = MAP.sections.find(x => x.key === c.section), n = v => Math.max(R.min, Math.min(R.max, Math.round(Number(v)))), out = [];
  if (sec) out.push(`viewing ${sec.key} (${sec.label})`);
  if (c.moment === 'ask' || c.moment === 'done') out.push(`the member moment is ${c.moment === 'done' ? 'confirmed' : 'waiting for Use my points'}`);
  if (AUD.includes(c.tab)) out.push(`the open audience tab is ${c.tab}`);
  const r = c.rules; if (r && [r.f, r.a, r.o].every(v => Number.isFinite(Number(v)))) out.push(`the dial is at floor $${n(r.f)}, auto-approve $${n(r.a)}, sample offer $${n(r.o)}`);
  return out.length ? '\n\nWHERE THE VISITOR IS: ' + out.join('; ') + '.' : '';
}

function toMessages(history, message) {
  const out = [];
  for (const h of Array.isArray(history) ? history.slice(-10) : []) {
    const role = h && h.role === 'user' ? 'user' : 'assistant';
    const text = String((h && h.text) || '').slice(0, 800);
    if (!text) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + text; else out.push({ role, content: text });
  }
  const last = out[out.length - 1];
  if (!(last && last.role === 'user' && last.content.endsWith(message))) {
    if (last && last.role === 'user') last.content += '\n' + message; else out.push({ role: 'user', content: message });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

const ALLOWED = (process.env.SQUIZZLE_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
const hits = new Map();                                          /* best effort, per server instance; use Vercel WAF / Upstash for a hard limit */
function limited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, h = (hits.get(ip) || []).filter(t => now - t < win);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > 20;
}
function originOk(req) {
  const o = req.headers.origin || '', host = req.headers.host || '';
  if (!o) return false;
  try { const u = new URL(o); return u.host === host || ALLOWED.includes(u.origin); } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  if (!originOk(req)) { res.statusCode = 403; return res.end(); }
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'x').trim();
  if (limited(ip)) { res.statusCode = 429; return res.end(); }
  if (Number(req.headers['content-length'] || 0) > 8000) { res.statusCode = 413; return res.end(); }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'no key' })); }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const message = String(body.message || '').trim().slice(0, 600);
  if (!message) { res.statusCode = 400; return res.end(); }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, system: SYSTEM + whereLine(body.context), tools: TOOLS, messages: toMessages(body.history, message) })
    });
    if (!r.ok) { res.statusCode = 502; return res.end(JSON.stringify({ error: 'upstream ' + r.status })); }
    const data = await r.json();
    const blocks = data.content || [];
    const reply = blocks.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
    const actions = blocks.filter(b => b.type === 'tool_use').map(b => ({ tool: b.name, args: b.input || {} }));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ reply: reply || (actions.length ? 'On it.' : ''), actions }));
  } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: 'failed' })); }
};
