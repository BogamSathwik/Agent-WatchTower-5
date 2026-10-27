# 🛡️ 9 Core Autonomous Agent Rules Scanner
> **Portable, zero-dependency Quality Assurance and Compliance Verification tool for Autonomous AI Agents and Web Applications.**

This package can be used either as a **standalone single file** or as a **portable folder** that you can copy and paste into any project (such as Express, React, Vite, Node.js, Python, or standalone HTML).

---

## 📦 What is Included?

| File / Folder | Purpose |
| :--- | :--- |
| **`nine-rule-qa-widget.js`** | **Universal Drop-In Frontend Widget**. Import into any web app via `<script>` or `<nine-rules-qa>` tag with full UI, 4 dynamic metric cards, and live evaluators. |
| **`index.html`** | **Zero-Dependency Standalone GUI**. Double-click to open in any web browser. Has an embedded evaluation engine with file dropzone, code editor, 3x3 rule matrix, scorecards, and JSON export. |
| **`cli.js`** | **Terminal Command Line Interface**. Run `node cli.js ./my-agent.js` to scan any file and get terminal audit reports. |
| **`express-middleware.js`** | **Drop-in Express Router**. Add compliance scanning endpoints to your backend in 2 lines of code. |
| **`index.js`** | **Node.js Library**. Import `evaluateCode()`, `evaluateLink()`, or `NineRuleEvaluator` directly into your JS/TS code. |
| **`mcp-server.js`** & **`mcp/`** | **Model Context Protocol (MCP) Server**. Enables LLMs & agent frameworks to invoke 9-rule compliance tools. |
| **`rules/`** & **`NineRuleEvaluator.js`** | Full canonical 9-rule evaluation engine (pure JavaScript, zero npm dependencies). |
| **`INTEGRATION_GUIDE.md`** | **Complete Portable Integration Guide**. Step-by-step instructions for copying and deploying to any project or framework. |
| **`INTEGRATION_PROMPTS.md`** | **Ready-to-Use AI Prompts**. Copy-paste prompts to instruct any AI assistant to instantly integrate this scanner into a new application. |

---

## 🚀 4 Ways to Use This Scanner

### Option 1: As a Standalone Web App (No Installation, No Server)
- Simply double-click **`index.html`** inside this folder to open it in Chrome, Edge, Safari, or Firefox.
- **You can email or send this single `.html` file to anyone.**
- It runs 100% locally in the browser with:
  - **Dynamic 4-Category Overview Cards**: Real-time statistics for **Total Verifications Run**, **Fully Compliant (9/9)**, **Partially Compliant**, and **Non-Compliant / Missing**.
  - **Interactive Audit Explorer**: Click any card to instantly filter audits, inspect successful vs deficient agents, and see the **"What is What"** 9-criteria checklist.
  - Drag-and-drop file upload (`.js`, `.ts`, `.py`, `.json`, `.html`, etc.).
  - Paste code / contract editor.
  - URL scanner.
  - Interactive 9-rule manual checklist.
  - Real-time 3x3 empirical findings matrix and KEEP/REVIEW/RETIRE recommendations.
  - Audit history, search, and JSON export.

---

### Option 2: Command Line (CLI) in Terminal
Run audits directly on your project files from your terminal:

```bash
# Scan a source code file (Node.js, TypeScript, Python, etc.)
node cli.js ./server/services/dealService.js

# Scan an agent contract specification (JSON)
node cli.js --contract ./agent-contract.json

# Scan a live agent endpoint or web app
node cli.js --url https://api.myagent.com/v1/agent

# View all 9 canonical rules and weight points
node cli.js --rules
```

---

### Option 3: In Your Node.js / JavaScript / TypeScript Code
Copy this folder into your application (e.g. `./nine-rule-scanner/`):

```javascript
const { evaluateCode, evaluateLink, evaluateAgent } = require('./nine-rule-scanner');

// 1. Scan source code string
const report = evaluateCode(agentSourceCode, { fileName: 'dealService.js' });

console.log(`Compliance Score: ${report.complianceScore}%`);
console.log(`Status: ${report.status}`); // COMPLIANT | PARTIALLY_COMPLIANT | NON_COMPLIANT
console.log(`Recommendation: ${report.recommendation}`); // KEEP | REVIEW | RETIRE

// 2. Scan an agent endpoint URL
const linkReport = evaluateLink('https://my-agent.com/api', { model: 'gpt-4o' });
```

---

### Option 4: As an Express Backend API Route
Add the scanner endpoint to any existing Express server in two lines:

```javascript
const express = require('express');
const app = express();

app.use(express.json({ limit: '10mb' }));

// Mount the 9-Rule Scanner router
app.use('/api/scan-compliance', require('./nine-rule-scanner/express-middleware'));

app.listen(3000, () => console.log('Server running with 9-Rule Scanner API mounted'));
```

**Endpoints provided:**
- `POST /api/scan-compliance`: Evaluates file content, URL, or JSON contract.
- `GET /api/scan-compliance/rules`: Returns all 9 rule specifications.

---

## 📋 The 9 Autonomous Agent Rules

| # | Rule Name | Category | Weight | Description |
| :-: | :--- | :--- | :-: | :--- |
| **1** | **Goal / Objective** | Core | 15 pts | Agent defines an explicit mission, purpose, or intended outcome. |
| **2** | **AI / LLM Reasoning** | Core | 15 pts | Agent uses cognitive AI reasoning, chain of thought, prompts, or semantic inference. |
| **3** | **Action-Taking** | Core | 12 pts | Agent can execute operations, mutate state, invoke APIs, or trigger changes. |
| **4** | **Tool Calling** | Usually | 10 pts | Agent integrates external tools, function calls, REST APIs, or MCP servers. |
| **5** | **Autonomous Decision** | Core | 12 pts | Agent evaluates conditions and decides actions without continuous human puppeteering. |
| **6** | **Execution Loop** | Core | 12 pts | Agent runs a cognitive or execution loop (e.g., Plan → Act → Observe → Iterate). |
| **7** | **Environment Context** | Core | 10 pts | Agent maintains perception, session history, memory, or state context. |
| **8** | **Observation of Results** | Core | 12 pts | Agent inspects execution output, verifies responses, and handles feedback. |
| **9** | **Adaptation & Replanning**| Characteristic | 10 pts | Agent retries on failure, activates fallback runners, or replans when encountering errors. |

---

## 💡 Lifecycle Decision Benchmarks
- **KEEP (Score ≥ 90%)**: Fully verified autonomous agent. Approved for production.
- **REVIEW (Score 60% – 89%)**: Missing non-critical telemetry or specifications. More evidence recommended.
- **RETIRE (Score < 60% or Critical Violations)**: Missing fundamental autonomous criteria. Recommended for remediation or replacement.
