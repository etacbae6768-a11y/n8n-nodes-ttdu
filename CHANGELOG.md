# Changelog

## 0.3.4
- Requests now go through n8n's own request helper (`httpRequestWithAuthentication`), so n8n proxy settings apply and the `X-API-Key` header comes from the credential. The client code moved from a hand-written CommonJS file into the TypeScript sources (`nodes/Ttdu/client.ts`, `presets.ts`); same endpoint, body, outputs and error messages.
- **Client** and **Date** are shown only for flows A and B, which use them.
- The credential's documentation link points at this repository.
- README: the node is meant for self-hosted n8n on the PC that runs the TTDU runner; on n8n Cloud only the hub's server-side tools work.

## 0.3.3
- Moved to a dedicated repository (github.com/etacbae6768-a11y/n8n-nodes-ttdu) for n8n verification; no functional changes. Published from this repository with GitHub Actions and an npm provenance statement.

## 0.3.2
- New **Input Files** setting: binary data of the item (as before, default), **file paths** or **URLs**, so the node works as an AI Agent tool (agents do not pass binary data to tools).
- File paths are read only inside the folders allowed in the credential (relative paths and `..` refused, checked again after n8n resolves the path, n8n's own file access settings respected). Empty list = off.
- URL downloads are off by default; when turned on in the credential, only listed hosts, http/https, no credentials in the URL, redirects not followed.
- 50 files per run, 100 MB per file. Output json lists the input names (`inputs`).
- Checked: `@n8n/scan-community-package` rules (package and source, 0 errors), unit tests for the path/host checks, and 11 end-to-end cases in n8n 2.46.7 (binary as before, allowed path, outside path, `..`, paths off, URLs off, allowed URL, redirect refused, host refused, AI Agent with a local model calling the node as a tool, agent asking for a path outside the allowed folders).
## 0.3.1
- No code changes. First release published from GitHub Actions (`.github/workflows/publish-npm.yml`, npm trusted publishing) with an npm provenance statement, so the package can be checked against this repository and commit.
- README: install, credential and "where do my files go" sections unchanged; added a link to this changelog.

## 0.3.0
- Option to deliver result files to an office system configured on the local runner (`deliver`).

## 0.2.0
- Rewritten in TypeScript; passes `@n8n/scan-community-package`. Light and dark icons, NodeOperationError, pairedItem on failure.

## 0.1.0
- First release: TTDU node and TTDU API credential (This PC runner or hub).
