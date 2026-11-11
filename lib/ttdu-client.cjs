'use strict';
// TTDU connection spec v1 (shared by the Node-RED, n8n, Trigger.dev packages; Python copy in airflow-provider-ttdu).
// One request shape for both targets:
//   local = the office PC runner `ttdu serve` (http://127.0.0.1:8790). Files go only to this PC's runner, which runs
//           offline (outbound network blocked) - nothing leaves the PC.
//   hub   = the TTDU hub API (https://toolsthatdontupload.com). Files ARE sent to the hub for the run (15 MB limit).
// POST {base}/v1/flows/run  multipart: flow (JSON ttdu.flow/v1), vars (JSON), files (repeated)
//   header X-API-Key
//   -> { ok, steps, notes, outputs: [{ name, mime, size, sha256, base64 }] }
// MIT License, (c) 2026 Park Jihoon (Tools That Don't Upload).
const PRESETS = require('./presets.json');
const DEFAULT_URL = { local: 'http://127.0.0.1:8790', hub: 'https://toolsthatdontupload.com' };
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', 'host.docker.internal']);

function baseUrlOf(auth) {
  const target = auth && auth.target === 'hub' ? 'hub' : 'local';
  const u = (auth && auth.baseUrl && String(auth.baseUrl).trim()) || DEFAULT_URL[target];
  return u.replace(/\/+$/, '');
}
function isLocalUrl(url) { try { return LOCAL_HOSTS.has(new URL(url).hostname); } catch { return false; } }

/** name/extension guess from the first bytes, for files that arrive without a usable name */
function sniffExt(b) {
  const head = (n) => b.subarray(0, n).toString('latin1');
  if (head(4) === '%PDF') return 'pdf';
  if (head(4) === '\x89PNG') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (head(4) === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return /W\0o\0r\0k\0b\0o\0o\0k/.test(head(65536)) ? 'xls' : 'hwp';
  if (b[0] === 0x50 && b[1] === 0x4b) { const h = head(65536); return h.includes('xl/') ? 'xlsx' : h.includes('word/') ? 'docx' : (h.includes('Contents/') || h.includes('hwp')) ? 'hwpx' : 'zip'; }
  return 'bin';
}
/** files: [{ name?, data: Buffer|Uint8Array|base64 string }] */
function normFiles(files) {
  const out = [];
  (Array.isArray(files) ? files : [files]).forEach((f, i) => {
    if (!f) return;
    let data = f.data !== undefined ? f.data : f.buffer !== undefined ? f.buffer : f;
    if (typeof data === 'string') data = Buffer.from(data, 'base64');
    if (!(data instanceof Uint8Array)) return;
    data = Buffer.from(data);
    let name = String(f.name || f.filename || f.fileName || '').trim();
    if (!/\.[A-Za-z0-9]{2,5}$/.test(name)) name = (name || 'file' + (i + 1)) + '.' + sniffExt(data);
    out.push({ name: name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_'), data });
  });
  if (!out.length) throw new Error('TTDU: no files given');
  return out;
}
function resolveFlow(flow) {
  if (typeof flow === 'string' && PRESETS[flow]) return PRESETS[flow];
  if (typeof flow === 'string') return JSON.parse(flow);
  if (flow && typeof flow === 'object') return flow;
  throw new Error('TTDU: flow must be a preset id (' + Object.keys(PRESETS).join(', ') + ') or ttdu.flow/v1 JSON');
}
function oneStepFlow(tool, options, scope) { return { schema: 'ttdu.flow/v1', steps: [{ tool, scope: scope || 'each', options: options || {} }] }; }

/** returns { ok, steps, notes, outputs:[{name,mime,size,sha256,data:Buffer}] } */
async function runFlow(auth, flow, files, vars, opts) {
  const url = baseUrlOf(auth) + '/v1/flows/run';
  if ((!auth || auth.target !== 'hub') && !isLocalUrl(url)) throw new Error('TTDU: local target must be this PC (127.0.0.1, localhost, host.docker.internal): ' + url);
  if (!auth || !auth.apiKey) throw new Error('TTDU: API key missing');
  const form = new FormData();
  form.append('flow', JSON.stringify(resolveFlow(flow)));
  form.append('vars', JSON.stringify(vars || {}));
  if (opts && opts.deliver != null) { if (auth.target === 'hub') throw new Error('TTDU: deliver (keep results in office systems) works only with the office PC runner'); form.append('deliver', JSON.stringify(opts.deliver)); } // P7 deliver
  for (const f of normFiles(files)) form.append('files', new Blob([f.data]), f.name);
  const res = await fetch(url, { method: 'POST', headers: { 'X-API-Key': String(auth.apiKey).trim() }, body: form, signal: AbortSignal.timeout((opts && opts.timeoutMs) || 600000) });
  const text = await res.text();
  let r = null; try { r = JSON.parse(text); } catch { r = null; }
  if (!res.ok || !r || r.ok !== true || !Array.isArray(r.outputs)) {
    const e = new Error('TTDU run failed (HTTP ' + res.status + '): ' + text.slice(0, 500)); e.status = res.status; e.body = r || text; throw e;
  }
  return { ok: true, steps: r.steps || [], notes: r.notes || [], deliveries: r.deliveries || [], outputs: r.outputs.map((o) => ({ name: o.name, mime: o.mime, size: o.size, sha256: o.sha256, data: Buffer.from(o.base64, 'base64') })) };
}
async function health(auth) {
  const res = await fetch(baseUrlOf(auth) + '/v1/health', { headers: { 'X-API-Key': String(auth.apiKey || '').trim() }, signal: AbortSignal.timeout(10000) });
  return { status: res.status, body: await res.text() };
}
module.exports = { PRESETS, DEFAULT_URL, baseUrlOf, isLocalUrl, sniffExt, normFiles, resolveFlow, oneStepFlow, runFlow, health };
