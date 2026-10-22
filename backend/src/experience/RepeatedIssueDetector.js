/**
 * Repeated Issue Detector
 * Deterministic signature-based grouping engine for identifying repeated operational issue reports.
 * Purely domain-agnostic - zero AI/LLM inference.
 */

class RepeatedIssueDetector {
    /**
     * Group an array of ClientIssue objects by deterministic signature.
     * @param {Array<ClientIssue>} issues 
     * @returns {Array<Object>} Grouped repeated issue summaries
     */
    static detectRepeatedIssues(issues = []) {
        if (!Array.isArray(issues) || issues.length === 0) {
            return [];
        }

        const groups = new Map();

        issues.forEach(issue => {
            const sig = issue.signature || `${issue.systemId}:${issue.category}:${issue.description.substring(0, 30)}`;
            if (!groups.has(sig)) {
                groups.set(sig, []);
            }
            groups.get(sig).push(issue);
        });

        const result = [];
        for (const [sig, items] of groups.entries()) {
            if (items.length > 1) {
                const sorted = [...items].sort((a, b) => new Date(a.reportedAt) - new Date(b.reportedAt));
                result.push({
                    groupSignature: sig,
                    systemId: sorted[0].systemId,
                    category: sorted[0].category,
                    sampleDescription: sorted[0].description,
                    issueCount: sorted.length,
                    issues: sorted.map(i => typeof i.toJSON === 'function' ? i.toJSON() : i),
                    firstReportedAt: sorted[0].reportedAt,
                    lastReportedAt: sorted[sorted.length - 1].reportedAt
                });
            }
        }

        return result.sort((a, b) => b.issueCount - a.issueCount);
    }
}

module.exports = {
    RepeatedIssueDetector
};
