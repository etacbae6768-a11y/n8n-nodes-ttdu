// node --test test/inputs.test.cjs  (after `node build.cjs`). MIT (c) 2026 Park Jihoon (Tools That Don't Upload).
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../dist/nodes/Ttdu/inputs.js');

test('parseList splits, trims, unquotes and drops duplicates', () => {
	assert.deepEqual(m.parseList(' /a/x.pdf, "/a/y.pdf"\n/a/x.pdf;; '), ['/a/x.pdf', '/a/y.pdf']);
	assert.deepEqual(m.parseList(['/a', ' /b ']), ['/a', '/b']);
	assert.deepEqual(m.parseList(undefined), []);
});

test('normalizePath refuses relative paths and ".."', () => {
	assert.equal(m.normalizePath('files/a.pdf'), null);
	assert.equal(m.normalizePath('/files/in/../secret.txt'), null);
	assert.equal(m.normalizePath('C:\\Docs\\..\\x'), null);
	assert.equal(m.normalizePath('/files//in/./a.pdf'), '/files/in/a.pdf');
	assert.equal(m.normalizePath('C:\\Docs\\In\\A.pdf'), 'c:/docs/in/a.pdf');
	assert.equal(m.normalizePath('/x\0y'), null);
});

test('isInsideFolder: only the folder and below, no prefix tricks', () => {
	assert.equal(m.isInsideFolder('/files/in', '/files/in/a.pdf'), true);
	assert.equal(m.isInsideFolder('/files/in/', '/files/in/sub/a.pdf'), true);
	assert.equal(m.isInsideFolder('/files/in', '/files/in2/a.pdf'), false);
	assert.equal(m.isInsideFolder('/files/in', '/files/out/a.pdf'), false);
	assert.equal(m.isInsideFolder('/files/in', '/files/in/../out/a.pdf'), false);
	assert.equal(m.isInsideFolder('C:\\Office\\In', 'c:/office/in/A.PDF'), true);
	assert.equal(m.isInsideFolder('C:\\Office\\In', 'C:\\Office\\Inbox\\a.pdf'), false);
	assert.equal(m.isInsideFolder('relative', '/files/a.pdf'), false);
});

test('hostAllowed: exact hosts and *. subdomains only', () => {
	const list = ['files.example.com', '*.example.org'];
	assert.equal(m.hostAllowed('files.example.com', list), true);
	assert.equal(m.hostAllowed('FILES.example.com.', list), true);
	assert.equal(m.hostAllowed('evil-files.example.com', list), false);
	assert.equal(m.hostAllowed('example.com', list), false);
	assert.equal(m.hostAllowed('a.example.org', list), true);
	assert.equal(m.hostAllowed('example.org', list), false);
	assert.equal(m.hostAllowed('example.org.evil.net', list), false);
	assert.equal(m.hostAllowed('anything', []), false);
});

test('file names from URLs and paths', () => {
	assert.equal(m.fileNameFromUrl(new URL('https://h/dir/%EA%B0%80%20b.pdf?x=1'), 0), '가 b.pdf');
	assert.equal(m.fileNameFromUrl(new URL('https://h/'), 2), 'download-3');
	assert.equal(m.fileNameFromUrl(new URL('https://h/a%ZZ.pdf'), 0), 'a_ZZ.pdf');
	assert.equal(m.fileNameFromUrl(new URL('https://h/%FF.pdf'), 0), '_FF.pdf');
	assert.equal(m.baseName('C:\\in\\form.pdf'), 'form.pdf');
});

const c = require('../dist/nodes/Ttdu/client.js');

test('client: presets and flow resolution', () => {
	assert.deepEqual(Object.keys(c.PRESETS), ['A', 'B', 'C', 'HWP', 'HWP_TEXT']);
	assert.equal(c.resolveFlow('C'), c.PRESETS.C);
	assert.deepEqual(c.resolveFlow('{"schema":"ttdu.flow/v1","steps":[]}'), { schema: 'ttdu.flow/v1', steps: [] });
	assert.throws(() => c.resolveFlow(42), /preset id/);
});

test('client: target checks', () => {
	assert.equal(c.baseUrlOf({ target: 'local' }), 'http://127.0.0.1:8790');
	assert.equal(c.baseUrlOf({ target: 'hub', baseUrl: 'https://toolsthatdontupload.com/' }), 'https://toolsthatdontupload.com');
	assert.throws(() => c.buildRunRequest({ target: 'local', baseUrl: 'https://example.com', apiKey: 'k' }, 'C', [{ name: 'a.pdf', data: Buffer.from('%PDF') }]), /must be this PC/);
	assert.throws(() => c.buildRunRequest({ target: 'local', apiKey: '' }, 'C', [{ name: 'a.pdf', data: Buffer.from('%PDF') }]), /API key missing/);
	assert.throws(() => c.buildRunRequest({ target: 'hub', apiKey: 'k' }, 'C', [{ name: 'a.pdf', data: Buffer.from('%PDF') }], {}, { deliver: [] }), /office PC runner/);
	assert.throws(() => c.buildRunRequest({ target: 'local', apiKey: 'k' }, 'C', []), /no files/);
});

test('client: multipart body', () => {
	const r = c.buildRunRequest({ target: 'local', apiKey: 'k' }, 'C', [{ data: Buffer.from('%PDF-1.7 x') }, { name: '가.pdf', data: Buffer.from('%PDF') }], { client: 'x' }, undefined, 'BND');
	assert.equal(r.url, 'http://127.0.0.1:8790/v1/flows/run');
	assert.equal(r.contentType, 'multipart/form-data; boundary=BND');
	const s = r.body.toString('utf8');
	assert.match(s, /name="flow"\r\n\r\n\{/);
	assert.match(s, /name="vars"\r\n\r\n\{"client":"x"\}/);
	assert.match(s, /name="files"; filename="file1.pdf"/);
	assert.match(s, /filename\*=UTF-8''%EA%B0%80\.pdf/);
	assert.ok(s.endsWith('--BND--\r\n'));
});

test('client: response parsing keeps the old error text', () => {
	const ok = c.parseRunResponse(200, Buffer.from(JSON.stringify({ ok: true, notes: ['n'], outputs: [{ name: 'a.pdf', mime: 'application/pdf', size: 3, sha256: 'h', base64: Buffer.from('abc').toString('base64') }] })));
	assert.equal(ok.outputs[0].data.toString(), 'abc');
	assert.deepEqual(ok.notes, ['n']);
	assert.throws(() => c.parseRunResponse(422, Buffer.from('{"ok":false,"error":"unsupported"}')), /TTDU run failed \(HTTP 422\): \{"ok":false/);
	assert.throws(() => c.parseRunResponse(200, 'not json'), /HTTP 200/);
	assert.equal(c.sniffExt(Buffer.from([0xff, 0xd8, 0xff, 0])), 'jpg');
});