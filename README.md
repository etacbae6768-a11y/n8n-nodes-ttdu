# n8n-nodes-ttdu

n8n community node that runs TTDU document flows (receipt photos → PDF, payroll check, personal-data redaction, HWP → PDF) on **this PC's offline runner** or the TTDU hub API.

- Credential **TTDU API**: target (This PC / Hub), URL, API key (tested with `/v1/health`), and what the node may read besides binary data: **allowed folders** for file paths (empty = off) and **URL downloads** (off by default, allowed hosts only).
- Node **TTDU**: flow, input files (binary data of the item, file paths, or URLs), client/date vars, options (combine all items into one run, output prefix, extra vars).
- Output item: `json = {ok, count, target, inputs, notes, files:[{name, mime, size, sha256, binaryProperty}]}`, binary `file0`, `file1`, … (prefix configurable).

Install: Settings → Community Nodes → Install → `n8n-nodes-ttdu`. No runtime dependencies. Tested on n8n 2.46.7 (Docker).

Examples: 01–04 webhook → TTDU (A/B/C/HWP) → respond with the result files; 05 Gmail attachment → redact → reply (needs your Gmail credential); 06 local folder → HWP → PDF.

n8n itself is under the Sustainable Use License: install and run n8n yourself for your own business. This node is separate MIT code and does not include n8n.

## Where do my files go?

| Target | URL | Files |
|---|---|---|
| **This PC** (`local`) | `http://127.0.0.1:8790` (the TTDU office runner, `ttdu serve`) | Sent only to the runner on the same PC. The runner works with outbound network blocked, so **files never leave the PC**. |
| **Hub** (`hub`) | `https://toolsthatdontupload.com` | **Files are uploaded to the TTDU hub** for the run (15 MB per request). Only server-capable tools run there (e.g. `pdf.merge`); the office flows A/B/C/HWP answer `422 unsupported` on the hub - run them on This PC. |

If the automation tool runs in Docker Desktop, use `http://host.docker.internal:8790` and start the runner with `--allow-docker` (the "local API, allow Docker" launcher in the office package). The runner still listens on 127.0.0.1 only and still needs the API key (`local-api-key.txt`).

## Use it as an AI Agent tool

n8n does not pass binary data to tools, so for an AI Agent set **Input Files** to **File Paths** (or URLs) and let the model fill the field, for example `{{ $fromAI('paths', 'Absolute paths of the documents, comma-separated', 'string') }}`.

The limits are set in the **credential**, not in the node, so the agent cannot widen them:

- **Allowed Folders for File Paths**: absolute folders (one per line or comma-separated). A path is read only when it is inside one of them; relative paths and `..` are refused, the path is checked again after n8n resolves it (symbolic links), and n8n's own file access settings (`N8N_RESTRICT_FILE_ACCESS_TO`, blocked n8n folders) still apply. Empty = file paths off.
- **Allow URL Downloads**: off by default. When on, only hosts in **Allowed URL Hosts** (`files.example.com`, `*.example.org` for subdomains) are downloaded, over http/https, without user names or passwords in the URL, and redirects are not followed.
- At most 50 files per run and 100 MB per file.

Example (tested on n8n 2.46.7 with a local Ollama model): Manual trigger → AI Agent ← Ollama Chat Model, tool **TTDU** with Input Files = File Paths, flow C. The prompt "Hide the personal data in /files/in/client-form.pdf" runs flow C on that file; a path outside the allowed folders is refused with "Path is outside the allowed folders".
## Ready flows

| id | What it does | Input | Output |
|---|---|---|---|
| `A` | Receipt photos → one PDF, named `{client}_{date}.pdf`, ≤ 1 MB | images | 1 PDF |
| `B` | Payroll check (4 insurances, income tax recalculated); period read from the file name `YYYY-MM_…xlsx` | 1 xlsx | `{client}_<payroll check>_{date}.xlsx` (Korean file name) |
| `C` | Redact resident registration numbers, phone numbers, account numbers | PDF / images | `*-redacted-clean.*` |
| `HWP` / `HWP_TEXT` | HWP/HWPX → PDF / text | hwp, hwpx | PDF / txt |
| custom | any `ttdu.flow/v1` JSON exported from https://workflows.toolsthatdontupload.com | | |

API: `POST /v1/flows/run` (multipart `flow`, `vars`, `files`; header `X-API-Key`) → `{ok, steps, notes, outputs:[{name, mime, size, sha256, base64}]}`.
Changes: [CHANGELOG.md](./CHANGELOG.md). Releases are published from GitHub Actions with npm provenance.

## License

MIT © 2026 Park Jihoon (Tools That Don't Upload). This package contains only our code. It does not include or modify the host platform's code.
