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
- **MCP Endpoint (JSON-RPC 2.0)**: `http://localhost:3000/api/v1/mcp` (or via Frontend proxy: `http://localhost:5000/api/v1/mcp`)
- **SSE Stream**: `http://localhost:3000/api/v1/mcp/sse`
- **Exposed Inbound Tools**: `verify_agent_nine_rules`, `get_registered_agents`, `get_agent_details`, `get_agent_telemetry`, `get_compliance_history`, `trigger_agent_health_check`
- **Exposed Outbound Bridge Tools**: `call_external_mcp_tool`, `dispatch_task_to_external_app`, `fetch_data_from_external_app`, `list_external_mcp_tools`
- **External Bridge REST API**: `POST /api/v1/mcp/external/execute`, `POST /api/v1/mcp/external/dispatch-task`, `POST /api/v1/mcp/external/fetch-data`, `POST /api/v1/mcp/external/discover`
- **Zero Auth / Open CORS**: Any external application or IDE (Cursor, Claude Desktop, Antigravity) can connect with zero authentication barriers.
