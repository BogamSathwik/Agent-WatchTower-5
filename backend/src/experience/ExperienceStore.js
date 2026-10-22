/**
 * Experience Store
 * In-memory persistence store for client feedback, ratings, issues, and experience events.
 * Purely generic - zero business-domain logic.
 */

const { SystemRegistry } = require('../registry/SystemRegistry');
const { ClientExperienceEvent } = require('./ClientExperienceEvent');
const { ClientFeedback } = require('./ClientFeedback');
const { ClientIssue } = require('./ClientIssue');

class ExperienceStore {
    constructor(options = {}) {
        this.systemRegistry = options.systemRegistry || new SystemRegistry();
        this.feedbackMap = new Map(); // feedbackId -> ClientFeedback
        this.issueMap = new Map();    // issueId -> ClientIssue
        this.events = [];             // Chronological list of ClientExperienceEvents
    }

    // --- SYSTEM VALIDATION ---
    validateSystemId(systemId) {
        if (!systemId) return false;
        try {
            const sys = this.systemRegistry.getSystem(systemId);
            return Boolean(sys);
        } catch (e) {
            return false;
        }
    }

    // --- FEEDBACK & RATINGS ---
    recordFeedback(feedbackOrRaw) {
        let feedback;
        if (feedbackOrRaw instanceof ClientFeedback) {
            feedback = feedbackOrRaw;
        } else {
            feedback = new ClientFeedback(feedbackOrRaw);
        }

        this.feedbackMap.set(feedback.feedbackId, feedback);

        // Emit corresponding experience event
        this.recordEvent(new ClientExperienceEvent({
            systemId: feedback.systemId,
            clientId: feedback.clientId,
            actorId: feedback.actorId,
            eventType: 'FEEDBACK',
            timestamp: feedback.timestamp,
            source: feedback.source,
            rating: feedback.rating ? feedback.rating.value : null,
            comment: feedback.comment,
            category: feedback.category,
            tags: feedback.tags,
            metadata: feedback.metadata
        }));

        return feedback;
    }

    getFeedback(feedbackId) {
        if (!feedbackId) return null;
        return this.feedbackMap.get(String(feedbackId).trim()) || null;
    }

    listFeedback(filters = {}) {
        let list = Array.from(this.feedbackMap.values());

        if (filters.systemId) {
            const sid = String(filters.systemId).trim();
            list = list.filter(f => f.systemId === sid);
        }
        if (filters.clientId) {
            const cid = String(filters.clientId).trim();
            list = list.filter(f => f.clientId === cid);
        }
        if (filters.category) {
            const cat = String(filters.category).trim().toLowerCase();
            list = list.filter(f => f.category === cat);
        }
        if (filters.startTime) {
            const startMs = new Date(filters.startTime).getTime();
            list = list.filter(f => new Date(f.timestamp).getTime() >= startMs);
        }
        if (filters.endTime) {
            const endMs = new Date(filters.endTime).getTime();
            list = list.filter(f => new Date(f.timestamp).getTime() <= endMs);
        }

        const limit = Number(filters.limit) || 500;
        return list.slice(-limit);
    }

    getFeedbackBySystem(systemId, filters = {}) {
        return this.listFeedback({ ...filters, systemId });
    }

    getFeedbackByClient(clientId, filters = {}) {
        return this.listFeedback({ ...filters, clientId });
    }

    getFeedbackByTimeRange(startTime, endTime, filters = {}) {
        return this.listFeedback({ ...filters, startTime, endTime });
    }

    // --- CLIENT ISSUES ---
    createIssue(issueOrRaw) {
        let issue;
        if (issueOrRaw instanceof ClientIssue) {
            issue = issueOrRaw;
        } else {
            issue = new ClientIssue(issueOrRaw);
        }

        this.issueMap.set(issue.issueId, issue);

        // Record timeline event
        this.recordEvent(new ClientExperienceEvent({
            systemId: issue.systemId,
            clientId: issue.clientId,
            actorId: issue.reporter,
            eventType: 'ISSUE_REPORTED',
            timestamp: issue.reportedAt,
            source: issue.source,
            comment: issue.description,
            category: issue.category,
            severity: issue.severity,
            status: issue.status,
            issueId: issue.issueId,
            metadata: issue.metadata
        }));

        return issue;
    }

    getIssue(issueId) {
        if (!issueId) return null;
        return this.issueMap.get(String(issueId).trim()) || null;
    }

    updateIssue(issueId, updates = {}) {
        const existing = this.getIssue(issueId);
        if (!existing) return null;

        const prevStatus = existing.status;

        if (updates.status && updates.status !== prevStatus) {
            existing.transitionTo(updates.status, updates);
        } else {
            if (updates.resolution) existing.resolution = String(updates.resolution).trim();
            if (updates.assignee) existing.assignee = String(updates.assignee).trim();
            if (updates.severity) existing.severity = updates.severity;
            if (updates.metadata) Object.assign(existing.metadata, updates.metadata);
            existing.updatedAt = new Date().toISOString();
        }

        this.issueMap.set(existing.issueId, existing);

        // Record update event
        const eventType = existing.status === 'RESOLVED' ? 'ISSUE_RESOLVED' : 'ISSUE_UPDATED';
        this.recordEvent(new ClientExperienceEvent({
            systemId: existing.systemId,
            clientId: existing.clientId,
            actorId: updates.actorId || existing.assignee || 'system',
            eventType,
            timestamp: existing.updatedAt,
            source: existing.source,
            comment: updates.comment || existing.description,
            category: existing.category,
            severity: existing.severity,
            status: existing.status,
            issueId: existing.issueId,
            resolution: existing.resolution,
            resolvedAt: existing.resolvedAt,
            assignedTo: existing.assignee,
            metadata: existing.metadata
        }));

        return existing;
    }

    listIssues(filters = {}) {
        let list = Array.from(this.issueMap.values());

        if (filters.systemId) {
            const sid = String(filters.systemId).trim();
            list = list.filter(i => i.systemId === sid);
        }
        if (filters.clientId) {
            const cid = String(filters.clientId).trim();
            list = list.filter(i => i.clientId === cid);
        }
        if (filters.status) {
            const st = String(filters.status).trim().toUpperCase();
            list = list.filter(i => i.status === st);
        }
        if (filters.severity) {
            const sev = String(filters.severity).trim().toUpperCase();
            list = list.filter(i => i.severity === sev);
        }
        if (filters.category) {
            const cat = String(filters.category).trim().toLowerCase();
            list = list.filter(i => i.category === cat);
        }

        const limit = Number(filters.limit) || 500;
        return list.slice(-limit);
    }

    getIssuesBySystem(systemId, filters = {}) {
        return this.listIssues({ ...filters, systemId });
    }

    getIssuesByStatus(status, filters = {}) {
        return this.listIssues({ ...filters, status });
    }

    getIssuesBySeverity(severity, filters = {}) {
        return this.listIssues({ ...filters, severity });
    }

    getIssuesByClient(clientId, filters = {}) {
        return this.listIssues({ ...filters, clientId });
    }

    // --- EXPERIENCE EVENTS / TIMELINE ---
    recordEvent(eventOrRaw) {
        let event;
        if (eventOrRaw instanceof ClientExperienceEvent) {
            event = eventOrRaw;
        } else {
            event = new ClientExperienceEvent(eventOrRaw);
        }

        this.events.push(event);
        if (this.events.length > 5000) {
            this.events.shift();
        }
        return event;
    }

    listEvents(filters = {}) {
        let list = [...this.events];

        if (filters.systemId) {
            const sid = String(filters.systemId).trim();
            list = list.filter(e => e.systemId === sid);
        }
        if (filters.clientId) {
            const cid = String(filters.clientId).trim();
            list = list.filter(e => e.clientId === cid);
        }
        if (filters.eventType) {
            const et = String(filters.eventType).trim().toUpperCase();
            list = list.filter(e => e.eventType === et);
        }
        if (filters.startTime) {
            const startMs = new Date(filters.startTime).getTime();
            list = list.filter(e => new Date(e.timestamp).getTime() >= startMs);
        }
        if (filters.endTime) {
            const endMs = new Date(filters.endTime).getTime();
            list = list.filter(e => new Date(e.timestamp).getTime() <= endMs);
        }

        const limit = Number(filters.limit) || 500;
        return list.slice(-limit);
    }

    getEventsBySystem(systemId, filters = {}) {
        return this.listEvents({ ...filters, systemId });
    }

    getEventsByClient(clientId, filters = {}) {
        return this.listEvents({ ...filters, clientId });
    }

    clear() {
        this.feedbackMap.clear();
        this.issueMap.clear();
        this.events = [];
    }
}

module.exports = {
    ExperienceStore
};
