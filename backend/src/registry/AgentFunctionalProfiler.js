/**
 * Agent Functional Profiler — evidence-based functional fingerprinting and
 * comparison of AGENT_MASTER_REGISTRY records.
 *
 * HARD CONSTRAINTS:
 * - NAME SIMILARITY ≠ FUNCTIONAL SIMILARITY. Agent names are supporting
 *   metadata only; the fingerprint (domains, tokens, category, observed
 *   interfaces) drives grouping. Identical generic names like "index"
 *   carry zero signal.
 * - No invented purpose: groups emerge from shared evidence (domains mapped
 *   from actually observed registry vocabulary, overlapping tokens, same
 *   category, matching observed interfaces). Thin-evidence records stay
 *   UNCLASSIFIED; uncertain pairs stay INSUFFICIENT_EVIDENCE.
 * - No V1/V2/V3 invention: dates/filenames alone never create successor or
 *   duplicate claims. POTENTIAL_DUPLICATE needs near-identical fingerprints
 *   plus converging evidence; POSSIBLE_SUCCESSOR needs same author plus a
 *   live-replaces-unreachable pattern, always LOW confidence.
 * - Pure computation over already-available data (registry rows, stored
 *   evaluations, monitoring snapshots). No external probing, no writes.
 * - Identity (masterId/userId/firmId) is preserved on every output.
 */

const crypto = require('crypto');

// Domain vocabulary grounded in actually observed registry records
// (career/internship, hotel, msme-credit-risk, fitness, scraping,
// book-tracking, marketing, sql-data, news, documents, startups...).
// Groups EMERGE where records share a domain; the lexicon itself creates
// no groups and no records.
const DOMAIN_LEXICON = Object.freeze({
    CAREER: { display: 'Career & Employment', tokens: ['career', 'job', 'jobs', 'internship', 'resume', 'employment', 'recruitment', 'hiring', 'interview', 'placement', 'cv'] },
    HOTEL_TRAVEL: { display: 'Hotel & Travel', tokens: ['hotel', 'travel', 'trip', 'booking', 'flight', 'tourism', 'hospitality'] },
    FINANCE: { display: 'Finance & Risk', tokens: ['credit', 'risk', 'msme', 'loan', 'finance', 'banking', 'investment', 'investor', 'insurance', 'budget', 'forecaster', 'forecast'] },
    FITNESS: { display: 'Fitness & Health', tokens: ['fitlife', 'fitness', 'health', 'diet', 'workout', 'nutrition', 'yoga', 'wellness'] },
    SCRAPING: { display: 'Web Scraping', tokens: ['scraping', 'scraper', 'scrape', 'crawler', 'crawling', 'spider'] },
    BOOKS: { display: 'Books & Library', tokens: ['book', 'books', 'isbn', 'library', 'reading', 'booktracker'] },
    MARKETING: { display: 'Marketing & Content', tokens: ['marketing', 'seo', 'social', 'media', 'content', 'brand', 'advertisement', 'ads'] },
    DATA_SQL: { display: 'Data & SQL', tokens: ['sql', 'data', 'database', 'query', 'dataset', 'analytics'] },
    NEWS: { display: 'News', tokens: ['news', 'headline', 'headlines'] },
    DOCUMENTS: { display: 'Documents', tokens: ['document', 'documents', 'pdf', 'invoice', 'docs'] },
    STARTUP: { display: 'Startups & Business', tokens: ['startup', 'startups', 'business', 'venture', 'enterprise'] },
    MONITORING_OPS: { display: 'Monitoring & Tracking', tokens: ['monitoring', 'monitor', 'tracking', 'tracker', 'uptime', 'alerting', 'observability'] },
    CONVERSATION: { display: 'Conversation', tokens: ['chat', 'chatbot', 'conversation', 'assistant'] }
});

// Generic tokens that carry no functional signal on their own.
const STOP_TOKENS = new Set([
    'agent', 'agents', 'ai', 'app', 'application', 'index', 'system', 'systems',
    'test', 'testing', 'fixed', 'final', 'new', 'old', 'pro', 'v1', 'v2', 'v3',
    'html', 'htm', 'js', 'css', 'the', 'a', 'an', 'and', 'or', 'for', 'with',
    '2026', '2025', '2024', 'portal', 'dashboard', 'page', 'site', 'web', 'tool',
    'platform', 'digital', 'smart', 'auto', 'aiv1'
]);

const RELATIONS = Object.freeze({
    FUNCTIONALLY_SIMILAR: 'FUNCTIONALLY_SIMILAR',
    POTENTIAL_DUPLICATE: 'POTENTIAL_DUPLICATE',
    POTENTIAL_VARIANT: 'POTENTIAL_VARIANT',
    POSSIBLE_SUCCESSOR: 'POSSIBLE_SUCCESSOR',
    UNRELATED: 'UNRELATED',
    INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE'
});

const CONFIDENCE = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' });

// Explainable weights. Name identity is capped supporting evidence, never
// the primary driver: domain + tokens + category + interface dominate.
const WEIGHTS = Object.freeze({
    sharedDomain: 0.40,
    tokenJaccard: 0.20,
    identicalName: 0.30,
    sameCategory: 0.15,
    sameContentType: 0.05,
    capabilityOverlap: 0.10,
    sameFileSize: 0.10,
    sameAuthor: 0.05
});

const THRESHOLDS = Object.freeze({
    duplicate: 0.90,
    similar: 0.60
});

function normalizeText(value) {
    return String(value || '').toLowerCase();
}

// Split identifiers into cleaned functional tokens: drops extensions,
// date/version stamps, pure numbers, and generic stopwords.
function tokenize(name, filename) {
    const out = new Set();
    for (const raw of [name, filename]) {
        if (!raw) continue;
        const withoutExt = String(raw).replace(/\.[a-z0-9]{1,8}$/i, '');
        for (const part of withoutExt.split(/[^a-z0-9]+/i)) {
            const t = part.toLowerCase();
            if (!t || STOP_TOKENS.has(t)) continue;
            if (/^\d+$/.test(t)) continue; // pure numbers (dates, counters)
            if (/^\d{6,}$/.test(t)) continue;
            if (t.length < 2) continue;
            out.add(t);
        }
    }
    return Array.from(out).sort();
}

function domainsForTokens(tokens) {
    const hits = [];
    for (const [domain, def] of Object.entries(DOMAIN_LEXICON)) {
        const matched = (tokens || []).filter((t) => def.tokens.includes(t));
        if (matched.length > 0) hits.push({ domain, display: def.display, matched: matched.sort() });
    }
    return hits.sort((a, b) => a.domain.localeCompare(b.domain));
}

function jaccard(a, b) {
    const setA = new Set(a || []);
    const setB = new Set(b || []);
    if (setA.size === 0 && setB.size === 0) return 0;
    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter += 1;
    return inter / (setA.size + setB.size - inter);
}

function contentTypeClass(contentType) {
    const ct = normalizeText(contentType);
    if (!ct) return null;
    if (ct.includes('json')) return 'json-api';
    if (ct.includes('html')) return 'html-page';
    return 'other';
}

function stableHash(text) {
    return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 8);
}

/**
 * Build a functional fingerprint from a master evaluation-style record plus
 * an optional stored evaluation (capabilities/interface) — registry data
 * only, no probing.
 */
function fingerprintRecord(record, storedEvaluation) {
    const evalRec = storedEvaluation || null;
    const tokens = tokenize(record.agentName, record.filename);
    const domains = domainsForTokens(tokens);
    const capabilities = (evalRec && Array.isArray(evalRec.capabilities))
        ? evalRec.capabilities.map((c) => String((c && (c.id || c.name)) || c).toLowerCase()).filter(Boolean).sort()
        : [];
    return {
        masterId: record.masterId,
        userId: record.userId,
        firmId: record.firmId,
        agentName: record.agentName || null,
        category: record.category || null,
        tokens,
        domains: domains.map((d) => d.domain),
        domainDetail: domains,
        capabilityIds: capabilities,
        contentTypeClass: (evalRec && evalRec.reachability) ? contentTypeClass(evalRec.reachability.contentType) : null,
        agentType: (evalRec && evalRec.agentType) || null,
        evaluated: Boolean(evalRec),
        reachable: Boolean(evalRec && evalRec.reachability && evalRec.reachability.reachable),
        runtimeHealth: (evalRec && evalRec.runtimeHealth && evalRec.runtimeHealth.state) || null,
        hasBackend: record.hasBackend,
        fileSizeKb: (record.fileSizeKb !== null && record.fileSizeKb !== undefined) ? Number(record.fileSizeKb) : null,
        recordKind: record.recordKind || null
    };
}

function fingerprintThin(fp) {
    // Thin = no domain signal, at most one token, no observed interface.
    return fp.domains.length === 0 && fp.tokens.length <= 1 && fp.capabilityIds.length === 0 && !fp.contentTypeClass;
}

/**
 * Compare two fingerprints. Returns { relation, score, confidence, reasons[] }.
 * Score is capped at 1.0 and every point is explained in reasons[].
 */
function comparePair(fpA, fpB) {
    const reasons = [];
    let score = 0;

    const sharedDomains = (fpA.domains || []).filter((d) => (fpB.domains || []).includes(d));
    if (sharedDomains.length > 0) {
        score += WEIGHTS.sharedDomain;
        const names = sharedDomains.map((d) => DOMAIN_LEXICON[d].display).join(', ');
        reasons.push(`shared functional domain: ${names}`);
    }

    const tokenJ = jaccard(fpA.tokens, fpB.tokens);
    if (tokenJ > 0) {
        const shared = fpA.tokens.filter((t) => fpB.tokens.includes(t)).sort();
        score += tokenJ * WEIGHTS.tokenJaccard;
        reasons.push(`overlapping functional tokens (${shared.join(', ')})`);
    }

    const nameA = normalizeText(fpA.agentName);
    const nameB = normalizeText(fpB.agentName);
    if (nameA && nameB && nameA === nameB && (fpA.tokens.length > 0 || fpB.tokens.length > 0)) {
        score += WEIGHTS.identicalName;
        reasons.push('identical agent name (supporting signal only)');
    }

    if (fpA.category && fpB.category && normalizeText(fpA.category) === normalizeText(fpB.category)) {
        score += WEIGHTS.sameCategory;
        reasons.push(`same registry category '${fpA.category}'`);
    }

    if (fpA.contentTypeClass && fpB.contentTypeClass) {
        if (fpA.contentTypeClass === fpB.contentTypeClass) {
            score += WEIGHTS.sameContentType;
            reasons.push(`same observed interface shape (${fpA.contentTypeClass})`);
        }
        const capJ = jaccard(fpA.capabilityIds, fpB.capabilityIds);
        if (capJ > 0) {
            const sharedCaps = fpA.capabilityIds.filter((c) => fpB.capabilityIds.includes(c));
            score += capJ * WEIGHTS.capabilityOverlap;
            reasons.push(`overlapping discovered capabilities (${sharedCaps.join(', ')})`);
        }
    }

    if (fpA.fileSizeKb !== null && fpB.fileSizeKb !== null && fpA.fileSizeKb > 0 && fpA.fileSizeKb === fpB.fileSizeKb) {
        score += WEIGHTS.sameFileSize;
        reasons.push(`identical file size (${fpA.fileSizeKb} KB)`);
    }

    if (fpA.userId !== null && fpA.userId !== undefined && fpA.userId === fpB.userId) {
        score += WEIGHTS.sameAuthor;
        reasons.push('same contributing user (tie-break signal only)');
    }

    score = Math.min(1, Math.round(score * 100) / 100);

    const thinA = fingerprintThin(fpA);
    const thinB = fingerprintThin(fpB);
    if ((thinA || thinB) && score < THRESHOLDS.similar) {
        return {
            relation: RELATIONS.INSUFFICIENT_EVIDENCE,
            score,
            confidence: CONFIDENCE.LOW,
            reasons: [...reasons, 'at least one side has too little functional evidence to judge']
        };
    }

    if (score >= THRESHOLDS.duplicate) {
        const authorA = fpA.userId;
        const authorB = fpB.userId;
        if (authorA !== null && authorA !== undefined && authorB !== null && authorB !== undefined && authorA !== authorB) {
            // Identical fingerprints from different contributors: strong
            // functional similarity, but exact-duplicate is never claimed
            // across authors without deeper evidence.
            return {
                relation: RELATIONS.FUNCTIONALLY_SIMILAR,
                score,
                confidence: CONFIDENCE.HIGH,
                reasons: [...reasons, 'near-identical fingerprints but different contributors; exact-duplicate not claimed']
            };
        }
        return {
            relation: RELATIONS.POTENTIAL_DUPLICATE,
            score,
            confidence: CONFIDENCE.HIGH,
            reasons: [...reasons, 'near-identical functional fingerprints with converging evidence']
        };
    }
    if (score >= THRESHOLDS.similar) {
        return {
            relation: RELATIONS.FUNCTIONALLY_SIMILAR,
            score,
            confidence: score >= 0.78 ? CONFIDENCE.HIGH : (score >= 0.64 ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW),
            reasons
        };
    }

    // Same author iterating on one purpose: variant pattern (never version proof).
    if (fpA.userId !== null && fpA.userId !== undefined && fpA.userId === fpB.userId && (tokenJ >= 0.3 || (nameA && nameA === nameB))) {
        return {
            relation: RELATIONS.POTENTIAL_VARIANT,
            score,
            confidence: CONFIDENCE.LOW,
            reasons: [...reasons, 'same author with overlapping purpose tokens; version/order NOT inferred']
        };
    }

    // Successor needs a live-replaces-unreachable pattern on top of near-
    // identical purpose — dates/filenames alone never qualify.
    if (fpA.userId !== null && fpA.userId !== undefined && fpA.userId === fpB.userId && tokenJ >= 0.8) {
        const aLive = fpA.reachable && fpA.runtimeHealth !== 'OFFLINE' && fpA.runtimeHealth !== 'UNHEALTHY';
        const bLive = fpB.reachable && fpB.runtimeHealth !== 'OFFLINE' && fpB.runtimeHealth !== 'UNHEALTHY';
        if ((aLive && !fpB.reachable) || (bLive && !fpA.reachable)) {
            return {
                relation: RELATIONS.POSSIBLE_SUCCESSOR,
                score,
                confidence: CONFIDENCE.LOW,
                reasons: [...reasons, 'same author, near-identical purpose, one side live while the other is unreachable']
            };
        }
    }

    if (thinA && thinB) {
        return { relation: RELATIONS.INSUFFICIENT_EVIDENCE, score, confidence: CONFIDENCE.LOW, reasons: [...reasons, 'both sides lack functional evidence'] };
    }
    return { relation: RELATIONS.UNRELATED, score, confidence: score >= 0.4 ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW, reasons: reasons.length > 0 ? reasons : ['no shared functional evidence'] };
}

const GROUP_EDGE_RELATIONS = new Set([
    RELATIONS.FUNCTIONALLY_SIMILAR,
    RELATIONS.POTENTIAL_DUPLICATE,
    RELATIONS.POTENTIAL_VARIANT,
    RELATIONS.POSSIBLE_SUCCESSOR
]);

/**
 * Cluster fingerprints into functional groups (union-find over grouping
 * edges). Only CANDIDATE_AGENT records participate; everything else is
 * reported UNCLASSIFIED with an explicit reason.
 */
function groupFingerprints(fingerprints) {
    const candidates = (fingerprints || []).filter((fp) => fp && fp.masterId !== null && fp.masterId !== undefined);
    const inScope = [];
    const unclassified = [];
    for (const fp of candidates) {
        if (fp.recordKind && fp.recordKind !== 'CANDIDATE_AGENT') {
            unclassified.push({ masterId: fp.masterId, userId: fp.userId, firmId: fp.firmId, reason: `record kind ${fp.recordKind} is not grouped` });
        } else {
            inScope.push(fp);
        }
    }

    const parent = new Map(inScope.map((fp) => [fp.masterId, fp.masterId]));
    const find = (x) => {
        let root = x;
        while (parent.get(root) !== root) root = parent.get(root);
        let cur = x;
        while (parent.get(cur) !== root) {
            const nxt = parent.get(cur);
            parent.set(cur, root);
            cur = nxt;
        }
        return root;
    };
    const union = (a, b) => parent.set(find(a), find(b));

    const edgeScores = new Map(); // "idA|idB" -> {score, relation}
    for (let i = 0; i < inScope.length; i += 1) {
        for (let j = i + 1; j < inScope.length; j += 1) {
            const cmp = comparePair(inScope[i], inScope[j]);
            if (GROUP_EDGE_RELATIONS.has(cmp.relation)) {
                union(inScope[i].masterId, inScope[j].masterId);
                const key = [inScope[i].masterId, inScope[j].masterId].sort((a, b) => a - b).join('|');
                edgeScores.set(key, { score: cmp.score, relation: cmp.relation });
            }
        }
    }

    const clusters = new Map();
    for (const fp of inScope) {
        const root = find(fp.masterId);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root).push(fp);
    }

    const groups = [];
    for (const members of clusters.values()) {
        if (members.length < 2) {
            const solo = members[0];
            const reason = fingerprintThin(solo)
                ? 'too little functional evidence to group'
                : 'no sufficiently similar counterpart found';
            unclassified.push({ masterId: solo.masterId, userId: solo.userId, firmId: solo.firmId, reason });
            continue;
        }
        const ids = members.map((m) => m.masterId).sort((a, b) => a - b);
        const scores = [];
        let hasDuplicate = false;
        for (let i = 0; i < ids.length; i += 1) {
            for (let j = i + 1; j < ids.length; j += 1) {
                const edge = edgeScores.get(`${ids[i]}|${ids[j]}`);
                if (edge) {
                    scores.push(edge.score);
                    if (edge.relation === RELATIONS.POTENTIAL_DUPLICATE) hasDuplicate = true;
                }
            }
        }
        const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        const confidence = (hasDuplicate || (members.length >= 3 && avg >= 0.72))
            ? CONFIDENCE.HIGH
            : (avg >= 0.62 ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW);

        // Human-readable label from evidence: dominant shared domain plus
        // shared tokens and uniform category (never invented).
        const domainCounts = new Map();
        const tokenCounts = new Map();
        const categories = new Set();
        for (const m of members) {
            for (const d of (m.domains || [])) domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
            for (const t of (m.tokens || [])) tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
            if (m.category) categories.add(m.category);
        }
        const topDomain = Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1])[0];
        const topTokens = Array.from(tokenCounts.entries())
            .filter(([, n]) => n >= 2)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 3)
            .map(([t]) => t);
        const labelParts = [];
        if (topDomain && topDomain[1] >= 2) labelParts.push(DOMAIN_LEXICON[topDomain[0]].display);
        else labelParts.push('Shared purpose');
        if (topTokens.length > 0) labelParts.push(`(${topTokens.join(', ')})`);
        if (categories.size === 1) labelParts.push(`· ${Array.from(categories)[0]}`);

        const evidence = [];
        if (topDomain && topDomain[1] >= 2) evidence.push(`${topDomain[1]} of ${members.length} members share functional domain '${DOMAIN_LEXICON[topDomain[0]].display}'`);
        if (topTokens.length > 0) evidence.push(`recurring purpose tokens: ${topTokens.join(', ')}`);
        if (categories.size === 1) evidence.push(`uniform registry category '${Array.from(categories)[0]}'`);
        if (hasDuplicate) evidence.push('contains a potential-duplicate pair');
        evidence.push(`member pairwise similarity ${Math.round(avg * 100)}% on average`);

        groups.push({
            groupId: `fg-${stableHash(ids.join(','))}`,
            label: labelParts.join(' '),
            memberIds: ids,
            memberCount: members.length,
            confidence,
            averageScore: Math.round(avg * 100) / 100,
            evidence
        });
    }

    groups.sort((a, b) => b.memberCount - a.memberCount || a.label.localeCompare(b.label));
    unclassified.sort((a, b) => a.masterId - b.masterId);
    return { groups, unclassified };
}

module.exports = {
    AgentFunctionalProfiler: {
        tokenize,
        domainsForTokens,
        fingerprintRecord,
        comparePair,
        groupFingerprints
    },
    DOMAIN_LEXICON,
    RELATIONS,
    CONFIDENCE,
    WEIGHTS,
    THRESHOLDS
};
