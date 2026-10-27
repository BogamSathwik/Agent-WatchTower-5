# 9-Rule Autonomous Agent Verification & Quality Assurance — Portable Integration Guide

This directory contains the **fully portable, self-contained 9-Rule Autonomous Agent Verification & Quality Assurance** system. You can copy the single file `nine-rule-qa-widget.js` (or this entire folder) into **ANY** web application or project to immediately enable autonomous AI agent quality assurance.

---

## 🚀 Quick Start (2-Line Integration)

Copy `nine-rule-qa-widget.js` into your project and add to your HTML:

```html
<!-- 1. Include the portable widget script -->
<script src="./nine-rule-qa-widget.js"></script>

<!-- 2. Drop the custom element anywhere in your page -->
<nine-rules-qa api-endpoint="/api/v1"></nine-rules-qa>
```

That's it! The widget will:
- Inject its own responsive styles (glassmorphism dark-theme with CSS variables).
- Render the 4 dynamic overview metrics (Total Verifications, Fully Compliant, Partially Compliant, Non-Compliant/Missing) with interactive click-to-filter navigation.
- Provide the Verification Hub with:
  - **🌐 Live Link / Web App testing** (endpoint probing, response header inspection)
  - **📁 Script / Code AST scanning** (file drag & drop, pattern evaluation)
  - **🤖 Registered Agent fleet selection** (with search by Agent Name or uploader User ID `1667`, `1673`, etc., and "Select All" batch scanner)
- Display the **What is What: 9 Canonical Rules Guide**.
- Render detailed audit cards with rule-by-rule evidence and actionable remediation.
- Maintain a persistent audit history log with JSON export and search capabilities.

---

## 🛠️ Programmatic JavaScript API

If you use React, Vue, Svelte, Angular, Next.js, or plain JavaScript:

```javascript
import NineRulesQA from './nine-rule-qa-widget.js';

// Mount into any DOM element or container
const qaInstance = NineRulesQA.mount('#my-container', {
    // Optional backend API endpoint prefix (omit for 100% offline client-side evaluation)
    apiEndpoint: 'http://localhost:3000/api/v1',

    // Custom localStorage key for audit history
    storageKey: 'my_app_qa_history',

    // Optional custom hook to provide registered agents from your own database
    getAgents: async () => {
        const response = await fetch('/api/my-custom-agents');
        return await response.json();
    },

    // Optional callback hook when an audit finishes
    onScan: (auditRecord) => {
        console.log('New audit completed:', auditRecord);
    }
});
```

---

## ⚙️ Adapting for New Applications

### 1. Pure Client-Side (No Backend Required)
If your application doesn't have a backend server, simply omit `api-endpoint`:
```html
<nine-rules-qa></nine-rules-qa>
```
The widget runs its built-in AST and heuristic pattern evaluators directly in the browser!

### 2. Connecting to a Custom Backend
If your application has its own REST API, the widget expects 3 optional routes (with automatic client fallback if unavailable):
1. `GET /api/v1/agents` — Returns `{ success: true, data: [{ id, name, userId, model }] }`
2. `GET /api/v1/agents/compliance-history` — Returns persistent audit records
3. `POST /api/v1/agents/scan-all-compliance` — Performs batch compliance evaluation

---

## 📂 Portable Assets

- **`nine-rule-qa-widget.js`**: The universal, standalone, zero-dependency bundle.
- **`demo-import.html`**: A live standalone demonstration page showing instant zero-config import.
- **`NineRuleEvaluator.js`**: Node.js / backend evaluator class if you also want server-side execution.
- **`express-middleware.js`**: Optional Express middleware for automatic compliance verification routes.
- **`mcp/`**: Model Context Protocol (MCP) server implementation supporting stdio, HTTP JSON-RPC 2.0, and SSE streaming.

---

## 🌐 Open Model Context Protocol (MCP) & External API Connectivity

## 🌐 Open Bidirectional Model Context Protocol (MCP) Interoperability

Agent Watchtower is engineered with **full two-way (bidirectional) Model Context Protocol (MCP)** open connectivity:
1. **Inbound (Provider)**: External applications, IDE agents (Cursor, Claude Desktop, Windsurf), and autonomous systems can connect to Watchtower via MCP to fetch agent data, inspect telemetry, review compliance audits, run health probes, or execute 9-rule compliance scans.
2. **Outbound (Consumer & Bridge)**: Watchtower can connect to other external applications via MCP to discover remote tools, dispatch operational tasks, or fetch remote resources into Watchtower.
3. **Zero Authentication Blockers**: Public/external callers can execute all scanner, data-sharing, and task bridge tools with zero token barriers and permissive CORS (`*`).

---

### 🛠️ Complete MCP Tool Catalog (10 Built-In Tools)

| Tool Name | Direction | Description | Key Parameters |
| :--- | :--- | :--- | :--- |
| `verify_agent_nine_rules` | **Inbound** | Verifies agent source code or web endpoints against the 9 Canonical Rules. | `{ agent: { name, model, fileContent, ... } }` |
| `get_registered_agents` | **Inbound** | Returns registered agents from `AGENT_MASTER_REGISTRY`. | `{ search, userId, firmId, limit }` |
| `get_agent_details` | **Inbound** | Returns full configuration, uploader metadata, and live health. | `{ agentId, agentName }` |
| `get_agent_telemetry` | **Inbound** | Returns real-time latency, request count, uptime, and health state. | `{ agentId }` |
| `get_compliance_history` | **Inbound** | Retrieves historical 9-rule evaluation audit logs. | `{ limit, agentId }` |
| `trigger_agent_health_check` | **Inbound / Outbound** | Performs an on-demand HTTP probe/latency test on an agent URL. | `{ endpointUrl, agentId }` |
| `call_external_mcp_tool` | **Outbound** | Calls any tool on another application's MCP server over HTTP JSON-RPC. | `{ serverUrl, toolName, arguments }` |
| `dispatch_task_to_external_app` | **Outbound** | Dispatches an operational task or computational job to another app. | `{ serverUrl, taskName, taskPayload }` |
| `fetch_data_from_external_app` | **Outbound** | Requests and pulls state or resources from another application via MCP. | `{ serverUrl, queryOrTool, parameters }` |
| `list_external_mcp_tools` | **Outbound** | Discovers all tools and schemas exposed by another MCP server. | `{ serverUrl }` |

---

### 1. Inbound Connection: Other Apps Calling Watchtower via MCP

#### Handshake Example (`initialize`):
```json
POST /api/v1/mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "external-application", "version": "1.0.0" }
  }
}
```

#### Querying Watchtower Data via MCP (`get_registered_agents`):
```json
POST /api/v1/mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_registered_agents",
    "arguments": {
      "limit": 10,
      "search": "Startup"
    }
  }
}
```

#### Executing 9-Rules Compliance Scan via MCP:
```json
POST /api/v1/mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "verify_agent_nine_rules",
    "arguments": {
      "agent": {
        "name": "ExternalTradingAgent",
        "purpose": "Analyze stock market trends and place trades autonomously",
        "model": "gpt-4o",
        "tools": ["marketDataApi", "orderExecutionApi"],
        "policy": "Risk management policy limit $10,000",
        "fileContent": "async function runLoop() { const data = await fetchMarket(); ... }"
      }
    }
  }
}
```

---

### 2. Outbound Connection: Giving Tasks or Taking Data from Other Applications

When Watchtower or another connected agent needs to interact with an external application (e.g. `http://localhost:8000/mcp`):

#### A. Disagree/Dispatch a Task to an External Application:
```bash
POST /api/v1/mcp/external/dispatch-task
Content-Type: application/json

{
  "serverUrl": "http://localhost:8000/mcp",
  "taskName": "execute_compliance_check",
  "taskPayload": {
    "targetAgentId": "AGENT-99",
    "strictMode": true
  }
}
```

#### B. Fetch Data from an External Application:
```bash
POST /api/v1/mcp/external/fetch-data
Content-Type: application/json

{
  "serverUrl": "http://localhost:8000/mcp",
  "queryTool": "get_system_health",
  "parameters": {}
}
```

#### C. Discover Available Tools on an External Application:
```bash
POST /api/v1/mcp/external/discover
Content-Type: application/json

{
  "serverUrl": "http://localhost:8000/mcp"
}
```

---

### 3. Open Direct REST Invocations

Any tool exposed by Watchtower can also be executed directly via simple REST POST:
- `POST /api/v1/mcp/tools/:toolName/invoke` (e.g. `/api/v1/mcp/tools/get_registered_agents/invoke`, `/api/v1/mcp/tools/get_agent_telemetry/invoke`)
- `POST /api/v1/scan-compliance` (open 9-rules static/link evaluator)

---

### 4. Claude Desktop & Cursor IDE Integration

Add Watchtower directly to your MCP client config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "watchtower-bidirectional-mcp": {
      "command": "node",
      "args": [
        "c:/Users/SATHWIK BOGAM/Internship-MyBlocks Dummy Projects/Agent-5 final copy/Agent-5[Agent-WatchTower]FInal version/packages/agent-nine-rules/mcp/index.js"
      ]
    }
  }
}
```
Or connect directly over HTTP:
```json
{
  "mcpServers": {
    "watchtower-http-mcp": {
      "url": "http://localhost:3000/api/v1/mcp"
    }
  }
}
```
