/* Squizzle's brain. Vercel serverless function: POST { message, history, tools, page }  ->  { reply, actions }
 * The API key lives only in the environment (ANTHROPIC_API_KEY). Nothing here is reachable from the browser's code.
 * If the key is missing or the call fails, we answer 503 and the page falls back to its built-in rules. */

const MODEL = process.env.SQUIZZLE_MODEL || 'claude-haiku-5-5';

const SYSTEM = `You are Squizzle, the on-page guide for Squeez (trysqueez.com).
Facts you may use, and nothing beyond them:
- Squeez connects loyalty programs with sought-after experiences, so members get more meaningful ways to use their points and experience partners get new revenue.
- Golf is live. Dining is coming soon.
- Three audiences: loyalty programs and brands; experience partners (venues like golf clubs); strategic partners and investors (coming soon).
- Tagline: "Where loyalty, access and experiences come together."
- To partner: https://www.trysqueez.com/contact . You cannot send messages or book anything yourself.
Rules: be warm, plain and brief (under 60 words, no lists unless asked). If you do not know something (pricing, dates, integrations, numbers), say so and point to the contact page. Never invent partners, figures or promises.
Use tools when they help the visitor: goto to show a section, redeem or restartMoment to run the member demo, audience to open an audience tab. Say what you are doing in one short line.`;

const TOOLS = [
  { name: 'goto', description: 'Scroll the page to a section.', input_schema: { type: 'object', properties: { key: { type: 'string', enum: ['top', 'what', 'who', 'live', 'believe', 'talk'] } }, required: ['key'] } },
  { name: 'redeem', description: 'Run the sample member moment: the member taps Use my points.', input_schema: { type: 'object', properties: {} } },
  { name: 'restartMoment', description: 'Reset the member moment demo.', input_schema: { type: 'object', properties: {} } },
  { name: 'audience', description: 'Open one of the Who it is for tabs.', input_schema: { type: 'object', properties: { key: { type: 'string', enum: ['loyalty', 'experience', 'strategic'] } }, required: ['key'] } }
];

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

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'no key' })); }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const message = String(body.message || '').trim().slice(0, 600);
  if (!message) { res.statusCode = 400; return res.end(); }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system: SYSTEM, tools: TOOLS, messages: toMessages(body.history, message) })
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
