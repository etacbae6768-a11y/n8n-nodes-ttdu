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
