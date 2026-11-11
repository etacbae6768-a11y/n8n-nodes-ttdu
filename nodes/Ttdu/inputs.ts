// MIT License (c) 2026 Park Jihoon (Tools That Don't Upload). Pure checks for the "File Paths" and "URLs" inputs (no I/O here).

export const MAX_INPUT_BYTES = 100 * 1024 * 1024;
export const MAX_INPUTS = 50;

/** Splits a list typed by a person or an AI agent: newlines, commas or semicolons; trims; drops empties and duplicates. */
export function parseList(value: unknown): string[] {
	const raw = Array.isArray(value) ? value.map(String) : String(value ?? '').split(/[\r\n,;]+/);
	const seen = new Set<string>();
	const out: string[] = [];
	for (const s of raw) {
		const t = s.trim().replace(/^["']|["']$/g, '').trim();
		if (t && !seen.has(t)) {
			seen.add(t);
			out.push(t);
		}
	}
	return out;
}

const isWindowsPath = (p: string) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');

/** Absolute path check without the path module (POSIX "/x", Windows "C:\x" or "\\server\share"). */
export function isAbsolutePath(p: string): boolean {
	return p.startsWith('/') || isWindowsPath(p);
}

/**
 * Normalises an absolute path for comparison: forward slashes, no repeated or trailing slash, "." removed,
 * ".." refused (returns null), lower case on Windows paths.
 */
export function normalizePath(p: string): string | null {
	if (!isAbsolutePath(p) || p.includes('\0')) return null;
	const win = isWindowsPath(p);
	const unc = p.startsWith('\\\\');
	const parts = p.replace(/\\/g, '/').split('/');
	const kept: string[] = [];
	for (const part of parts) {
		if (part === '' || part === '.') continue;
		if (part === '..') return null;
		kept.push(part);
	}
	let s = (unc ? '//' : win ? '' : '/') + kept.join('/');
	if (win) s = s.toLowerCase();
	return s || '/';
}

/** True when file is the folder itself or inside it (both absolute; compared after normalisation). */
export function isInsideFolder(folder: string, file: string): boolean {
	const f = normalizePath(folder);
	const p = normalizePath(file);
	if (!f || !p) return false;
	if (f === '/') return p.startsWith('/');
	return p === f || p.startsWith(f.endsWith('/') ? f : f + '/');
}

/** Host allow list: exact host names, or "*.example.org" for its subdomains (not example.org itself). */
export function hostAllowed(host: string, allowed: string[]): boolean {
	const h = host.toLowerCase().replace(/\.$/, '');
	if (!h) return false;
	return allowed.some((a) => {
		const x = a.toLowerCase().trim().replace(/\.$/, '');
		if (!x) return false;
		if (x.startsWith('*.')) return h.endsWith(x.slice(1)) && h.length > x.length - 1;
		return h === x;
	});
}

/** decodeURIComponent that never throws: malformed escapes keep their text with '%' replaced by '_'. */
export function safeDecode(s: string): string {
	try {
		return decodeURIComponent(s);
	} catch (error) {
		return error instanceof URIError ? s.replace(/%/g, '_') : s;
	}
}

/** File name for a downloaded URL: last path segment, decoded, unsafe characters replaced. */
export function fileNameFromUrl(u: URL, index: number): string {
	let seg = u.pathname.split('/').filter(Boolean).pop() || '';
	seg = safeDecode(seg);
	seg = seg.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120);
	return seg || 'download-' + (index + 1);
}

/** File name of an absolute path (either slash). */
export function baseName(p: string): string {
	return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'file';
}
