// SportLocker · Agent Office — serveur live.
// Tail le transcript JSONL de la session Claude Code en cours (dossier projet
// sportlocker), classe chaque tool_use en « action d'agent », et pousse le tout
// aux navigateurs connectés via Server-Sent Events. Aucune dépendance externe.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4567;
// Dossier des transcripts Claude Code à suivre — configurable via env pour
// fonctionner sur n'importe quelle machine/projet.
const TRANSCRIPT_DIR = process.env.AGENT_OFFICE_TRANSCRIPT_DIR || path.join(
  os.homedir(),
  '.claude/projects/-Users-stanislascorbanese-Downloads-sportlocker',
);

/* ------------------------- diffusion SSE ------------------------- */
const clients = new Set();
const recent = [];
function broadcast(ev) {
  recent.push(ev);
  if (recent.length > 50) recent.shift();
  const data = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) { try { res.write(data); } catch {} }
}

/* ------------------- classification tool_use → agent ------------------- */
const baseName = (p) => (p || '').split('/').pop();
function classify(name, input) {
  input = input || {};
  const file = input.file_path || input.path || '';
  const cmd = (input.command || '').trim();
  const blob = (name + ' ' + file + ' ' + cmd + ' ' + (input.pattern || '')).toLowerCase();
  let agent = 'api-route-builder';
  let verb = name;
  let kind = 'tool';

  if (name === 'Bash') {
    const parts = cmd.split(/\s+/);
    const c = baseName(parts[0]); const sub = parts[1] && !parts[1].startsWith('-') ? parts[1] : '';
    if (/vitest|pytest|typecheck|test|coverage/.test(cmd)) { agent = 'test-coverage'; verb = 'lance les tests'; }
    else if (/pnpm audit|audit/.test(cmd)) { agent = 'security-reviewer'; verb = 'audit deps'; }
    else if (c === 'git') { verb = 'git ' + sub; }
    else if (c === 'gh') { verb = 'gh ' + sub; }
    else verb = (c + (sub ? ' ' + sub : '')).slice(0, 22);
  } else if (name === 'Read') { verb = 'lit ' + baseName(file); }
  else if (name === 'Edit' || name === 'Write' || name === 'NotebookEdit') { verb = 'édite ' + baseName(file); }
  else if (name === 'Grep' || name === 'Glob') { verb = 'cherche ' + (input.pattern || '…'); }
  else if (name === 'Workflow') { agent = '*worker'; verb = 'lance un workflow'; }
  else if (name === 'Agent' || name === 'Task') { agent = '*worker'; verb = 'délègue un agent'; }
  else if (name.startsWith('mcp__')) { verb = name.split('__').slice(-1)[0]; }

  // route par mots-clés vers l'agent métier le plus pertinent (généraliste sinon)
  if (agent === 'api-route-builder') {
    if (/stripe|payment|webhook|wallet/.test(blob)) agent = 'stripe-reviewer';
    else if (/migration|drizzle|\.sql|schema/.test(blob)) agent = 'drizzle-migration';
    else if (/security|auth|jwt|rgpd|rate.?limit|redacti|secret/.test(blob)) agent = 'security-reviewer';
    else if (/firmware|mqtt|pytest|\.py|python/.test(blob)) agent = 'firmware-python';
    else if (/test|vitest|coverage|\.test\./.test(blob)) agent = 'test-coverage';
  }
  return { agent, verb: (verb || name).slice(0, 28), kind };
}

/* ------------------------- tail du transcript ------------------------- */
let curFile = null, offset = 0, leftover = '';
function newestJsonl() {
  try {
    const entries = fs.readdirSync(TRANSCRIPT_DIR)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({ f, m: fs.statSync(path.join(TRANSCRIPT_DIR, f)).mtimeMs }));
    if (!entries.length) return null;
    entries.sort((a, b) => b.m - a.m);
    return path.join(TRANSCRIPT_DIR, entries[0].f);
  } catch { return null; }
}
function processChunk(text) {
  const lines = (leftover + text).split('\n');
  leftover = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type && o.type !== 'assistant') continue;
    const content = o.message && o.message.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (!c || c.type !== 'tool_use') continue;
      broadcast({ ...classify(c.name, c.input), ts: Date.now() });
    }
  }
}
function readFrom(file, start) {
  const sz = fs.statSync(file).size;
  if (sz <= start) return sz;
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(sz - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  let s = buf.toString('utf8');
  if (start > 0) { const nl = s.indexOf('\n'); if (nl >= 0) s = s.slice(nl + 1); } // skip ligne partielle
  processChunk(s);
  return sz;
}
function poll() {
  const f = newestJsonl();
  if (!f) return;
  try {
    if (f !== curFile) {                       // nouveau fichier (nouvelle session)
      curFile = f; leftover = '';
      const sz = fs.statSync(f).size;
      offset = readFrom(f, Math.max(0, sz - 18000)); // petit backlog au démarrage
    } else {
      const sz = fs.statSync(f).size;
      if (sz < offset) offset = 0;             // rotation/truncate
      offset = readFrom(f, offset);
    }
  } catch {}
}
setInterval(poll, 600);
poll();

/* ------------------------------- HTTP ------------------------------- */
const CT = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.mjs': 'text/javascript' };
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 2000\n\n');
    for (const ev of recent.slice(-15)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    clients.add(res);
    const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch {} }, 15000);
    req.on('close', () => { clients.delete(res); clearInterval(ka); });
    return;
  }
  const rel = url === '/' ? '/index.html' : url;
  const fp = path.join(__dirname, path.normalize(rel));
  if (!fp.startsWith(__dirname)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (e, data) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': CT[path.extname(fp)] || 'text/plain' });
    res.end(data);
  });
});
server.listen(PORT, () => console.log(`Agent Office (live) → http://localhost:${PORT}`));
