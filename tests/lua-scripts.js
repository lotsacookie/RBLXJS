const R = require('/home/claude/rbx-lua.js');
const fs = require('fs'), path = require('path');
let ok = 0, bad = 0;
function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else if (/\.lua$/i.test(f)) { const src = fs.readFileSync(p, 'utf8'); if (!/[a-z]/.test(src)) continue; try { R.compileToJs(src, f); ok++; } catch (e) { bad++; if (bad < 15) console.log(p, e.message); } } } }
walk('/home/claude/lotsacookie');
console.log('ok', ok, 'bad', bad);
