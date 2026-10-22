# Agent Watchtower — Backend

This directory contains the core backend services, persistence adapters, monitoring schedulers, and REST API endpoints for **Agent Watchtower**.

## Key Files & Directories
- `server.js`: Server entrypoint and consolidated single-file execution bundle with built-in route handlers.
- `router.js`: Service router and endpoint dispatchers.
- `agent.js`: Agent runtime orchestrator.
- `src/`: Modular application layer (311 modular services across monitoring, quality, usage, intelligence, remediation, persistence, etc.).
- `scripts/`: Operational scripts and external agent test scripts.
- `tests/`: Automated unit and integration test suites.
- `.env`: Database credentials and configuration (do not commit).
- `.env.example`: Configuration template.

## Running the Backend

From the repository root:
```bash
npm start
```

Or from inside `backend/`:
```bash
npm install
npm start
```

The server listens on **`http://localhost:3000`** by default.
- REST API: `http://localhost:3000/api/v1/systems`
- Frontend UI: `http://localhost:3000/` (served from `../frontend/index.html`)

## Running Tests
```bash
npm test
```
