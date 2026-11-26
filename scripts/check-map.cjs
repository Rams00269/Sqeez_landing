/* Checks assets/page-map.json against index.html so the guide can never point at something that is not on the page.
 * Run: node scripts/check-map.cjs   (exit code 1 on any problem) */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const map = JSON.parse(fs.readFileSync(path.join(root, 'assets/page-map.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'api/chat.js'), 'utf8');
const skills = fs.readFileSync(path.join(root, 'assets/mascot/skills/squeez.js'), 'utf8');
const bad = [];
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const keys = new Set();
map.sections.forEach(s => {
  if (keys.has(s.key)) bad.push('duplicate key ' + s.key); keys.add(s.key);
  if (!/^#[\w-]+$/.test(s.sel) || !ids.has(s.sel.slice(1))) bad.push(`${s.key}: no element ${s.sel} in index.html`);
  if (!s.summary) bad.push(`${s.key}: empty summary`);
  (s.actions || []).forEach(a => { if (!skills.includes(`M.tool('${a.tool}'`)) bad.push(`${s.key}: tool ${a.tool} is not defined in squeez.js`); });
});
map.audiences.forEach(a => { if (!new RegExp(`data-k="${a.key}"`).test(html)) bad.push(`audience ${a.key}: no tab with data-k="${a.key}"`); });
['floor', 'auto', 'offerAmt'].forEach(i => { if (!ids.has(i)) bad.push('rules dial: missing #' + i); });
const navKeys = [...html.matchAll(/data-sec="([^"]+)"/g)].map(m => m[1]);
navKeys.forEach(k => { if (!keys.has(k)) bad.push(`nav item ${k} is not in the page map`); });
if (!/page-map\.json/.test(nav)) bad.push('api/chat.js does not read the page map');
console.log(bad.length ? bad.map(b => 'FAIL ' + b).join('\n') : `ok: ${map.sections.length} sections, ${map.audiences.length} audiences, all present on the page`);
process.exit(bad.length ? 1 : 0);
