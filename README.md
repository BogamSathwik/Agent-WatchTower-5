# Agent Watchtower — Universal Agent Observability Platform

Agent Watchtower is a centralized monitoring, evaluation, comparison, and intelligence platform for autonomous agents and agent-driven applications.

## Project Structure

```text
Agent-Watchtower/
├── frontend/                     # All Frontend UI components & assets
│   ├── index.html                # Single-Page Application (SPA) dashboard
│   ├── package.json              # Optional standalone frontend scripts
│   └── README.md                 # Frontend documentation
│
├── backend/                      # All Backend services, APIs & data layer
│   ├── server.js                 # Primary server entrypoint & consolidated bundle
│   ├── router.js                 # Router definitions
│   ├── agent.js                  # Agent execution harness
│   ├── src/                      # 311 modular services (monitoring, quality, mcp, etc.)
│   ├── scripts/                  # Operational & test scripts
│   ├── tests/                    # Automated test suites
│   ├── package.json              # Backend dependencies & scripts
│   ├── .env.example              # Environment variables template
│   └── README.md                 # Backend documentation
│
├── docs/                         # Architecture, evaluation & handoff guides
│   ├── Agent_Watchtower_Final_Handoff_and_Features.md
│   └── Agent_Watchtower_Why_418_Are_REVIEW.md
│
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
Copy `.env.example` to `backend/.env` (or `.env` in root) and set your database credentials:
```bash
cp .env.example backend/.env
```

### 3. Run Application (Frontend + Backend)
```bash
npm start
```
- **Web Dashboard**: [http://localhost:3000](http://localhost:3000)
- **REST API**: [http://localhost:3000/api/v1/systems](http://localhost:3000/api/v1/systems)

### 4. Run Tests
```bash
npm test
```
