// MIT License (c) 2026 Park Jihoon (Tools That Don't Upload). Our own code; n8n-workflow is the host runtime (types and error classes only).
import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { MAX_INPUT_BYTES, MAX_INPUTS, baseName, fileNameFromUrl, hostAllowed, isAbsolutePath, isInsideFolder, normalizePath, parseList } from './inputs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../lib/ttdu-client.cjs') as {
	runFlow: (
		auth: { target: string; baseUrl?: string; apiKey: string },
		flow: unknown,
		files: Array<{ name: string; data: Buffer }>,
		vars: Record<string, string>,
		opts?: { deliver?: unknown },
	) => Promise<{
		ok: boolean;
		notes: unknown[];
		deliveries?: unknown[];
		outputs: Array<{ name: string; mime?: string; size: number; sha256: string; data: Buffer }>;
	}>;
};

export class Ttdu implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TTDU',
		name: 'ttdu',
		icon: { light: 'file:ttdu.svg', dark: 'file:ttdu.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{"flow " + $parameter["flow"]}}',
		description: 'Run a TTDU document flow on files (binary data, file paths in allowed folders, or allowed URLs) with this PC runner or the TTDU hub',
		defaults: { name: 'TTDU' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'ttduApi', required: true }],
		properties: [
			{
				displayName: 'Flow',
				name: 'flow',
				type: 'options',
				default: 'C',
				options: [
					{ name: 'A. Receipt Photos → One PDF', value: 'A', description: 'Named {client}_{date}.pdf, at most 1 MB' },
					{ name: 'B. Payroll Check (Korea)', value: 'B', description: 'Recalculates the 4 social insurances and income tax' },
					{ name: 'C. Redact Personal Data', value: 'C', description: 'Resident registration, phone and account numbers' },
					{ name: 'Custom Flow JSON', value: 'custom' },
					{ name: 'HWP/HWPX → PDF', value: 'HWP' },
					{ name: 'HWP/HWPX → Text', value: 'HWP_TEXT' },
				],
			},
			{
				displayName: 'Flow JSON',
				name: 'flowJson',
				type: 'json',
				default: '{}',
				displayOptions: { show: { flow: ['custom'] } },
				description: 'A ttdu.flow/v1 JSON exported from the TTDU workflows page',
			},
			{
				displayName: 'Input Files',
				name: 'source',
				type: 'options',
				default: 'binary',
				description: 'Where the files come from. Use File Paths or URLs when an AI agent calls this node as a tool (agents do not pass binary data to tools).',
				options: [
					{ name: 'Binary Data of the Input Item', value: 'binary' },
					{ name: 'File Paths (Allowed Folders Only)', value: 'paths', description: 'Absolute paths on the n8n machine, inside the folders allowed in the credential' },
					{ name: 'URLs (Allowed Hosts Only)', value: 'urls', description: 'Downloaded only when the credential allows URLs and lists the host' },
				],
			},
			{
				displayName: 'Binary Properties',
				name: 'binaryProperties',
				type: 'string',
				default: '',
				placeholder: 'data, attachment_0',
				displayOptions: { show: { source: ['binary'] } },
				description: 'Comma-separated binary property names to send. Empty sends all binary properties of the item.',
			},
			{
				displayName: 'File Paths',
				name: 'paths',
				type: 'string',
				default: '',
				placeholder: '/files/in/client-form.pdf',
				displayOptions: { show: { source: ['paths'] } },
				description: 'Absolute paths of the files to process, comma-separated or one per line. Each must be inside a folder allowed in the TTDU credential.',
			},
			{
				displayName: 'URLs',
				name: 'urls',
				type: 'string',
				default: '',
				placeholder: 'https://files.example.com/form.pdf',
				displayOptions: { show: { source: ['urls'] } },
				description: 'HTTP(S) addresses of the files, comma-separated or one per line. Each host must be allowed in the TTDU credential; redirects are not followed.',
			},
			{
				displayName: 'Client',
				name: 'client',
				type: 'string',
				default: '',
				description: 'Flow variable "client", used by flows A and B for the result name',
			},
			{
				displayName: 'Date',
				name: 'date',
				type: 'string',
				default: '',
				placeholder: '20261106',
				description: 'Flow variable "date" (YYYYMMDD)',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Combine All Items Into One Run',
						name: 'combineItems',
						type: 'boolean',
						default: false,
						description: 'Whether to send the files of all input items in one run (for example one PDF from many items)',
					},
					{
						displayName: 'Keep Results in Office Systems (JSON)',
						name: 'deliver',
						type: 'json',
						default: '[]',
						description: 'This PC target only. Rules for office systems set up in the connectors file of the office PC runner, for example [{"to":"paperless","only":"pdf"}]. Receipts are returned in deliveries.',
					},
					{
						displayName: 'Extra Variables (JSON)',
						name: 'vars',
						type: 'json',
						default: '{}',
					},
					{
						displayName: 'Output Binary Prefix',
						name: 'prefix',
						type: 'string',
						default: 'file',
						description: 'Result files are put in prefix0, prefix1 and so on',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const cred = await this.getCredentials('ttduApi');
		const auth = { target: String(cred.target || 'local'), baseUrl: String(cred.baseUrl || ''), apiKey: String(cred.apiKey || '') };
		const out: INodeExecutionData[] = [];

		const allowedFolders = parseList(cred.allowedFolders).filter((f) => normalizePath(f) !== null);
		const allowUrls = cred.allowUrls === true;
		const allowedHosts = parseList(cred.allowedHosts);
		const fail = (i: number, message: string, description?: string) => new NodeOperationError(this.getNode(), message, { itemIndex: i, description });

		const readPath = async (i: number, p: string): Promise<{ name: string; data: Buffer }> => {
			if (!allowedFolders.length) throw fail(i, 'File paths are off', 'Add the folders this node may read under "Allowed Folders for File Paths" in the TTDU credential.');
			if (!isAbsolutePath(p) || normalizePath(p) === null) throw fail(i, 'Not an absolute path without "..": ' + p);
			if (!allowedFolders.some((f) => isInsideFolder(f, p))) throw fail(i, 'Path is outside the allowed folders: ' + p);
			// check again after n8n resolves the path (symbolic links), and respect n8n's own file access settings
			const resolved = await this.helpers.resolvePath(p);
			if (!allowedFolders.some((f) => isInsideFolder(f, String(resolved)))) throw fail(i, 'Path leads outside the allowed folders: ' + p);
			if (this.helpers.isFilePathBlocked(resolved)) throw fail(i, 'n8n blocks access to this path: ' + p);
			const stream = await this.helpers.createReadStream(resolved);
			const chunks: Buffer[] = [];
			let size = 0;
			for await (const chunk of stream) {
				const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
				size += b.length;
				if (size > MAX_INPUT_BYTES) {
					stream.destroy();
					throw fail(i, 'File is larger than 100 MB: ' + p);
				}
				chunks.push(b);
			}
			return { name: baseName(p), data: Buffer.concat(chunks) };
		};

		const readUrl = async (i: number, s: string, k: number): Promise<{ name: string; data: Buffer }> => {
			if (!allowUrls) throw fail(i, 'URL downloads are off', 'Turn on "Allow URL Downloads" and list the hosts in the TTDU credential.');
			let u: URL;
			try {
				u = new URL(s);
			} catch (error) {
				throw fail(i, 'Not a URL: ' + s, (error as Error).message);
			}
			if (u.protocol !== 'https:' && u.protocol !== 'http:') throw fail(i, 'Only http and https URLs are allowed: ' + s);
			if (u.username || u.password) throw fail(i, 'URLs with a user name or password are not allowed');
			if (!hostAllowed(u.hostname, allowedHosts)) throw fail(i, 'Host is not in the allowed URL hosts: ' + u.hostname);
			let res: { body: ArrayBuffer | Buffer; statusCode?: number };
			try {
				res = (await this.helpers.httpRequest({
					method: 'GET',
					url: u.toString(),
					encoding: 'arraybuffer',
					disableFollowRedirect: true,
					returnFullResponse: true,
					timeout: 60000,
				})) as { body: ArrayBuffer | Buffer; statusCode?: number };
			} catch (error) {
				throw fail(i, 'Download failed (redirects are not followed): ' + s, (error as Error).message);
			}
			const status = Number(res.statusCode || 0);
			if (status < 200 || status > 299) throw fail(i, 'Download failed with HTTP ' + status + ' (redirects are not followed): ' + s);
			const data = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
			if (data.length > MAX_INPUT_BYTES) throw fail(i, 'Download is larger than 100 MB: ' + s);
			return { name: fileNameFromUrl(u, k), data };
		};

		const filesOf = async (i: number) => {
			const source = this.getNodeParameter('source', i, 'binary') as string;
			if (source === 'paths' || source === 'urls') {
				const list = parseList(this.getNodeParameter(source, i, ''));
				if (list.length > MAX_INPUTS) throw fail(i, 'At most ' + MAX_INPUTS + ' files per run');
				const got: Array<{ name: string; data: Buffer }> = [];
				for (const [k, s] of list.entries()) got.push(source === 'paths' ? await readPath(i, s) : await readUrl(i, s, k));
				return got;
			}
			const item = items[i];
			const want = String(this.getNodeParameter('binaryProperties', i, '') || '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			const keys = want.length ? want : Object.keys(item.binary || {});
			const files: Array<{ name: string; data: Buffer }> = [];
			for (const k of keys) {
				const meta = item.binary?.[k];
				if (!meta) continue;
				files.push({ name: meta.fileName || k, data: await this.helpers.getBinaryDataBuffer(i, k) });
			}
			return files;
		};

		const run = async (i: number, files: Array<{ name: string; data: Buffer }>): Promise<INodeExecutionData> => {
			if (!files.length) {
				const source = this.getNodeParameter('source', i, 'binary') as string;
				throw new NodeOperationError(this.getNode(), source === 'binary' ? 'No binary files to send' : 'No files given', {
					itemIndex: i,
					description: source === 'binary' ? 'When an AI agent uses this node as a tool, set Input Files to File Paths or URLs.' : undefined,
				});
			}
			const flowSel = this.getNodeParameter('flow', i) as string;
			let flow: unknown = flowSel;
			const opts = this.getNodeParameter('options', i, {}) as IDataObject;
			let vars: Record<string, string> = {};
			let deliver: unknown[] | undefined;
			try {
				if (flowSel === 'custom') {
					const j = this.getNodeParameter('flowJson', i);
					flow = typeof j === 'string' ? JSON.parse(j) : j;
				}
				if (opts.vars) vars = (typeof opts.vars === 'string' ? JSON.parse(opts.vars) : opts.vars) as Record<string, string>;
				if (opts.deliver) {
					const d = typeof opts.deliver === 'string' ? JSON.parse(opts.deliver) : opts.deliver;
					if (Array.isArray(d) && d.length) deliver = d;
				}
			} catch (e) {
				throw new NodeOperationError(this.getNode(), 'Invalid JSON: ' + (e as Error).message, { itemIndex: i });
			}
			const clientName = this.getNodeParameter('client', i, '') as string;
			const date = this.getNodeParameter('date', i, '') as string;
			if (clientName) vars.client = clientName;
			if (date) vars.date = date;
			let r;
			try {
				r = await client.runFlow(auth, flow, files, vars, deliver ? { deliver } : undefined);
			} catch (e) {
				throw new NodeOperationError(this.getNode(), (e as Error).message, { itemIndex: i });
			}
			const prefix = (opts.prefix as string) || 'file';
			const binary: INodeExecutionData['binary'] = {};
			for (const [k, f] of r.outputs.entries()) binary[prefix + k] = await this.helpers.prepareBinaryData(f.data, f.name, f.mime);
			return {
				json: {
					ok: r.ok,
					count: r.outputs.length,
					target: auth.target,
					inputs: files.map((f) => f.name),
					notes: r.notes as IDataObject[],
					deliveries: (r.deliveries || []) as IDataObject[],
					files: r.outputs.map((f, k) => ({ name: f.name, mime: f.mime, size: f.size, sha256: f.sha256, binaryProperty: prefix + k })),
				},
				binary,
				pairedItem: { item: i },
			};
		};

		const combine = items.length > 0 && (this.getNodeParameter('options', 0, {}) as IDataObject).combineItems === true;
		if (combine) {
			let all: Array<{ name: string; data: Buffer }> = [];
			for (let i = 0; i < items.length; i++) all = all.concat(await filesOf(i));
			try {
				out.push(await run(0, all));
			} catch (e) {
				if (this.continueOnFail()) out.push({ json: { ok: false, error: (e as Error).message }, pairedItem: { item: 0 } });
				else throw new NodeOperationError(this.getNode(), e as Error);
			}
			return [out];
		}
		for (let i = 0; i < items.length; i++) {
			try {
				out.push(await run(i, await filesOf(i)));
			} catch (e) {
				if (this.continueOnFail()) {
					out.push({ json: { ok: false, error: (e as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), e as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}
