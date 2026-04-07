# Friday Gateway

---

## Table of contents

1. Overview
2. Features
3. Prerequisites
4. Quick start (local)
5. Environment variables (.env)
6. Azure / Teams registration & manifest
7. Run locally with ngrok (dev loop)
8. Commands & Usage
9. Attachments, Files & Exports
10. Health, diagnostics & logging
11. Safety & security
12. Testing & Troubleshooting
13. Important: updating ngrok endpoint
14. Images / Screenshots (placeholders)

---

The Friday Gateway is a bridge between a Microsoft Teams bot (“Friday”) and one or more Tool Gateways. It lets Friday discover and call **read-only tools** on multiple data sources, plan multi-step tool chains, stream responses into Teams, attach CSV/PNG files, and persist chat history and scratch state in Redis.

This guide contains both the reference documentation for the gateway and the step-by-step instructions to create, configure, and run a Teams bot using Azure and the Teams Developer Portal.

---

## 2. Features

- **Multi-source tool registry**
  - Namespaced tools using `source__tool`.
  - Read-only enforcement and optional allowlist for exceptional write tools.
  - Caching of tool metadata and results for performance.

- **Planner & tools orchestration**
  - Planner that composes multi-step tool call sequences across sources with sequencing and per-call timeouts.
  - Local tools for CSV export (`local__to_csv`) and charting (`local__chart`) available even when remote sources are down.
  - Tool call validation (name + arguments) before execution, with audit logging.

- **Streaming replies in Teams**
  - Friday sends a placeholder message and then **edits it in place** as tokens stream from the LLM.
  - Rate-limited Teams updates to avoid overloading the channel.

- **Attachments, file ingestion & exports**
  - Reads PDFs via `pypdf` and sends a sanitized text snippet into the LLM context (up to a fixed character limit).[web:358]
  - Reads text/code/data files (CSV, JSON, HTML, source code, etc.) as UTF‑8 and passes a snippet into context.
  - Acknowledges Office docs (DOC/DOCX/XLSX) without parsing; user can export as PDF/text for analysis.
  - Acknowledges images; content is not parsed but can be described by the user in text.
  - CSV export and charting tools produce small inline PNGs or upload larger ones as attachments.

- **Redis-backed conversation state**
  - Conversation history stored as a Redis LIST per `(user, conversation)`, with TTL, max turns, and trimming.
  - Per‑conversation scratch state stored as a Redis HASH (e.g., last materialized rows, agent mode).
  - `purge` removes both history and scratch state for the given Teams conversation.

- **Commands & administration**
  - Slash commands for managing data sources, listing tools, inspecting schemas, clearing history.
  - `/stop` command cancels the **current in‑flight response for that Teams conversation** only.
  - Single active turn per conversation: additional non-command messages while a response is in progress are rejected with a gentle reminder to wait or use `/stop`.

- **Health & metadata**
  - `/health` endpoint for readiness / liveness.
  - `/meta` endpoint exposing gateway metadata and high-level tool information.

- **Safety & content filtering**
  - Strong input validation and sanitization for user messages and tool calls.
  - Library-based profanity/toxicity detection (better‑profanity + alt‑profanity-check) with hard blocking and telemetry.[web:318][web:339]
  - Output safety filter on final LLM responses to prevent emitting unsafe content.

---

## 3. Prerequisites

- Access to the Microsoft Teams Developer Portal and permission to upload apps (or a dev tenant).
- Access to Azure Portal with rights to register applications and create client secrets.
- Project checked out: `teams_gateway` with dependencies (Uvicorn, FastAPI, Redis client, etc.).
- Ngrok (or another tunnel) installed for local testing / webhooks.
- Redis reachable from your runtime (local Redis or remote).
- Basic familiarity with editing `.env` files and JSON (`manifest.json`).

---

## 4. Quick start (local)

1. Create and populate a `.env` file (see **Environment variables**).
2. Install dependencies in a Python virtualenv:

python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

3. Run the FastAPI app with Uvicorn:

uvicorn teams_gateway.app:app
--host "${TEAMS_GATEWAY_HOST:-0.0.0.0}"
--port "${TEAMS_GATEWAY_PORT:-3978}"
--reload --reload-include=".env"

4. Ensure `REDIS_URL` is reachable. The app exposes:

- `POST /api/messages` — Bot Framework / Teams endpoint  
- `GET /health` — health check  
- `GET /meta` — service metadata

> Tip: If `--reload` does not pick up changes reliably, install `watchfiles` and/or set `WATCHFILES_FORCE_POLLING=1`.

---

## 5. Environment variables (.env)

Below is the canonical environment configuration.

========================
Bot Framework / Teams
========================
MICROSOFT_APP_ID="<<<YOUR_AZURE_BOT_APP_ID>>>" # aka BOT_ID
MICROSOFT_APP_PASSWORD="<<<YOUR_AZURE_BOT_APP_SECRET>>>" # aka BOT_SECRET

========================
LLM (LiteLLM proxy)
========================
LLM_BASE_URL="https://llm.techsophy.com"
LLM_API_KEY="<<<YOUR_LITELLM_API_KEY>>>"
LLM_MODEL="gpt-4o-mini"
LLM_PROVIDER="openai-compatible"
LLM_TIMEOUT_SECS=60
LLM_MAX_OUTPUT_TOKENS=2000
TARGET_LATENCY_MS=3500

========================
Tool Source routing
========================
SOURCES="snowflake=http://localhost:8081/sf;starrocks=http://localhost:8080/sr"
TOOLS_CACHE_SECS=60
READONLY_ALLOWLIST=""
RESULT_CACHE_SECS=30
RESULT_CACHE_MAX_BYTES=1000000

========================
Planner/runtime limits
========================
PLAN_MAX_STEPS=4
PLAN_MAX_CONCURRENCY=2
TOOL_TIMEOUT_SECS=30
RETRY_ON_TOOL_ERROR=1

========================
Redis / history
========================
REDIS_URL="redis://localhost:6379/0"
HISTORY_MAX_TURNS=30
HISTORY_MAX_TOKENS=8000
HISTORY_TTL_SECS=604800
SINGLE_USER_ID="default"

========================
Attachments / exports
========================
ATTACH_MAX_INLINE_BYTES=900000
CSV_ROW_LIMIT=50000
ATTACH_DATA_URLS=true

========================
HTTP server
========================
TEAMS_GATEWAY_HOST="0.0.0.0"
TEAMS_GATEWAY_PORT=3978

---

## 6. Azure registration & Teams Developer Portal

### Step A — Create bot in Teams Developer Portal

1. Open the Teams Developer Portal: <https://dev.teams.microsoft.com/tools/bots>.
2. Create a new bot. The portal registers an app in Azure and provides an Application (Client) ID.

### Step B — Locate app in Azure App registrations

1. In Azure Portal, go to **App registrations** and open the app created by the Developer Portal.
2. Copy the **Application (client) ID** — this is your `MICROSOFT_APP_ID` / `BOT_ID`.
3. Under **Certificates & secrets**, create a new **client secret** and copy its value — this is `MICROSOFT_APP_PASSWORD` / `BOT_SECRET`.

### Step C — Update `.env`

Place the copied values into your `.env` (see environment section). The client secret value is shown only once — store it securely.

### Step D — Update messaging endpoint (local ngrok)

When you have a public URL (ngrok or hosted URL), update the messaging endpoint to:

https://<public-host>/api/messages

Example: `https://abcd1234.ngrok.io/api/messages`

### Step E — Update Teams App manifest

Open the App Package Editor in the Teams Developer Portal and edit `manifest.json`:

- Add the public domain (ngrok or host) to `validDomains` (domain only, no protocol or path):

"validDomains": ["abcd1234.ngrok.io"]

- Ensure `supportsFiles` is set in the bot definition and scope is `personal` if you intend personal scope only.
- If required, populate `webApplicationInfo` with your App ID and resource for auth flows.

### Step F — Package & upload app

1. Download the app package (ZIP) from the Developer Portal.
2. In the Teams client: **Apps → Manage your apps → Upload an app → Upload a custom app** and select the ZIP.

Tenant admin approval may be required depending on org policies.

---

## 7. Run locally with Ngrok (development loop)

1. Start the gateway:

uvicorn teams_gateway.app:app --host 0.0.0.0 --port 3978 --reload --reload-include=".env"

2. Start ngrok in a separate terminal:

ngrok http 3978

3. Ngrok outputs a public HTTPS URL. Use this URL for the bot's messaging endpoint and add the domain to `validDomains` in the manifest.

4. If ngrok restarts and the URL changes, update the Bot Endpoint and `manifest.json` and re-upload the package (see section **13**).

---

## 8. Commands & Usage

Commands are sent as messages in the personal chat with Friday.

### Server & tools management

- `/servers list`  
Show configured data sources and which one (if any) is currently preferred.

- `/servers add <name> <url>`  
Add a server overlay (stored in Redis).

- `/servers remove <name>`  
Remove a server overlay.

- `/servers select <name>`  
Prefer this server for ambiguous requests (used as a routing hint).

- `/tools [<server>]`  
List tools for all or a specific source.

- `/tools describe <server__tool>`  
Show tool schema and example arguments.

### Conversation history

- `/history purge`  
Clear conversation history **and per‑conversation scratch state** for the current Teams conversation only.

### Runtime control

- `/stop`  
Cancel the **currently running response** for this Teams conversation.  
- Scope is strictly **per Teams conversation**: cancelling in one chat does not affect others.  
- If the user sends another non-command message while a response is still streaming, Friday replies asking them to wait or use `/stop` before sending a new query.

### Help

- `/help`  
Show command usage inside Teams.

Usage tips:

- Reference tools explicitly with `source__tool` when there are multiple sources.
- Ask for “CSV export” or “download as CSV” to trigger export tools when tabular data is present.
- Ask for “chart/graph/plot of X vs Y” to trigger charting tools when appropriate.
- Friday always operates in read‑only mode for tools unless a tool name is explicitly allowlisted.

---

## 9. Attachments, Files & Exports

Friday can use attached files as context for answers.

### Supported attachment handling

- **PDFs**
- Downloaded via Teams/OneDrive pre-authenticated `downloadUrl`.
- Parsed using `pypdf` with a page and size limit to avoid pathological PDFs.[web:358]
- A sanitized snippet (up to 4,000 characters) is added to the LLM context.

- **Text/code/data files**
- Includes: `.txt`, `.md`, `.csv`, `.json`, `.html`, `.xml`, `.sql`, `.py`, `.js`, `.ts`, `.java`, `.c`, `.cpp`, `.cs`, `.sh` and any `text/*` content type.
- Downloaded and decoded as UTF‑8; a sanitized snippet (up to 4,000 characters) is passed into context.

- **Office documents (DOC/DOCX/XLSX)**
- Acknowledged but not parsed directly.
- Friday instructs the user to export as PDF or text if detailed analysis is needed.

- **Images**
- Acknowledged (filename + MIME type) but image content is not parsed.
- Users can describe key details in text for analysis.

- **Other file types**
- Acknowledged with a generic “contents not parsed” message.

### Exports & charting

- CSV exports are sent as attachments with `text/csv` content type (default filename `export.csv`).
- Charts are generated as PNG images (`image/png`) and either inlined via data URLs (small) or uploaded as attachments (larger).
- Behavior is governed by:
- `ATTACH_MAX_INLINE_BYTES`
- `CSV_ROW_LIMIT`
- `ATTACH_DATA_URLS`

---

## 10. Health, diagnostics & logging

- `GET /health`  
Returns component status (Redis, Tool registry, LLM connectivity) for monitoring.

- `GET /meta`  
Returns service metadata, configured data sources, and loaded tools.

- Structured logs:
- Include correlation IDs and per‑turn context (user ID, conversation ID).
- Tool calls are traced and audited (tool name, server, arguments, success/failure).
- Safety events are logged when prompts or outputs are flagged by the content filters.

You can propagate an `x-correlation-id` header in upstream calls to trace requests end-to-end.

---

## 11. Safety & security

- **Secret management**
- Secrets remain in `.env` or a secret store and must not be committed to source control.
- `MICROSOFT_APP_PASSWORD`, `LLM_API_KEY`, etc. should be rotated periodically.

- **Read‑only tool enforcement**
- Gateway tools are treated as read‑only by default.
- Optional `READONLY_ALLOWLIST` can permit specific tools that perform writes, but this should be tightly controlled.

- **Input validation and sanitization**
- User messages are sanitized (null bytes stripped, length-capped).
- Malicious patterns (e.g., `<script>`, `javascript:`, path traversal strings) are detected and rejected before execution.
- Tool names and arguments are validated, size-limited, and sanitized before being passed to any remote source.

- **Content filters (user input and model output)**
- Profanity and toxicity detection uses `better_profanity` and `alt-profanity-check` to identify unsafe content.[web:318][web:339]
- If a user prompt is flagged as malicious or profane/toxic:
 - The turn is rejected; Friday sends a clear message explaining that the prompt was flagged and recorded, and that the assistant cannot help with that request.
 - A safety telemetry event is recorded with a short preview of the text (not the full payload).
- Final LLM responses pass through an output safety check; if unsafe, the content is replaced with a refusal message and logged as a flagged response.

- **Rate limiting & file size limits**
- File downloads are capped at a maximum size (default 5 MB) and truncated if headers or actual size exceed this limit.
- Streaming updates to Teams are rate-limited to avoid flooding the channel.

---

## 12. Testing & Troubleshooting

### Testing workflow

- `/servers list` → verify server discovery and selection.
- `/tools describe <server__tool>` → inspect schema and arguments.
- Ask: “Export the above table as CSV named report.csv” → test CSV export.
- Ask: “Plot a bar chart of project vs commit_count and attach it as PNG.” → test charting/upload.
- Attach a small PDF or CSV and ask Friday to summarize → test file ingestion.
- `/history purge` → validate history + state reset for the current conversation.
- `/stop` while a long answer is streaming → validate per‑conversation cancellation.

### Common issues

- **400 invalid tool sequence**
- May indicate truncated or inconsistent history.
- Increase `HISTORY_MAX_TURNS` or inspect tool sequencing logs.
- Use `/history purge` to reset the conversation if needed.

- **Unknown attachment type**
- Ensure CSVs and other files are being sent using Teams’ standard upload or `uploadAttachment` pattern.
- For Office docs, export as PDF or text first.

- **Bot appears unresponsive**
- Verify `/health` is green.
- Check that the messaging endpoint and `validDomains` in `manifest.json` match the current public URL.
- Confirm Redis is reachable via `REDIS_URL`.

- **Reload not firing during development**
- Install `watchfiles` and/or set `WATCHFILES_FORCE_POLLING=1`.

---

## 13. Important: updating Bot endpoint if the ngrok URL changes

Whenever ngrok restarts, it may issue a new URL. When that happens:

1. Update the bot messaging endpoint in the Teams Developer Portal (or Azure Bot registration) to:

https://<new-ngrok-id>.ngrok.io/api/messages

2. Update `validDomains` in `manifest.json` with the new domain (e.g., `"new-ngrok-id.ngrok.io"`).
3. Repackage the app and re-upload it in Teams (**Manage your apps → Upload an app**).

If these steps are skipped, Teams will not route messages to your local bot and it will appear unresponsive.

---