// Generates n8n example workflows (examples/*.json) and docker test files (test/*.local.json - contain the key, not shipped).
// usage: node gen-workflows.cjs <serve port> <key file>
const fs = require('fs'); const path = require('path');
const CRED = { ttduApi: { id: 'ttduLocal00001', name: 'TTDU this PC' } };
const LABEL = { A: 'A receipt photos to PDF', B: 'B payroll check', C: 'C redact personal data', HWP: 'HWP to PDF' };
const toB64 = "const out = [];\nfor (const [i, it] of $input.all().entries()) {\n  const files = [];\n  for (const f of it.json.files || []) {\n    const b = await this.helpers.getBinaryDataBuffer(i, f.binaryProperty);\n    files.push({ name: f.name, mime: f.mime, size: f.size, sha256: f.sha256, base64: b.toString('base64') });\n  }\n  out.push({ json: { ok: it.json.ok, count: it.json.count, notes: it.json.notes, files } });\n}\nreturn out;";
function webhookWf(preset, idx) {
  const p = 'ttdu-' + preset.toLowerCase();
  return {
    name: 'TTDU ' + LABEL[preset] + ' (webhook)', active: false, id: 'ttduWf' + String(idx).padStart(10, '0'),
    nodes: [
      { id: 'n1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: 'ttdu-wh-' + preset.toLowerCase() + '-0001', parameters: { httpMethod: 'POST', path: p, responseMode: 'responseNode', options: {} } },
      { id: 'n2', name: 'TTDU', type: 'n8n-nodes-ttdu.ttdu', typeVersion: 1, position: [220, 0], credentials: CRED, parameters: { flow: preset, binaryProperties: '', client: '={{ $json.body.client || "" }}', date: '={{ $json.body.date || "" }}', options: {} } },
      { id: 'n3', name: 'Files to base64', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 0], parameters: { jsCode: toB64 } },
      { id: 'n4', name: 'Respond', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [660, 0], parameters: { respondWith: 'firstIncomingItem', options: {} } },
    ],
    connections: { Webhook: { main: [[{ node: 'TTDU', type: 'main', index: 0 }]] }, TTDU: { main: [[{ node: 'Files to base64', type: 'main', index: 0 }]] }, 'Files to base64': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] } },
    settings: { executionOrder: 'v1' },
  };
}
const gmailWf = {
  name: 'TTDU Gmail attachment → redact → reply', active: false, id: 'ttduWfGmail00001',
  nodes: [
    { id: 'g1', name: 'Gmail Trigger', type: 'n8n-nodes-base.gmailTrigger', typeVersion: 1.2, position: [0, 0], parameters: { pollTimes: { item: [{ mode: 'everyMinute' }] }, simple: false, filters: { q: 'has:attachment subject:redact' }, options: { downloadAttachments: true } } },
    { id: 'g2', name: 'TTDU', type: 'n8n-nodes-ttdu.ttdu', typeVersion: 1, position: [240, 0], credentials: CRED, parameters: { flow: 'C', binaryProperties: '', client: '', date: '', options: { prefix: 'attachment_' } } },
    { id: 'g3', name: 'Gmail Reply', type: 'n8n-nodes-base.gmail', typeVersion: 2.1, position: [480, 0], parameters: { operation: 'reply', messageId: "={{ $('Gmail Trigger').item.json.id }}", emailType: 'text', message: 'Attached is a copy with personal data redacted (processed on this office PC only).', options: { attachmentsUi: { attachmentsBinary: [{ property: 'attachment_0' }] } } } },
  ],
  connections: { 'Gmail Trigger': { main: [[{ node: 'TTDU', type: 'main', index: 0 }]] }, TTDU: { main: [[{ node: 'Gmail Reply', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1' },
};
const folderWf = {
  name: 'TTDU folder HWP → PDF', active: false, id: 'ttduWfFolder0001',
  nodes: [
    { id: 'f1', name: 'New file in folder', type: 'n8n-nodes-base.localFileTrigger', typeVersion: 1, position: [0, 0], parameters: { triggerOn: 'folder', path: '/data/in-hwp', events: ['add'], options: {} } },
    { id: 'f2', name: 'Read file', type: 'n8n-nodes-base.readWriteFile', typeVersion: 1, position: [220, 0], parameters: { operation: 'read', fileSelector: '={{ $json.path }}', options: {} } },
    { id: 'f3', name: 'TTDU', type: 'n8n-nodes-ttdu.ttdu', typeVersion: 1, position: [440, 0], credentials: CRED, parameters: { flow: 'HWP', binaryProperties: 'data', client: '', date: '', options: {} } },
    { id: 'f4', name: 'Write PDF', type: 'n8n-nodes-base.readWriteFile', typeVersion: 1, position: [660, 0], parameters: { operation: 'write', fileName: "=/data/out-pdf/{{ $('Read file').item.binary.data.fileName.replace(/\\.hwpx?$/i, '') }}.pdf", dataPropertyName: 'file0', options: {} } },
  ],
  connections: { 'New file in folder': { main: [[{ node: 'Read file', type: 'main', index: 0 }]] }, 'Read file': { main: [[{ node: 'TTDU', type: 'main', index: 0 }]] }, TTDU: { main: [[{ node: 'Write PDF', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1' },
};
const ex = path.join(__dirname, '..', 'examples'); fs.mkdirSync(ex, { recursive: true });
const wfs = ['A', 'B', 'C', 'HWP'].map((p, i) => webhookWf(p, i + 1));
const names = ['01-webhook-A-receipts-to-pdf', '02-webhook-B-payroll-check', '03-webhook-C-redact', '04-webhook-HWP-to-pdf'];
wfs.forEach((w, i) => fs.writeFileSync(path.join(ex, names[i] + '.json'), JSON.stringify(w, null, 2)));
fs.writeFileSync(path.join(ex, '05-gmail-attachment-redact-reply.json'), JSON.stringify(gmailWf, null, 2));
fs.writeFileSync(path.join(ex, '06-folder-HWP-to-pdf.json'), JSON.stringify(folderWf, null, 2));
const port = process.argv[2] || '8790', key = process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8').trim() : '';
fs.writeFileSync(path.join(__dirname, 'workflows.local.json'), JSON.stringify(wfs));
fs.writeFileSync(path.join(__dirname, 'credentials.local.json'), JSON.stringify([{ id: CRED.ttduApi.id, name: CRED.ttduApi.name, type: 'ttduApi', data: { target: 'local', baseUrl: 'http://host.docker.internal:' + port, apiKey: key } }]));
console.log('examples 6, test workflows', wfs.length);
