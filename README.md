# Agent Watchtower — Universal Agent Observability Platform

Agent Watchtower is a centralized monitoring, evaluation, comparison, and intelligence platform for autonomous agents and agent-driven applications.

## Project Structure

```text
Agent-Watchtower/
├── frontend/                     # Frontend UI, Reverse Proxy, and Served Static Assets
│   ├── index.html                # Main unified Watchtower SPA dashboard
│   ├── server.js                 # Frontend reverse proxy server (port 5000 -> 3000)
│   ├── nine-rule-qa-widget.js    # Universal importable 9-Rule QA widget
│   ├── demo-import.html          # Drop-in importable widget demo page
│   ├── package.json              # Standalone frontend scripts
│   └── README.md                 # Frontend documentation
│
├── backend/                      # Backend services, APIs & data persistence layer
│   ├── server.js                 # Primary API server entrypoint (port 3000)
│   ├── router.js                 # Router definitions
│   ├── agent.js                  # Agent execution harness
│   ├── src/                      # Modular domain services (quality, monitoring, mcp, registry)
│   ├── scripts/                  # Operational utilities (e.g. sync_persistence_bundle.js)
│   ├── package.json              # Backend dependencies & scripts
│   ├── .env.example              # Environment variables template
│   └── README.md                 # Backend documentation
│
├── packages/                     # Portable, self-contained packages
│   └── agent-nine-rules/         # Portable 9-Rule QA engine & MCP server
│       ├── NineRuleEvaluator.js  # Core 9-rule evaluation engine
│       ├── index.html            # Zero-dependency standalone GUI scanner
│       ├── index.js              # Node.js library entrypoint (evaluateCode, evaluateAgent)
│       ├── cli.js                # Terminal CLI agent code scanner
│       ├── mcp-server.js         # Model Context Protocol (MCP) server
│       ├── mcp/                  # MCP server tool bindings
│       ├── rules/                # Canonical 9 rules implementations
│       ├── express-middleware.js # Drop-in Express compliance routes
│       ├── nine-rule-qa-widget.js# Universal drop-in web component widget
│       ├── INTEGRATION_GUIDE.md  # Step-by-step external integration guide
│       ├── INTEGRATION_PROMPTS.md# AI assistant copy-paste integration prompts
│       ├── package.json          # Module manifest
│       └── README.md             # Package documentation
│
├── docs/                         # Platform architecture, handoff guides & reports
│   ├── ARCHITECTURE.md           # Full architecture and organization guide
│   ├── INTEGRATION_GUIDE.md      # Portable integration instructions
│   ├── INTEGRATION_PROMPTS.md    # AI prompts for agent integration
│   ├── Agent_Watchtower_Final_Handoff_and_Features.md
│   └── Agent_Watchtower_Why_418_Are_REVIEW.md
│
├── start_servers.js              # One-command dual-server launcher
├── package.json                  # Root orchestration scripts
├── .gitignore                    # Git exclusions
├── .env.example                  # Root environment template
└── README.md                     # Main repository documentation
```

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `backend/.env` (or `.env` in root):
```bash
cp .env.example backend/.env
```

### 3. Run Application (Frontend + Backend)
```bash
# Launch both backend (port 3000) and frontend proxy (port 5000)
npm run start:all
```
- **Web Dashboard**: [http://localhost:5000](http://localhost:5000) (or direct API on [http://localhost:3000](http://localhost:3000))
- **Widget Demo**: [http://localhost:5000/demo-import.html](http://localhost:5000/demo-import.html)
- **REST API**: [http://localhost:3000/api/v1/systems](http://localhost:3000/api/v1/systems)

### 4. Run Standalone 9-Rule Scanner
Open `packages/agent-nine-rules/index.html` directly in any web browser with zero server setup.

### 5. Open Bidirectional MCP (Model Context Protocol) Server & Client
Agent Watchtower supports full two-way data interoperability over the standard Model Context Protocol (JSON-RPC 2.0 / 2024-11-05):

#### Way 1: Watchtower as MCP Server (Share Data to Other Web Apps & AI)
- **HTTP JSON-RPC 2.0 Endpoints**: `http://localhost:5000/api/v1/mcp` (Frontend proxy) and `http://localhost:3000/api/v1/mcp` (Core API)
- **SSE Stream**: `http://localhost:5000/api/v1/mcp/sse` and `http://localhost:3000/api/v1/mcp/sse`
- **Exposed Inbound Tools**:
  - `get_platform_overview`: Global platform metrics, uptime, healthy agents count
  - `get_registered_agents`: Query fleet agent registry by keyword, userId, firmId
  - `get_agent_details`: Detailed profile, runtime configuration, and live health
  - `get_agent_telemetry`: Latency, request counts, and uptime metrics
  - `get_compliance_history`: 9-rule compliance evaluations and audit history
  - `verify_agent_nine_rules`: Audit agent code or URLs against the 9 autonomous criteria
  - `trigger_agent_health_check`: Probe live agent endpoints and return latency
  - `share_data_to_watchtower`: Ingest telemetry, logs, or audit records pushed from external web apps
  - `register_external_agent`: Onboard external agents directly via MCP
- **MCP Resources & Prompts**: `mcp://watchtower/fleet/summary`, `mcp://watchtower/health`, `mcp://watchtower/compliance/rules`

#### Way 2: Watchtower as MCP Client (Ask & Take Data from Other Web Apps)
- **Outbound Bridge REST API**:
  - `POST /api/v1/mcp/external/fetch-data`: Query and retrieve structured data from external applications
  - `POST /api/v1/mcp/external/dispatch-task`: Send computational tasks and receive execution receipts
  - `POST /api/v1/mcp/external/execute`: Invoke any custom tool on an external MCP server
  - `POST /api/v1/mcp/external/discover`: Auto-discover tools and capabilities on external web apps
  - `POST /api/v1/mcp/external/test-connection`: Test latency and connectivity to external MCP endpoints
- **Built-in Mock External Web App Simulator**: `http://localhost:5000/api/v1/mcp/mock-external-app`
  - Simulates an external enterprise partner web app exposing users, billing invoices, warehouse inventory, and task processing.
- **Data Ingestion & Real-Time Audit Log**:
  - `POST /api/v1/mcp/share-data` & `GET /api/v1/mcp/shared-data`: Ingest and inspect external data
  - `GET /api/v1/mcp/history` & `DELETE /api/v1/mcp/history`: Real-time bidirectional data exchange audit trail
- **Dedicated Web Dashboard UI**:
  - Click **🔌 Bidirectional MCP Hub** in the dashboard sidebar to explore the live interactive client, inbound simulator, exchange log, and copy-paste code snippets for Claude Desktop, Cursor, Python, Node.js, and cURL.

#### Way 3: 9-Rule Scanner for Web Apps & Agents over MCP
Agent Watchtower allows auditing any external web app or AI agent against the 9 standard autonomous agent rules directly via Model Context Protocol:
- **Dedicated MCP Tools**:
  - `verify_agent_nine_rules`: Unified multi-modal tool supporting remote MCP servers, live web app URLs, code snippets, or agent candidate specs.
  - `scan_web_app_nine_rules`: Probes live HTTP web application endpoints (status, latency, server headers) and audits compliance across all 9 rules.
  - `scan_external_app_via_mcp`: Connects to an external application's MCP endpoint, auto-discovers tools, resources, and reasoning capabilities, and generates a complete 9-rule audit report.
- **Dedicated Public REST Gateway**:
  - `POST /api/v1/mcp/scan-app` (alias `POST /api/v1/mcp/scan`): Zero-auth open scanner returning structured 9-rule compliance score, rule-by-rule statuses (`PASS`, `FAIL`, `UNKNOWN`), empirical evidence, and remediation actions.
- **Interactive UI Integration**:
  - **Verification Hub** (`🛡️ 9-Rule QA` tab): Switch mode to `🔌 External App via MCP` with quick presets and connection prober.
  - **Bidirectional MCP Hub** (`🔌 MCP Hub` tab -> `🛡️ 9-Rule Scanner` sub-tab): Live probe latency, discover tools, scan, and inspect the interactive 9-rule visual deck.

