// MIT License (c) 2026 Park Jihoon (Tools That Don't Upload). Our own code; n8n-workflow is used for types only.
import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

export class TtduApi implements ICredentialType {
	name = 'ttduApi';

	displayName = 'TTDU API';

	icon: Icon = { light: 'file:ttdu.svg', dark: 'file:ttdu.dark.svg' };

	documentationUrl = 'https://github.com/etacbae6768-a11y/ttdu-integrations/tree/main/n8n-nodes-ttdu#readme';

	properties: INodeProperties[] = [
		{
			displayName: 'Target',
			name: 'target',
			type: 'options',
			default: 'local',
			options: [
				{ name: 'This PC (Files Stay on the PC)', value: 'local' },
				{ name: 'TTDU Hub API (Files Are Sent to the Hub)', value: 'hub' },
			],
		},
		{
			displayName: 'URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://127.0.0.1:8790',
			description:
				'This PC: http://127.0.0.1:8790 (n8n in Docker Desktop: http://host.docker.internal:8790, runner started with --allow-docker). Hub: https://toolsthatdontupload.com.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'This PC: contents of local-api-key.txt. Hub: your hub API key.',
		},
		{
			displayName: 'Allowed Folders for File Paths',
			name: 'allowedFolders',
			type: 'string',
			typeOptions: { rows: 2 },
			default: '',
			placeholder: '/files/in',
			description:
				'Folders on the n8n machine the TTDU node may read when its input is "File Paths" (one per line or comma-separated, absolute paths). Empty turns file paths off. Set here, not in the node, so an AI agent cannot widen it.',
		},
		{
			displayName: 'Allow URL Downloads',
			name: 'allowUrls',
			type: 'boolean',
			default: false,
			description: 'Whether the TTDU node may download input files from URLs (off by default)',
		},
		{
			displayName: 'Allowed URL Hosts',
			name: 'allowedHosts',
			type: 'string',
			default: '',
			placeholder: 'files.example.com, *.example.org',
			displayOptions: { show: { allowUrls: [true] } },
			description: 'Only these hosts are downloaded from (comma-separated; *.example.org allows its subdomains). Empty allows none.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { 'X-API-Key': '={{$credentials.apiKey}}' } },
	};

	test: ICredentialTestRequest = {
		request: { baseURL: '={{$credentials.baseUrl}}', url: '/v1/health' },
	};
}
