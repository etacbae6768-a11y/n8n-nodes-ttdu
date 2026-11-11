// build: tsc, then copy icons, codex json and the shared client into dist/. MIT (c) 2026 Park Jihoon (Tools That Don't Upload).
const { execFileSync } = require('child_process'); const fs = require('fs'); const path = require('path');
fs.rmSync('dist', { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], { stdio: 'inherit' });
for (const f of ['nodes/Ttdu/ttdu.svg', 'nodes/Ttdu/ttdu.dark.svg', 'credentials/ttdu.svg', 'credentials/ttdu.dark.svg', 'nodes/Ttdu/Ttdu.node.json', 'lib/ttdu-client.cjs', 'lib/presets.json']) { fs.mkdirSync(path.dirname('dist/' + f), { recursive: true }); fs.copyFileSync(f, 'dist/' + f); }
console.log('built', fs.readdirSync('dist', { recursive: true }).filter((f) => /\.(js|json|svg|cjs)$/.test(f)).join(', '));
