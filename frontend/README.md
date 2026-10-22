# Agent Watchtower — Frontend

This directory contains the user interface for **Agent Watchtower**.

## Structure
- `index.html`: The complete Single-Page Application (SPA) dashboard built with modern responsive CSS, interactive SVG telemetry, status metrics, and agent monitoring panels.

## How to Run

### Option 1: Via Unified Backend (Recommended)
From the project root or the `backend` folder:
```bash
npm start
```
The backend automatically serves this frontend at **`http://localhost:3000`**.

### Option 2: Standalone Static Server
You can open `index.html` directly in any modern browser, or run a local static server:
```bash
npx serve .
# or
python -m http.server 5000
```
Note: To view live agent data from the backend APIs, the backend server must be running on port 3000.
