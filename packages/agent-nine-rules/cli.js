#!/usr/bin/env node
/**
 * 9 Core Autonomous Agent Rules Scanner — CLI Tool
 * Fast, standalone CLI to evaluate any agent source code, contract, or live link against the 9 rules.
 *
 * Usage:
 *   node cli.js ./path/to/agent.js
 *   node cli.js --url https://my-agent.com
 *   node cli.js --contract ./contract.json
 *   node cli.js --help
 */

const fs = require('fs');
const path = require('path');
const { NineRuleEvaluator, evaluateCode, evaluateLink, STANDARD_RULES_SPEC } = require('./index');

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
🛡️ 9 Core Autonomous Agent Rules Scanner CLI

Usage:
  node cli.js <file-path>                 Scan a source file (.js, .ts, .py, .json, .html)
  node cli.js --url <endpoint-url>        Scan a live agent URL or endpoint
  node cli.js --contract <contract.json>  Scan an agent contract specification JSON
  node cli.js --rules                     List all 9 canonical rules & weights

Examples:
  node cli.js ./server/agent.js
  node cli.js --url http://localhost:8000/agent
  node cli.js --contract ./agent-contract.json
`);
    process.exit(0);
}

if (args.includes('--rules')) {
    console.log('\n📜 Canonical 9 Autonomous Agent Rules:\n');
    STANDARD_RULES_SPEC.forEach(r => {
        console.log(`  Rule ${r.ruleNumber}: ${r.name.padEnd(30)} [${r.category}] Weight: ${r.weight}pts`);
        console.log(`          ${r.description}\n`);
    });
    process.exit(0);
}

const evaluator = new NineRuleEvaluator();
let report = null;

try {
    if (args[0] === '--url' || args[0] === '-u') {
        const url = args[1];
        if (!url) {
            console.error('❌ Error: Missing URL after --url parameter');
            process.exit(1);
        }
        console.log(`\n🔍 Scanning Agent Endpoint: ${url}...`);
        report = evaluator.evaluateLink(url);
    } else if (args[0] === '--contract' || args[0] === '-c') {
        const filePath = path.resolve(args[1]);
        if (!fs.existsSync(filePath)) {
            console.error(`❌ Error: Contract file not found: ${filePath}`);
            process.exit(1);
        }
        const content = fs.readFileSync(filePath, 'utf8');
        const contract = JSON.parse(content);
        console.log(`\n🔍 Scanning Agent Contract: ${path.basename(filePath)}...`);
        report = evaluator.scan(contract);
    } else {
        // Collect positional file/folder targets
        const targets = args.filter(a => !a.startsWith('-'));
        if (targets.length === 0) {
            console.error('❌ Error: No file or directory specified.');
            process.exit(1);
        }

        const validExts = ['.js', '.jsx', '.ts', '.tsx', '.py', '.html', '.json', '.vue', '.mjs', '.cjs'];
        const ignoredDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.vscode', 'coverage', '.cache']);

        const collectedFiles = [];

        function walkDir(dirPath, rootDir) {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (!ignoredDirs.has(entry.name)) {
                        walkDir(path.join(dirPath, entry.name), rootDir);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (validExts.includes(ext) && !entry.name.endsWith('.lock') && entry.name !== 'package-lock.json') {
                        const fullPath = path.join(dirPath, entry.name);
                        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
                        try {
                            const stat = fs.statSync(fullPath);
                            if (stat.size <= 2 * 1024 * 1024) { // <= 2MB
                                const content = fs.readFileSync(fullPath, 'utf8');
                                collectedFiles.push({
                                    name: entry.name,
                                    path: relPath,
                                    content: content
                                });
                            }
                        } catch (e) {}
                    }
                }
            }
        }

        for (const target of targets) {
            const resolved = path.resolve(target);
            if (!fs.existsSync(resolved)) {
                console.error(`❌ Error: Target path not found: ${resolved}`);
                process.exit(1);
            }
            const stat = fs.statSync(resolved);
            if (stat.isDirectory()) {
                walkDir(resolved, resolved);
            } else {
                const ext = path.extname(resolved).toLowerCase();
                const content = fs.readFileSync(resolved, 'utf8');
                collectedFiles.push({
                    name: path.basename(resolved),
                    path: path.basename(resolved),
                    content: content
                });
            }
        }

        if (collectedFiles.length === 0) {
            console.error('❌ Error: No valid code files found to scan.');
            process.exit(1);
        }

        if (collectedFiles.length === 1 && !fs.statSync(path.resolve(targets[0])).isDirectory()) {
            const file = collectedFiles[0];
            console.log(`\n🔍 Scanning Single Agent Code File: ${file.name} (${(file.content.length / 1024).toFixed(1)} KB)...`);
            report = evaluator.evaluateCode(file.content, { fileName: file.name, name: file.name.replace(/\.[^.]+$/, '') });
        } else {
            const targetName = path.basename(path.resolve(targets[0])) || 'Project';
            console.log(`\n🔍 Scanning Full Project (${collectedFiles.length} files across Frontend/Backend) in: ${targetName}...`);
            report = evaluator.scan({
                name: `Project: ${targetName}`,
                isProject: true,
                files: collectedFiles
            });
        }
    }
} catch (err) {
    console.error('❌ Evaluation Error:', err.message);
    process.exit(1);
}

// Print Rich Formatted Terminal Report
const score = report.complianceScore;
const statusIcon = score === 100 ? '✅' : (score >= 60 ? '⚠️' : '❌');
const recColor = report.recommendation === 'KEEP' ? '\x1b[32m' : (report.recommendation === 'REVIEW' ? '\x1b[33m' : '\x1b[31m');
const resetColor = '\x1b[0m';

console.log('\n===============================================================');
console.log(` 🛡️ 9-RULE COMPLIANCE AUDIT REPORT`);
console.log(` Target:         ${report.agentName}`);
console.log(` Score:          ${score}% (${report.rulesFollowedCount}/9 Rules Passed)`);
console.log(` Status:         ${statusIcon} ${report.status}`);
console.log(` Recommendation: ${recColor}${report.recommendation}${resetColor}`);
console.log('===============================================================\n');

console.log('📋 Individual 9-Rule Criteria:\n');
report.rules.forEach(r => {
    const icon = r.status === 'PASS' ? '✅ PASS' : (r.status === 'UNKNOWN' ? '❓ UNKN' : '❌ FAIL');
    console.log(` [${icon}] Rule ${r.ruleNumber}: ${r.name} (${r.weight} pts)`);
    console.log(`        Evidence:    ${r.evidence || 'No empirical evidence detected.'}`);
    if (r.remediation && r.status !== 'PASS') {
        console.log(`        Remediation: ${r.remediation}`);
    }
    console.log('');
});

console.log('===============================================================');
if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
}
