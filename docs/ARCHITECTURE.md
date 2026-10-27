# Agent Watchtower — Architecture & Organization Guide

This document describes the clean, organized architectural layout of the **Agent Watchtower** platform.

---

## 🏛️ System Overview

Agent Watchtower is an enterprise-grade agent observability, monitoring, and 9-rule quality assurance platform. It consists of three decoupled, high-performance tiers:

1. **Frontend Tier (`frontend/`)**:
   - Modern, reactive Single-Page Application (SPA) dashboard.
   - Built-in reverse proxy on port `5000` mapping `/api/*` directly to the backend on port `3000`.
   - Standalone widget demo page (`demo-import.html`) for testing the embedded `<nine-rules-qa>` web component.

2. **Backend Tier (`backend/`)**:
   - High-throughput Express API engine on port `3000`.
   - Domain-driven modular services in `backend/src/`:
     - `registry/`: Agent Master Registry & functional profiler.
     - `quality/`: Quality evaluation engine & 9-rule compliance runner.
     - `monitoring/`: Real-time health, anomaly detection, early warning, and predictive intelligence.
     - `mcp/`: Model Context Protocol server registries and bridges.
     - `telemetry/`, `events/`, `decision/`, `remediation/`, `orchestration/`: Full-lifecycle agent operations.
   - Dual-mode persistence: in-memory state or transactional MySQL.

3. **Portable 9-Rule Engine (`packages/agent-nine-rules/`)**:
   - Standalone, zero-dependency autonomous agent quality assurance package.
   - Includes:
     - `index.html`: Standalone interactive browser GUI (drag-and-drop code/contract scanner, 3x3 rule matrix, metric overview cards).
     - `cli.js`: Terminal-based agent code/spec scanner.
     - `mcp-server.js`: Standard Model Context Protocol server for LLM tools.
     - `express-middleware.js`: Instant drop-in middleware for Node/Express apps.
     - `nine-rule-qa-widget.js`: Universal drop-in web component `<nine-rules-qa>`.
     - `rules/`: Canonical implementations of all 9 agent rules.

---

## 📂 Clean Directory Map

```text
Agent-Watchtower/
│
├── frontend/                     # Frontend UI & reverse proxy
│   ├── index.html                # Unified observability SPA dashboard
│   ├── server.js                 # Reverse proxy server (Port 5000 -> 3000)
│   ├── nine-rule-qa-widget.js    # Portable 9-rule QA web component
│   ├── demo-import.html          # Interactive widget demonstration page
│   ├── package.json              # Frontend scripts
│   └── README.md                 # Frontend documentation
│
├── backend/                      # Backend APIs & persistence
│   ├── server.js                 # API server entrypoint (Port 3000)
│   ├── router.js                 # Express router definitions
│   ├── agent.js                  # Rule-based agent execution harness
│   ├── src/                      # Modular domain micro-services
│   ├── scripts/                  # Operations & persistence sync utilities
│   ├── package.json              # Backend package manifest
│   ├── .env.example              # Environment variables template
│   └── README.md                 # Backend documentation
│
├── packages/                     # Self-contained modules
│   └── agent-nine-rules/         # Portable 9-Rule QA engine & MCP server
│       ├── NineRuleEvaluator.js  # Core rule evaluator
│       ├── index.html            # Zero-dependency browser GUI
│       ├── index.js              # Node.js library entrypoint
│       ├── cli.js                # Command line scanner
│       ├── mcp-server.js         # Model Context Protocol server
│       ├── mcp/                  # MCP server tools
│       ├── rules/                # 9 canonical rule implementations
│       ├── express-middleware.js # Express router middleware
│       ├── nine-rule-qa-widget.js# Portable web component
│       ├── INTEGRATION_GUIDE.md  # Portability integration guide
│       ├── INTEGRATION_PROMPTS.md# AI assistant prompt guides
│       ├── package.json          # Module manifest
│       └── README.md             # Package documentation
│
├── docs/                         # Platform documentation & handoff guides
│   ├── ARCHITECTURE.md           # This document
│   ├── INTEGRATION_GUIDE.md      # External app integration guide
│   ├── INTEGRATION_PROMPTS.md    # AI prompts for agent integration
│   ├── Agent_Watchtower_Final_Handoff_and_Features.md
│   └── Agent_Watchtower_Why_418_Are_REVIEW.md
│
├── start_servers.js              # Dual-server launcher (Frontend + Backend)
├── package.json                  # Root orchestration & scripts
├── .gitignore                    # Git exclusions
├── .env.example                  # Root environment template
└── README.md                     # Main repository guide
```

---

## 🚀 Running the System

- **Start All (Frontend + Backend)**:
  ```bash
  npm run start:all
  # or
  node start_servers.js
  ```
- **Start Backend Solo**:
  ```bash
  npm run start:backend
  ```
- **Start Frontend Solo**:
  ```bash
  npm run start:frontend
  ```
- **Open Dashboard**:
  Visit [http://localhost:5000](http://localhost:5000) (or direct API on [http://localhost:3000](http://localhost:3000)).
- **Open Widget Demo**:
  Visit [http://localhost:5000/demo-import.html](http://localhost:5000/demo-import.html).
- **Run Standalone 9-Rule GUI**:
  Double click `packages/agent-nine-rules/index.html` in any browser.
