/**
 * Phase 34 — Expected vs Actual Analyzer
 * Compares the expected outcome (decision / simulation / plan) against the
 * actual outcome (execution + health + incident + verification) as factual
 * differences. Never assigns arbitrary scores.
 */

class ExpectedVsActualAnalyzer {
    compareExpectedVsActual({ adaptivePlan, outcomeAnalysis, tenantId = 'default-tenant' } = {}) {
        const expected = adaptivePlan ? adaptivePlan.expectedOutcome : null;
        const differences = [];

        if (!expected) {
            differences.push({ dimension: 'EXPECTED_OUTCOME', expected: 'not recorded', actual: 'not evaluated', difference: 'INSUFFICIENT_DATA: no expected outcome was recorded at plan time.', classification: 'INSUFFICIENT_DATA' });
        }
        if (!outcomeAnalysis || outcomeAnalysis.verificationState === 'INSUFFICIENT_DATA') {
            differences.push({ dimension: 'ACTUAL_OUTCOME', expected: expected ? (expected.summary || expected.outcomeState) : 'not recorded', actual: 'not established', difference: 'INSUFFICIENT_DATA: verification could not establish an actual outcome.', classification: 'INSUFFICIENT_DATA' });
            return { comparedAt: new Date().toISOString(), tenantId, expected, actual: outcomeAnalysis || null, differences, matchAssessment: 'UNABLE_TO_COMPARE' };
        }

        const expState = expected.outcomeState || expected.summary || 'unknown expectation';
        const actState = outcomeAnalysis.verificationState;
        const actSummary = outcomeAnalysis.summary;

        // Dimension: recovery expectation
        const recoveryWords = /recover|healthy|restore/i;
        if (recoveryWords.test(JSON.stringify(expected))) {
            if (actState === 'VERIFIED_RECOVERED') {
                differences.push({ dimension: 'RECOVERY', expected: String(expState).slice(0, 200), actual: actSummary, difference: 'MATCHED: recovery expected and recovery observed (verified).', classification: 'CONFIRMED' });
            } else {
                differences.push({ dimension: 'RECOVERY', expected: String(expState).slice(0, 200), actual: actSummary, difference: `DIFFERED: recovery expected but actual state is ${actState}.`, classification: 'OBSERVED' });
            }
        }

        // Dimension: latency expectation (informational; analyzers report only recorded latency)
        const pre = outcomeAnalysis.preState || {};
        const post = outcomeAnalysis.postState || {};
        if (pre.lastLatencyMs !== undefined && post.lastLatencyMs !== undefined) {
            const delta = post.lastLatencyMs - pre.lastLatencyMs;
            differences.push({
                dimension: 'LATENCY',
                expected: 'improvement where latency was elevated',
                actual: `pre ${pre.lastLatencyMs}ms → post ${post.lastLatencyMs}ms (observed)`,
                difference: delta < 0 ? 'IMPROVED: latency decreased.' : (delta === 0 ? 'UNCHANGED: latency identical.' : 'WORSENED: latency increased.'),
                classification: 'OBSERVED'
            });
        }

        // Dimension: incident / scope expectation
        differences.push({
            dimension: 'SCOPE',
            expected: expected.note || 'contained impact',
            actual: `post state ${post.currentState || 'unknown'} for scope`,
            difference: (actState === 'VERIFIED_RECOVERED') ? 'MATCHED: scope restored as expected.' : `OPEN: actual scope state is ${post.currentState || 'unknown'}; see verification.`,
            classification: 'OBSERVED'
        });

        if (differences.length === 0) {
            differences.push({ dimension: 'GENERAL', expected: String(expState).slice(0, 200), actual: actSummary, difference: 'Recorded without a matching expectation dimension; kept as observed fact.', classification: 'OBSERVED' });
        }

        const matched = differences.filter(d => d.difference.startsWith('MATCHED')).length;
        const differed = differences.filter(d => d.difference.startsWith('DIFFERED') || d.difference.startsWith('WORSENED')).length;
        const matchAssessment = differed > 0 ? 'DIFFERED' : (matched > 0 ? 'MATCHED' : 'MIXED_OR_OPEN');

        return { comparedAt: new Date().toISOString(), tenantId, expected, actual: outcomeAnalysis, differences, matchAssessment };
    }
}

module.exports = { ExpectedVsActualAnalyzer };
