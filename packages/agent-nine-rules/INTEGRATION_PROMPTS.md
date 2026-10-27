# 🤖 AI Integration Prompts for `nine-rule-scanner`

> **Copy and paste any of the prompts below into your AI assistant** (Antigravity, Cursor, Claude, ChatGPT, GitHub Copilot) whenever you copy this `nine-rule-scanner` folder into a new application.

---

## 📋 Prompt 1: Full Application Integration (Recommended)
Use this prompt when you paste `nine-rule-scanner` into any application and want the AI to wire it up to both the backend and frontend:

```text
I have copied the self-contained `nine-rule-scanner` folder into this project.

Please inspect `nine-rule-scanner/` and integrate it into our application:
1. Backend:
   - Mount `nine-rule-scanner/express-middleware.js` to an Express/Fastify/Node.js route (e.g., `/api/scan-compliance` or `/api/nine-rules`).
   - If our app creates or runs agents/services, call `evaluateCode()` or `evaluateAgent()` from `nine-rule-scanner/index.js` to automatically verify agent compliance before execution.
2. Frontend:
   - Add a "🛡️ Scan Agent (9 Rules)" button or verification tab in our dashboard/UI.
   - When clicked, display the 9-rule audit report with the 3x3 rule matrix, score (0-100%), and KEEP/REVIEW/RETIRE recommendations.
3. CLI & Testing:
   - Test scanning our primary agent file(s) using `node nine-rule-scanner/cli.js <path-to-agent-file>` and report the findings.
```

---

## 🏢 Prompt 2: Tailoring to a Specific Domain (e.g. Real Estate, Finance, Support)
Use this prompt if you want the scanner to adapt its vocabulary or add domain-specific rules:

```text
I have added `nine-rule-scanner` to this project. Our application is a [Domain: e.g. Real Estate CRM / Financial Portfolio / E-commerce Support] platform.

Please customize the 9-rule scanner for our domain:
1. In `NineRuleEvaluator.js` or via `evaluator.addRule()`, adapt the keywords and evidence extractors so they recognize our specific domain logic (e.g., property inquiries, MLS listings, site visits, transactions).
2. Optionally add Rule #10: "[Domain Rule: e.g. Regulatory Compliance / Fair Housing / Payment Safety]" with custom weight and verification logic.
3. Provide a test script showing how our domain agent is audited against all rules.
```

---

## 🎨 Prompt 3: React / Next.js / Vue / SPA Frontend Widget
Use this prompt to build a native React, Vue, or Tailwind component using the scanner engine:

```text
I have `nine-rule-scanner/` in our project. Please create a native [React/Next.js/Vue] component `NineRuleScannerWidget`:
1. Include file drag-and-drop, code paste textarea, and URL input.
2. Call `nine-rule-scanner/index.js` (or our backend proxy endpoint) to compute compliance.
3. Render the 3x3 interactive card grid with status pills (PASS/FAIL/UNKNOWN), evidence notes, score banner, and export button.
4. Match our existing application's design system and styling.
```

---

## 🧪 Prompt 4: Automated CI/CD Pre-Deployment Audit
Use this prompt to ensure no agent code is deployed unless it passes the 9 rules:

```text
Add an automated pre-deployment check using `nine-rule-scanner/cli.js`:
1. Add an npm script `"audit:agents": "node ./nine-rule-scanner/cli.js ./src/agents"` in `package.json`.
2. Configure it so that any agent with a score below 80% or missing core rules (Goal, AI Reasoning, Actions, Loop) triggers an alert or fails the build.
```
