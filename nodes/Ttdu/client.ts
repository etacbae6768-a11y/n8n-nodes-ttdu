// MIT License (c) 2026 Park Jihoon (Tools That Don't Upload).
// TTDU connection spec v1. One request shape for both targets:
//   local = the office PC runner `ttdu serve` (http://127.0.0.1:8790). Files go only to this PC's runner, which runs
//           offline (outbound network blocked) - nothing leaves the PC.
//   hub   = the TTDU hub API (https://toolsthatdontupload.com). Files ARE sent to the hub for the run (15 MB limit).
// POST {base}/v1/flows/run  multipart: flow (JSON ttdu.flow/v1), vars (JSON), files (repeated)
//   header X-API-Key (added by the credential's authenticate)
//   -> { ok, steps, notes, outputs: [{ name, mime, size, sha256, base64 }] }
// Pure helpers only; the node sends the request with this.helpers.httpRequestWithAuthentication.
import { PRESETS } from './presets';

export { PRESETS };
export const DEFAULT_URL: Record<string, string> = { local: 'http://127.0.0.1:8790', hub: 'https://toolsthatdontupload.com' };
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', 'host.docker.internal']);

export interface TtduAuth {
	target: string;
	baseUrl?: string;
	apiKey: string;
}
export interface TtduFile {
	name: string;
	data: Buffer;
}
export interface TtduOutput {
	name: string;
	mime?: string;
	size: number;
	sha256: string;
	data: Buffer;
}
export interface TtduResult {
	ok: boolean;
	steps: unknown[];
	notes: unknown[];
	deliveries: unknown[];
	outputs: TtduOutput[];
}

export function baseUrlOf(auth: Partial<TtduAuth> | undefined): string {
	const target = auth && auth.target === 'hub' ? 'hub' : 'local';
	const u = (auth && auth.baseUrl && String(auth.baseUrl).trim()) || DEFAULT_URL[target];
	return u.replace(/\/+$/, '');
}

export function isLocalUrl(url: string): boolean {
	try {
		return LOCAL_HOSTS.has(new URL(url).hostname);
	} catch {
		return false;
	}
}

/** name/extension guess from the first bytes, for files that arrive without a usable name */
export function sniffExt(b: Buffer): string {
	const head = (n: number) => b.subarray(0, n).toString('latin1');
	if (head(4) === '%PDF') return 'pdf';
	if (head(4) === '\x89PNG') return 'png';
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
	if (head(4) === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
	if (b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return /W\0o\0r\0k\0b\0o\0o\0k/.test(head(65536)) ? 'xls' : 'hwp';
	if (b[0] === 0x50 && b[1] === 0x4b) {
		const h = head(65536);
		return h.includes('xl/') ? 'xlsx' : h.includes('word/') ? 'docx' : h.includes('Contents/') || h.includes('hwp') ? 'hwpx' : 'zip';
	}
	return 'bin';
}

type FileObject = { name?: string; filename?: string; fileName?: string; data?: unknown; buffer?: unknown };
export type FileLike = FileObject | Buffer | Uint8Array | string;

/** files: [{ name?, data: Buffer|Uint8Array|base64 string }] */
export function normFiles(files: FileLike[] | FileLike): TtduFile[] {
	const out: TtduFile[] = [];
	(Array.isArray(files) ? files : [files]).forEach((f, i) => {
		if (!f) return;
		const o = (typeof f === 'object' && !(f instanceof Uint8Array) ? f : {}) as FileObject;
		let data: unknown = o.data !== undefined ? o.data : o.buffer !== undefined ? o.buffer : f;
		if (typeof data === 'string') data = Buffer.from(data, 'base64');
		if (!(data instanceof Uint8Array)) return;
		const buf = Buffer.from(data);
		let name = String(o.name || o.filename || o.fileName || '').trim();
		if (!/\.[A-Za-z0-9]{2,5}$/.test(name)) name = (name || 'file' + (i + 1)) + '.' + sniffExt(buf);
		out.push({ name: name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_'), data: buf });
	});
	if (!out.length) throw new Error('TTDU: no files given');
	return out;
}

export function resolveFlow(flow: unknown): unknown {
	if (typeof flow === 'string' && PRESETS[flow]) return PRESETS[flow];
	if (typeof flow === 'string') return JSON.parse(flow);
	if (flow && typeof flow === 'object') return flow;
	throw new Error('TTDU: flow must be a preset id (' + Object.keys(PRESETS).join(', ') + ') or ttdu.flow/v1 JSON');
}

/** Checks the target and builds the multipart request for POST /v1/flows/run. */
export function buildRunRequest(
	auth: TtduAuth,
	flow: unknown,
	files: FileLike[],
	vars: Record<string, string> | undefined,
	opts?: { deliver?: unknown },
	boundary = '----ttdu' + Date.now().toString(16) + Math.random().toString(16).slice(2),
): { url: string; body: Buffer; contentType: string } {
	const url = baseUrlOf(auth) + '/v1/flows/run';
	if ((!auth || auth.target !== 'hub') && !isLocalUrl(url)) {
		throw new Error('TTDU: local target must be this PC (127.0.0.1, localhost, host.docker.internal): ' + url);
	}
	if (!auth || !String(auth.apiKey || '').trim()) throw new Error('TTDU: API key missing');
	const parts: Buffer[] = [];
	const field = (name: string, value: string) =>
		parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"\r\n\r\n' + value + '\r\n', 'utf8'));
	field('flow', JSON.stringify(resolveFlow(flow)));
	field('vars', JSON.stringify(vars || {}));
	if (opts && opts.deliver != null) {
		if (auth.target === 'hub') throw new Error('TTDU: deliver (keep results in office systems) works only with the office PC runner');
		field('deliver', JSON.stringify(opts.deliver));
	}
	for (const f of normFiles(files)) {
		const head =
			'--' +
			boundary +
			'\r\nContent-Disposition: form-data; name="files"; filename="' +
			f.name.replace(/"/g, '_') +
			"\"; filename*=UTF-8''" +
			encodeURIComponent(f.name) +
			'\r\nContent-Type: application/octet-stream\r\n\r\n';
		parts.push(Buffer.from(head, 'utf8'), f.data, Buffer.from('\r\n', 'utf8'));
	}
	parts.push(Buffer.from('--' + boundary + '--\r\n', 'utf8'));
	return { url, body: Buffer.concat(parts), contentType: 'multipart/form-data; boundary=' + boundary };
}

type RawResult = {
	ok?: unknown;
	steps?: unknown[];
	notes?: unknown[];
	deliveries?: unknown[];
	outputs?: Array<{ name: string; mime?: string; size: number; sha256: string; base64: string }>;
};

/** Turns the HTTP response into a result, or throws the same error text as earlier versions. */
export function parseRunResponse(status: number, body: unknown): TtduResult {
	let text: string;
	let r: RawResult | null = null;
	if (body instanceof ArrayBuffer) text = Buffer.from(new Uint8Array(body)).toString('utf8');
	else if (body instanceof Uint8Array) text = Buffer.from(body).toString('utf8');
	else if (typeof body === 'string') text = body;
	else {
		text = JSON.stringify(body ?? '');
		r = body && typeof body === 'object' ? (body as RawResult) : null;
	}
	if (!r) {
		try {
			r = JSON.parse(text) as RawResult;
		} catch {
			r = null;
		}
	}
	if (status < 200 || status > 299 || !r || r.ok !== true || !Array.isArray(r.outputs)) {
		const e = new Error('TTDU run failed (HTTP ' + status + '): ' + text.slice(0, 500)) as Error & { status?: number; body?: unknown };
		e.status = status;
		e.body = r || text;
		throw e;
	}
	return {
		ok: true,
		steps: r.steps || [],
		notes: r.notes || [],
		deliveries: r.deliveries || [],
		outputs: r.outputs.map((o) => ({ name: o.name, mime: o.mime, size: o.size, sha256: o.sha256, data: Buffer.from(o.base64, 'base64') })),
	};
}
