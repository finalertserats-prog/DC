# Friday Gateway — Multi-Layer Security Architecture

**Version:** 1.0
**Date:** March 9, 2026
**Authors:** Platform Engineering Team
**Classification:** Internal — Technical Reference

---

## Table of Contents

1. Executive Summary
2. Architecture Diagram
3. End-to-End Request Flow Diagram
4. Layer 1 — Authentication (Keycloak / Azure AD)
5. Layer 2 — Gateway RBAC (Access Rules)
6. Layer 3 — Data-Level Security (Apache Ranger + Snowflake)
7. Security Flow Walkthrough — Worked Example
8. Component Details
9. Configuration Reference
10. Database Backend Switching
11. Additional Security Controls
12. Deployment Architecture
13. Threat Model and Mitigations
14. Appendix

---

## 1. Executive Summary

The Friday Gateway implements a **defense-in-depth** security model with **three independent security layers** that work together to ensure users can only access data they are authorized to see. No single layer is solely responsible for security — each layer provides complementary protection:

| Layer | Component | Responsibility | Enforcement Point |
|-------|-----------|---------------|-------------------|
| Layer 1 | Keycloak / Azure AD | Authentication — Is this user who they claim to be? | Identity Provider (external) |
| Layer 2 | Gateway RBAC | Gateway RBAC | Gateway application code |
| Layer 3 | Apache Ranger | Data-Level Security — Which rows/columns can this user see? | Database engine (Snowflake) |

Even if a user bypasses or misconfigures one layer, the remaining layers still protect the data.

---

## 2. Architecture Diagram

### System Component Layout

The following table represents the end-to-end architecture from user to database. Each row is a component, and the arrows show the direction of data flow.

| # | Component | Description | Flow |
|---|-----------|-------------|------|
| 1 | Microsoft Teams Client | User interface for chat | ↓ sends message |
| 2 | Azure AD / Keycloak (LAYER 1) | Identity provider — SSO, JWT issuance | ↓ authenticated token |
| 3 | Friday Gateway — FastAPI (LAYER 2) | RBAC, tool filtering, agent orchestration | ↓ MCP tool call |
| 4 | MCP Server (LABIQ / CODEIQ) | Tool execution, SQL generation | ↓ SQL query |
| 5 | Apache Ranger (LAYER 3) | Row filter injection, column masking | ↓ rewritten query |
| 6 | Snowflake Database | Query execution, data return | ↑ filtered results |

### Detailed Architecture — Component Relationships

| Source | → | Destination | Protocol / Mechanism | Purpose |
|--------|---|-------------|---------------------|---------|
| Teams Client | → | Azure AD / Keycloak | OAuth 2.0 / OpenID Connect | User authentication, SSO |
| Teams Client | → | Bot Framework Service | HTTPS | Message delivery |
| Bot Framework | → | Friday Gateway | HTTPS POST to /api/messages | Authenticated activity delivery |
| Friday Gateway | → | Redis | TCP 6379 | Session state, tool cache, preferences |
| Friday Gateway | → | LLM Engine (GPT-4o-mini) | HTTPS (OpenAI-compatible API) | Natural language → tool selection |
| Friday Gateway | → | MCP Server (LABIQ) | Streamable HTTP (port 8000) | Tool discovery + execution |
| Friday Gateway | → | MCP Server (CODEIQ) | Streamable HTTP (port 8009) | Tool discovery + execution |
| MCP Server | → | Apache Ranger | Plugin API | Policy lookup for row/column filters |
| MCP Server | → | Snowflake | JDBC / ODBC | SQL query execution |
| Apache Ranger | → | Snowflake | Transparent query rewriting | WHERE clause injection |

### Security Layer Boundary Diagram

| Zone | Components Inside | Security Gate at Entry |
|------|-------------------|----------------------|
| External Zone | Microsoft Teams, Azure AD | No gateway control — external services |
| Gateway Zone | FastAPI, Agent, LLM Client, Redis | Bot Framework JWT validation (Layer 1) |
| MCP Zone | LABIQ Server, CODEIQ Server | RBAC + read-only filter (Layer 2) |
| Data Zone | Snowflake Database | Apache Ranger policy enforcement (Layer 3) |

Data flows from the External Zone inward. Each zone boundary enforces its own security gate. A request must pass ALL gates to reach the Data Zone.

### Technology Stack

| Component | Technology | Port | Description |
|-----------|-----------|------|-------------|
| Gateway Server | Python 3.12 + FastAPI + Uvicorn | 3978 (dev) / 5000 (prod) | Core gateway application |
| Bot Framework | Microsoft Bot Framework SDK | — | Teams bot adapter |
| LLM Engine | GPT-4o-mini (OpenAI-compatible) | — | Natural language to SQL/tool selection |
| MCP Protocol | fastmcp client library | — | Streamable HTTP transport |
| MCP Server (LABIQ) | FastMCP Server | 8000 | Lab IQ data tools (30+ tools) |
| MCP Server (CODEIQ) | FastMCP Server | 8009 | Code IQ tools |
| State Store | Redis 7.x | 6379 | Sessions, cache, preferences |
| Identity Provider | Azure AD / Keycloak | — | SSO + JWT token validation |
| Policy Engine | Apache Ranger | — | Row/column-level security policies |
| Database | Snowflake | — | Analytics data store |

---

## 3. End-to-End Request Flow Diagram

### Flow Diagram — User Query to Filtered Response

The following table traces a complete request from the moment a user types a message to the moment they receive a response. Each row is a discrete step with timing.

| Step | Time | From | → | To | Action | Security Layer |
|------|------|------|---|-----|--------|---------------|
| 1 | T+0ms | User | → | Teams Client | Types: "Show me revenue by operating unit" | — |
| 2 | T+2ms | Teams Client | → | Azure AD | SSO token attached to message | Layer 1 |
| 3 | T+5ms | Azure AD | → | Bot Framework | JWT validated (signature, expiry, audience) | Layer 1 |
| 4 | T+5ms | Bot Framework | → | Gateway /api/messages | HTTP POST with authenticated Activity | Layer 1 |
| 5 | T+10ms | Gateway | → | RBAC Engine | Extract user_id → resolve email → lookup access rules | Layer 2 |
| 6 | T+12ms | RBAC Engine | → | Agent | Return allowed servers: {LABIQ, CODEIQ} | Layer 2 |
| 7 | T+15ms | Agent | → | Redis | Load conversation history | — |
| 8 | T+20ms | Agent | → | MCP Registry | Fetch tool catalog (filtered by RBAC) | Layer 2 |
| 9 | T+50ms | Agent | → | LLM (GPT-4o-mini) | Send system prompt + filtered tools + user query | — |
| 10 | T+150ms | LLM | → | Agent | Select tool: custom_query, generate SQL | — |
| 11 | T+155ms | Agent | → | Redis | Read user db preference → inject db_source | — |
| 12 | T+160ms | Agent | → | MCP Registry | call_tool("LABIQ__custom_query", args) | Layer 2 |
| 13 | T+165ms | MCP Registry | → | Read-Only Filter | Check tool against write keywords + allowlist | Layer 2 |
| 14 | T+170ms | MCP Registry | → | Circuit Breaker | Verify LABIQ server health (CLOSED state) | — |
| 15 | T+200ms | MCP Registry | → | LABIQ MCP Server | Dispatch tool call via streamable HTTP | — |
| 16 | T+250ms | LABIQ Server | → | Apache Ranger | SQL intercepted, policy lookup for user | Layer 3 |
| 17 | T+260ms | Apache Ranger | → | Snowflake | Rewritten SQL with WHERE clause injected | Layer 3 |
| 18 | T+400ms | Snowflake | → | LABIQ Server | Filtered result rows returned | — |
| 19 | T+450ms | LABIQ Server | → | Gateway Agent | Tool result returned | — |
| 20 | T+500ms | Agent | → | LLM | Format results into human-readable response | — |
| 21 | T+1500ms | Agent | → | Teams Client | Stream formatted response to user | — |

### RBAC Resolution Flow Diagram

When the gateway receives a user_id from Teams, it must resolve which MCP servers the user can access. The following table shows the resolution pipeline:

| Step | Input | Action | Output | Next Step |
|------|-------|--------|--------|-----------|
| 1 | user_id from Teams | Check CURRENT_USER_EMAIL setting | If set → use as email | Go to Step 5 |
| 2 | user_id | Direct lookup in ACCESS_RULES | If found → return servers | Done |
| 3 | user_id | Case-insensitive email match | If found → return servers | Done |
| 4 | user_id | Lookup in AAD_TO_EMAIL mapping | If found → email resolved | Go to Step 5 |
| 5 | email | Lookup email in MCP_ACCESS_RULES | If found → return servers | Done |
| 6 | — | Fall back to "default" rule | "default": [] → DENY ALL | Done |

**Critical:** The default rule returns an empty array, meaning any user not explicitly listed gets ZERO server access.

### Denied User Flow Diagram

| Step | Action | Result |
|------|--------|--------|
| 1 | RBAC returns empty server set | No MCP tools available |
| 2 | Agent detects denied access | Switches to Mark I mode (general assistant) |
| 3 | System prompt updated | LLM told: "MUST NOT attempt to call any MCP tools" |
| 4 | User sees denial message | "I currently don't have access to [servers]. Contact your bot administrator." |

---

## 4. Layer 1 — Authentication (Keycloak / Azure AD)

### Purpose

Verify the identity of the user. No anonymous or unauthenticated access is permitted.

### Authentication Flow Diagram

| Step | Component | Action | Output |
|------|-----------|--------|--------|
| 1 | Teams Client | User signs in via Azure AD / Keycloak | SSO session established |
| 2 | Teams Client | User sends a message | JWT bearer token attached |
| 3 | Bot Framework Service | Receives message + token | Validates JWT (signature, expiry, audience, issuer) |
| 4 | Bot Framework | Forwards to Gateway | HTTP POST to /api/messages with validated Activity |
| 5 | Gateway Adapter | Extracts identity from Activity | user_id, user_name, aadObjectId |

### Identity Extraction

After validation, the gateway extracts the user's identity from the Bot Framework Activity object:

| Field | Value | Description |
|-------|-------|-------------|
| activity.from.id | 29:1KQd1POcqPHWP2r2E_H2Wlc7UUivvj3c... | Teams-internal AAD ID |
| activity.from.name | mahesh.k | Display name |
| activity.from.aadObjectId | (GUID) | Azure AD Object ID |

### Where This Happens

The Bot Framework adapter is configured in gateway_app/bots/adapter.py with Microsoft App credentials (Bot ID, Password, Tenant ID). Token validation happens at the adapter level. The FridayBot handler in gateway_app/bots/handler.py extracts user_id and user_name from the turn context after token validation.

### Configuration

| Variable | Purpose | Example |
|----------|---------|---------|
| MICROSOFT_BOT_ID | Bot registration ID | ae6b5674-c8e6-4095-9291-5e7d9c7c2242 |
| MICROSOFT_BOT_PASSWORD | Bot secret for token validation | (secret) |
| MICROSOFT_APP_TENANT_ID | Azure AD tenant ID | 0ddd8c10-6e8e-4d84-a05f-867fd59d328b |

### Security Guarantees

- Every message is authenticated by Azure AD / Keycloak before reaching the gateway.
- JWT token is validated by the Bot Framework SDK (signature, expiry, audience, issuer).
- Only users within the configured Azure AD tenant can communicate with the bot.
- No direct API access without valid Bot Framework authentication.

---

## 5. Layer 2 — Gateway RBAC (MCP Access Rules)

### Purpose

Control which MCP servers (and therefore which tools/data sources) each authenticated user can access. This is application-level authorization enforced in the gateway code.

### RBAC Decision Flow Diagram

| Step | Input | Decision | Yes Path | No Path |
|------|-------|----------|----------|---------|
| 1 | user_id | Is CURRENT_USER_EMAIL configured? | Use configured email → Step 5 | Continue to Step 2 |
| 2 | user_id | Is user_id directly in ACCESS_RULES? | Return allowed servers | Continue to Step 3 |
| 3 | user_id | Does user_id match an email (case-insensitive)? | Return allowed servers | Continue to Step 4 |
| 4 | user_id | Is user_id in AAD_TO_EMAIL mapping? | Resolve email → Step 5 | Continue to Step 6 |
| 5 | email | Is email in MCP_ACCESS_RULES? | Return allowed servers | Continue to Step 6 |
| 6 | — | Apply "default" rule | "default": [] → DENY ALL | — |

### Access Rules Configuration

| User Email | Allowed Servers | Access Level |
|-----------|-----------------|-------------|
| default (any unlisted user) | (none) | General assistant only (Mark I) |
| mahesh.k@techsophy.com | LABIQ, CODEIQ | Full access to both servers |
| geetadharani.y@techsophy.com | LABIQ | Lab IQ data only |
| durgadevi.g@techsophy.com | LABIQ | Lab IQ data only |
| yashaswiram.v@techsophy.com | CODEIQ | Code IQ only |
| partha@techsophy.com | LABIQ, CODEIQ | Full access to both servers |
| sisirchandra.p@techsophy.com | LABIQ, CODEIQ | Full access to both servers |

### Key Design Decisions

| Decision | Description |
|----------|-------------|
| Deny-by-default | "default": [] means any user not explicitly listed gets zero server access |
| Case-sensitive server names | Must match MCP_SERVERS keys exactly (LABIQ, CODEIQ) |
| Email-based mapping | Users are identified by email address |
| AAD ID mapping required | Teams sends opaque AAD IDs, not emails — AAD_TO_EMAIL bridges the gap |

### Tool Filtering Flow Diagram

| Step | Action | Result |
|------|--------|--------|
| 1 | RBAC returns allowed servers (e.g., {LABIQ}) | Server set established |
| 2 | MCP Registry fetches tool catalog from LABIQ | 30+ tools discovered |
| 3 | MCP Registry checks each tool against read-only filter | Write tools removed |
| 4 | Description overrides applied to remaining tools | LLM steering applied |
| 5 | Final filtered catalog sent to LLM | User only sees authorized tools |

If a server is NOT in the allowed set, _fetch_tools_server() returns an empty list — the user never sees tool names, descriptions, or schemas from denied servers.

### Security Guarantees

- **Deny-by-default:** Unconfigured users get zero MCP server access.
- **Server-level granularity:** Users can be granted access to LABIQ only, CODEIQ only, or both.
- **Tool catalog filtering:** Denied users never see tool names, descriptions, or schemas.
- **LLM prompt enforcement:** System prompt explicitly tells the LLM not to call tools for denied users.
- **Double-check on call_tool():** Even if the LLM somehow attempts a tool call, server validation and read-only checks block it.

---

## 6. Layer 3 — Data-Level Security (Apache Ranger + Snowflake)

### Purpose

Even after a user is authenticated (Layer 1) and authorized to use LABIQ tools (Layer 2), they should only see rows and columns they are authorized to access. This is row-level security (RLS) and column-level masking enforced at the database engine level.

### Ranger Query Rewriting Flow Diagram

| Step | Component | Action | SQL State |
|------|-----------|--------|-----------|
| 1 | LLM via MCP | Generates original SQL | SELECT operating_unit, SUM(revenue) FROM sr_labiq_revenue_services GROUP BY operating_unit |
| 2 | MCP Server | Forwards SQL to Snowflake | (unchanged) |
| 3 | Apache Ranger Plugin | Intercepts query before execution | (intercepted) |
| 4 | Ranger Policy Store | Looks up policies for current user | Row filter found: operating_unit IN ('Malkipuram', 'Amalapuram') |
| 5 | Ranger Plugin | Injects WHERE clause into SQL | SELECT operating_unit, SUM(revenue) FROM sr_labiq_revenue_services WHERE operating_unit IN ('Malkipuram', 'Amalapuram') GROUP BY operating_unit |
| 6 | Snowflake | Executes rewritten query | Returns only 2 rows |

### Example Policy — Revenue Row Filter

| Field | Value |
|-------|-------|
| Resource | database=labiq, table=sr_labiq_revenue_services |
| User | mahesh.k |
| Action | SELECT |
| Row Filter | operating_unit IN ('Malkipuram', 'Amalapuram') |
| Effect | Any SELECT on sr_labiq_revenue_services will AUTOMATICALLY get a WHERE clause appended |

### Example Policy — Column Masking for PII

| Field | Value |
|-------|-------|
| Resource | table=sr_labiq_clinical |
| Column | patient_name |
| Mask Type | HASH / PARTIAL / NULLIFY |
| Users | All except admin |

### Types of Ranger Policies

| Policy Type | Description | Example |
|-------------|-------------|---------|
| Row Filter | Automatically appends WHERE clause to restrict visible rows | operating_unit IN ('Malkipuram', 'Amalapuram') |
| Column Masking | Replaces sensitive column values with masked/hashed versions | patient_name → 'XXX' or SHA-256 hash |
| Access Control | Allow/deny access to specific tables or databases entirely | Deny SELECT on audit_logs table |
| Tag-Based | Policies based on data classification tags (PII, PHI, etc.) | Mask all columns tagged "PII" |

### Why This Layer Is Critical

Even if:
- Layer 2 is misconfigured and grants a user broader access than intended
- The LLM generates a SELECT * query that requests all data
- Someone directly calls the MCP server bypassing the gateway

Apache Ranger still filters the data at the database level. The database engine physically cannot return unauthorized rows — the WHERE clause is injected before query execution.

### Security Guarantees

- **Transparent to application:** Gateway code does not need to know about row filters.
- **Cannot be bypassed by SQL:** Even SELECT * or UNION ALL attacks are filtered.
- **Per-user granularity:** Different users see different data from the same table.
- **Audit trail:** Ranger logs every policy decision for compliance.
- **Database-engine enforcement:** Works regardless of which application/tool sends the query.

---

## 7. Security Flow Walkthrough — Worked Example

### Scenario

**User:** mahesh.k@techsophy.com
**Query:** "Show me revenue by operating unit"
**Expected:** Only data for Malkipuram and Amalapuram (per Ranger policy)

### Complete Security Trace — Flow Diagram

| Step | Security Layer | Component | Input | Action | Output | Status |
|------|---------------|-----------|-------|--------|--------|--------|
| 1 | Layer 1 | Teams Client | User message | Attach SSO token | Activity + JWT | — |
| 2 | Layer 1 | Azure AD | JWT token | Validate signature, expiry, audience | Authenticated identity | ✅ PASS |
| 3 | Layer 1 | Bot Framework | Validated Activity | Forward to Gateway | HTTP POST /api/messages | ✅ PASS |
| 4 | Layer 2 | Gateway RBAC | user_id: 29:1KQd1POcq... | AAD_TO_EMAIL → mahesh.k@techsophy.com | Email resolved | — |
| 5 | Layer 2 | Gateway RBAC | mahesh.k@techsophy.com | MCP_ACCESS_RULES lookup | ["LABIQ", "CODEIQ"] | ✅ PASS |
| 6 | Layer 2 | MCP Registry | Allowed: {LABIQ, CODEIQ} | Filter tool catalog | 30+ LABIQ tools exposed | ✅ PASS |
| 7 | — | LLM (GPT-4o-mini) | System prompt + tools + query | Select tool, generate SQL | custom_query selected | — |
| 8 | Layer 2 | Read-Only Filter | Tool: custom_query | Check against write keywords | Not a write tool | ✅ PASS |
| 9 | Layer 2 | Circuit Breaker | Server: LABIQ | Check health state | CLOSED (healthy) | ✅ PASS |
| 10 | — | Agent | User preference | Read db_source from Redis | db_source = "snowflake" | — |
| 11 | — | MCP Registry | Tool call + args | Dispatch to LABIQ server | SQL sent to MCP | — |
| 12 | Layer 3 | Apache Ranger | SQL + user: mahesh.k | Policy lookup: row filter found | Filter: operating_unit IN (...) | ✅ PASS |
| 13 | Layer 3 | Snowflake | Rewritten SQL | Execute with WHERE clause | 2 rows returned | ✅ PASS |
| 14 | — | Agent → User | Filtered results | Format and stream to Teams | User sees 2 operating units | — |

### Final Result Seen by User

| Operating Unit | Total Revenue |
|----------------|---------------|
| Malkipuram | ₹12,50,000 |
| Amalapuram | ₹8,75,000 |

The user NEVER sees other operating units — they are invisible. The user does not even know other units exist.

### Security Checkpoints Summary

| Checkpoint | What Was Checked | What Would Happen If It Failed |
|------------|-----------------|-------------------------------|
| JWT Validation (Layer 1) | Token signature, expiry, audience | HTTP 401 — message rejected |
| RBAC Lookup (Layer 2) | User email → server access | Mark I mode — no tools available |
| Read-Only Filter (Layer 2) | Tool name/description keywords | Tool blocked, error returned |
| Circuit Breaker (Layer 2) | Server health | Tool call rejected, fallback response |
| Ranger Row Filter (Layer 3) | User → row-level policy | Unauthorized rows excluded from results |
| Ranger Column Mask (Layer 3) | User → column masking policy | Sensitive values replaced with masked data |

---

## 8. Component Details

### 8.1 Gateway Application Structure

| Directory / File | Purpose |
|-----------------|---------|
| gateway_app/api/routes.py | Bot Framework HTTP endpoint + health checks |
| gateway_app/api/tab_routes.py | React Tab UI REST + SSE endpoints |
| gateway_app/api/schemas.py | Input validation, sanitization, profanity check |
| gateway_app/bots/adapter.py | Bot Framework adapter (token validation) |
| gateway_app/bots/handler.py | Teams message handler (mention detection, attachments) |
| gateway_app/config/settings.py | Centralized config with env var parsing |
| gateway_app/infra/logging_config.py | Structured JSON logging |
| gateway_app/infra/shutdown.py | Graceful shutdown handler |
| gateway_app/services/agent.py | Main agent orchestration (planning, tool exec, streaming) |
| gateway_app/services/mcp_registry.py | MCP server management, RBAC, tool catalog, read-only filter |
| gateway_app/services/commands.py | Slash commands (/help, /tools, /db, /history) |
| gateway_app/services/prompts.py | LLM system prompts (read-only rules, tool selection) |
| gateway_app/services/llm_client.py | OpenAI-compatible LLM client |
| gateway_app/services/circuit_breaker.py | Circuit breaker for MCP server resilience |
| gateway_app/services/connection_pool.py | MCP connection pooling |
| gateway_app/services/rate_limiter.py | Per-user/conversation rate limiting |
| gateway_app/services/audit.py | Audit logging for compliance |
| gateway_app/services/retry.py | Exponential backoff retry strategy |
| gateway_app/services/tool_registry.py | Tool context rendering for LLM |

### 8.2 Key Security Files

| File | Security Role |
|------|--------------|
| settings.py | Parses MCP_ACCESS_RULES, AAD_TO_EMAIL, MCP_READONLY_ALLOWLIST |
| mcp_registry.py | RBAC enforcement, read-only filter, tool catalog filtering |
| agent.py | Access denial detection, db_source injection, tool call validation |
| prompts.py | LLM system prompts enforce read-only behavior at the AI layer |
| schemas.py | Input validation, XSS detection, profanity filtering, output sanitization |
| handler.py | Bot Framework integration, user identity extraction |
| audit.py | Audit trail for all tool calls and commands |

### 8.3 Read-Only Enforcement Flow Diagram

| Step | Check | Action | If Triggered |
|------|-------|--------|-------------|
| 1 | Tool Name Scan | Check tool name against write keywords (write, update, delete, remove, insert, create, drop, alter, truncate, etc.) | Tool removed from catalog |
| 2 | Tool Description Scan | Check description for write-related words | Tool removed from catalog |
| 3 | Allowlist Override | Check MCP_READONLY_ALLOWLIST for false positives (e.g., "switch" in query_switch_database_backend) | Tool restored to catalog |
| 4 | LLM System Prompt | Instruct LLM: "Enforce strict read-only behavior; never plan or suggest any write, update, delete, execute, or destructive actions." | LLM avoids write operations |

Write keywords scanned: write, update, delete, remove, insert, create, patch, post, put, execute, run, drop, alter, truncate, commit, merge, upsert, save, set, kill, terminate.

---

## 9. Configuration Reference

### Environment Variables — Security

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| MICROSOFT_BOT_ID | string | — | Azure Bot registration ID |
| MICROSOFT_BOT_PASSWORD | secret | — | Bot Framework app secret |
| MICROSOFT_APP_TENANT_ID | string | — | Azure AD tenant ID |
| MCP_ACCESS_RULES | JSON | {} | Per-user server access mapping |
| AAD_TO_EMAIL | JSON | {} | Maps Teams AAD IDs to email addresses |
| MCP_READONLY_ALLOWLIST | string | "" | False-positive allowlist for read-only filter |
| MCP_TOOL_DESCRIPTION_OVERRIDES | JSON | {} | Override tool descriptions for LLM steering |

### Environment Variables — Rate Limiting and Circuit Breaker

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| RATE_LIMIT_ENABLED | bool | true | Enable rate limiting |
| RATE_LIMIT_PER_USER_PER_MINUTE | int | 100 | Max requests per user per minute |
| RATE_LIMIT_PER_CONVERSATION_PER_MINUTE | int | 50 | Max requests per conversation per minute |
| RATE_LIMIT_PER_IP_PER_MINUTE | int | 200 | Max requests per IP per minute |
| CIRCUIT_BREAKER_FAILURE_THRESHOLD | int | 5 | Failures before circuit opens |
| CIRCUIT_BREAKER_TIMEOUT_SECONDS | float | 60.0 | Time before circuit half-opens |

### Environment Variables — Input Validation

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| MAX_USER_MESSAGE_LENGTH | int | 10000 | Max characters in user message |
| MAX_TOOL_NAME_LENGTH | int | 200 | Max tool name length |
| MAX_TOOL_ARGUMENTS_SIZE | int | 50000 | Max tool arguments JSON size (bytes) |
| MAX_REQUEST_BODY_SIZE | int | 200000 | Max HTTP request body size (bytes) |

---

## 10. Database Backend Switching

The gateway supports switching the Snowflake database connection at runtime. This is implemented as a user preference that is auto-injected into MCP tool calls.

### Database Switching Flow Diagram

| Step | Component | Action | Result |
|------|-----------|--------|--------|
| 1 | User | Sends /db command in Teams OR clicks toggle in Tab UI | Preference request received |
| 2 | Gateway | Calls MCP tool: query_switch_database_backend | Backend switched at MCP server |
| 3 | Gateway | Stores preference in Redis (key: tmcp:db_pref:{user_id}) | Preference persisted |
| 4 | User | Asks a data question (e.g., "show me revenue") | Query initiated |
| 5 | Agent | Reads user preference from Redis | db_source resolved |
| 6 | Agent | Injects db_source parameter into LABIQ tool call | Tool args updated |
| 7 | MCP Server | Receives call with db_source | Routes to correct Snowflake connector |

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| DB_PREFERENCE_OPTIONS | snowflake | Available database options |
| DB_PREFERENCE_DEFAULT | snowflake | Default when no preference is set |
| DB_PREFERENCE_INJECT_PARAM | db_source | Parameter name injected into tool calls |
| DB_PREFERENCE_SERVERS | LABIQ | Which MCP servers receive the injection |
| DB_PREFERENCE_SKIP_TOOLS | query_switch_database_backend, query_get_current_backend | Tools that should NOT receive the injection |

### Important: Security Is Maintained

Apache Ranger policies apply to Snowflake. The row filter for operating_unit IN ('Malkipuram', 'Amalapuram') is enforced regardless of which database connector is active. Switching connectors does NOT bypass data-level security.

---

## 11. Additional Security Controls

### 11.1 Input Validation and Sanitization

The gateway validates and sanitizes all input through gateway_app/api/schemas.py:

| Control | Implementation |
|---------|---------------|
| XSS Detection | Regex patterns scan for script tags, javascript: URIs, eval(), exec(), etc. |
| Path Traversal | Detects ../ patterns in input |
| Size Limits | Enforces MAX_USER_MESSAGE_LENGTH and MAX_REQUEST_BODY_SIZE |
| Profanity Filter | Uses better-profanity library for content filtering |
| Toxicity Detection | Uses profanity-check ML model for toxicity scoring |
| Output Safety | enforce_output_safety() sanitizes LLM output before sending to user |

### 11.2 Rate Limiting

Three-dimensional rate limiting prevents abuse:

| Dimension | Limit |
|-----------|-------|
| Per-User | 100 requests/minute |
| Per-Conversation | 50 requests/minute |
| Per-IP | 200 requests/minute |

### 11.3 Circuit Breaker Flow Diagram

| Current State | Event | → | Next State | Action |
|---------------|-------|---|-----------|--------|
| CLOSED (normal) | Request succeeds | → | CLOSED | Continue normal operation |
| CLOSED (normal) | 5 consecutive failures | → | OPEN | Block all requests to failing server |
| OPEN (blocking) | Request attempted | → | OPEN | Immediately reject — do not call server |
| OPEN (blocking) | 60 seconds elapsed | → | HALF-OPEN | Allow one test request |
| HALF-OPEN (testing) | Test request succeeds | → | CLOSED | Resume normal operation |
| HALF-OPEN (testing) | Test request fails | → | OPEN | Block again for another 60 seconds |

### 11.4 Audit Logging

Every tool call is logged with the following fields:

| Field | Description |
|-------|-------------|
| User ID | Authenticated user identifier |
| Tool Name | Name of the Tool tool called |
| Tool Source | Tool source name |
| Arguments | Sanitized tool arguments |
| Success/Failure | Whether the call succeeded |
| Error | Error message (if failed) |
| Timestamp | ISO 8601 timestamp |
| Conversation ID | Teams conversation identifier |

### 11.5 Graceful Shutdown Flow Diagram

| Step | Action | Result |
|------|--------|--------|
| 1 | SIGTERM received | Shutdown initiated |
| 2 | ShutdownMiddleware activated | New requests → HTTP 503 |
| 3 | In-flight request tracking | Wait for current requests to complete |
| 4 | MCP connections closed | Connection pool drained |
| 5 | Redis connections closed | State store disconnected |
| 6 | Process exits | Clean shutdown complete |

---

## 12. Deployment Architecture

### Kubernetes Deployment

The gateway is deployed as a Kubernetes Deployment in the datalake namespace:

| Setting | Value |
|---------|-------|
| Namespace | datalake |
| Replicas | 1 |
| Container Image | tsdevopsteam/platform:datalake-mcp-server-gateway-$BUILD_NUMBER |
| Container Port | 5000 |
| CPU Request | 250m |
| CPU Limit | 500m |
| Memory Request | 512Mi |
| Memory Limit | 1Gi |
| Service Type | ClusterIP |

### Container Security

| Control | Implementation |
|---------|---------------|
| Non-root execution | runAsUser: 1001, runAsNonRoot: true |
| No service account token | automountServiceAccountToken: false |
| Secrets separation | ConfigMap for non-secret config, Secret for credentials |
| Resource limits | CPU and memory limits enforced |
| Custom base image | techsophyofficial/python:v3.12.3 |
| Configuration injection | Environment variables via configMapRef and secretRef |

### Deployment Flow Diagram

| Step | Action | Result |
|------|--------|--------|
| 1 | Code pushed to repository | CI pipeline triggered |
| 2 | Docker image built | Image tagged with BUILD_NUMBER |
| 3 | Image pushed to registry | tsdevopsteam/platform:datalake-mcp-server-gateway-$BUILD_NUMBER |
| 4 | Kubernetes manifest applied | Deployment updated in datalake namespace |
| 5 | Pod starts | Container runs on port 5000 |
| 6 | Health check passes | /health endpoint returns 200 |
| 7 | Service routes traffic | ClusterIP service exposes pod |

---

## 13. Threat Model and Mitigations

### Threat Matrix

| # | Threat | Layer | Mitigation |
|---|--------|-------|------------|
| T1 | Unauthenticated access | L1 | Azure AD JWT validation on every request |
| T2 | Unauthorized MCP tool access | L2 | MCP_ACCESS_RULES with deny-by-default |
| T3 | Cross-tenant data access | L3 | Apache Ranger row-level security |
| T4 | SQL injection via LLM | L3 | Parameterized queries at MCP server; Ranger filters still apply |
| T5 | Prompt injection to bypass read-only | L2 | System prompt + write keyword filter + Ranger is read-only at DB |
| T6 | Denial of service | L2 | Rate limiting (3 dimensions) + circuit breaker |
| T7 | XSS in bot responses | L2 | enforce_output_safety() + sanitize_text() |
| T8 | Sensitive data leakage | L3 | Column masking policies in Ranger |
| T9 | LLM choosing wrong tool | L2 | MCP_TOOL_DESCRIPTION_OVERRIDES + system prompt directives |
| T10 | Direct MCP server bypass | L3 | Ranger enforces security at DB level regardless of caller |

### Defense-in-Depth — Layer Failure Analysis

| Scenario | Layer 1 | Layer 2 | Layer 3 | Outcome |
|----------|---------|---------|---------|---------|
| Normal operation | ✅ Active | ✅ Active | ✅ Active | Full security — user sees only authorized data |
| Layer 1 compromised | ❌ Bypassed | ✅ Active | ✅ Active | Attacker blocked by RBAC — no tool access without email in rules |
| Layer 2 misconfigured | ✅ Active | ❌ Too permissive | ✅ Active | User may access extra tools but Ranger still filters data rows |
| MCP server accessed directly | ❌ Skipped | ❌ Skipped | ✅ Active | Ranger still enforces row/column filters at database level |
| All three layers active | ✅ Active | ✅ Active | ✅ Active | Maximum security — authentication + authorization + data filtering |

---

## 14. Appendix

### A. Mark Versions

| Mark | Mode | Description | MCP Tools |
|------|------|-------------|-----------|
| Mark I | v1.0 | General assistant only | None |
| Mark II | v2.0 | Single MCP server | One server |
| Mark III | v3.0 | Multi-server | Multiple servers |

### B. Access Rule Examples

| Scenario | Configuration | Effect |
|----------|--------------|--------|
| Deny all by default (recommended) | "default": [] | Unlisted users get general assistant only |
| Grant single server access | "analyst@company.com": ["LABIQ"] | User can access LABIQ tools only |
| Grant multi-server access | "admin@company.com": ["LABIQ", "CODEIQ"] | User can access both servers |
| Grant all-open access (NOT recommended) | Omit MCP_ACCESS_RULES entirely | All users can access all servers |

### C. Apache Ranger Policy Types for LabIQ

| Policy | Table | Filter | Users |
|--------|-------|--------|-------|
| Revenue Row Filter | sr_labiq_revenue_services | operating_unit IN (...) | Per operating-unit access |
| Clinical Row Filter | sr_labiq_services | operating_unit IN (...) | Per operating-unit access |
| PII Column Masking | sr_labiq_services | patient_name → HASH | All non-admin users |
| Table Access Control | audit_logs | DENY SELECT | All non-admin users |

### D. Complete Request Lifecycle — Timing Diagram

| Time | Event | Layer |
|------|-------|-------|
| T+0ms | Teams message received at gateway | — |
| T+5ms | Bot Framework token validated | Layer 1 |
| T+10ms | RBAC check: AAD → email → access rules | Layer 2 |
| T+15ms | Conversation history loaded from Redis | — |
| T+20ms | Tool catalog fetched (filtered by RBAC) | Layer 2 |
| T+50ms | LLM planning round: tool + SQL selection | — |
| T+200ms | MCP tool call dispatched | — |
| T+300ms | Database query executed (Ranger filter applied) | Layer 3 |
| T+500ms | Results returned, LLM streaming begins | — |
| T+1500ms | Final response sent to Teams user | — |

### E. Security Layer Summary Diagram

| Layer | Gate | Blocks | Allows |
|-------|------|--------|--------|
| Layer 1 — Authentication | JWT Validation | Anonymous users, expired tokens, wrong tenant | Authenticated users with valid JWT |
| Layer 2 — RBAC | Access Rules | Users not in MCP_ACCESS_RULES, write operations | Users with explicit server access |
| Layer 3 — Data Security | Ranger Policies | Unauthorized rows, sensitive columns | Only policy-matching data |

---

*Document generated from codebase analysis of teams_mcp_gateway repository.*
*For questions or updates, contact the Platform Engineering team.*
