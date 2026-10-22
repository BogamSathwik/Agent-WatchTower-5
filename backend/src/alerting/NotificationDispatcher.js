/**
 * Universal Notification Dispatcher
 * Dispatches alert notifications to registered channels according to policy thresholds, retries, and cooldowns.
 * Strips sensitive credentials from payloads and handles bounded retries.
 * Purely domain-agnostic.
 */

class NotificationDispatcher {
    constructor(registry, alertStore) {
        this.registry = registry;
        this.alertStore = alertStore;
        this.lastNotifiedMap = new Map(); // channelKey -> timestamp
    }

    /**
     * Dispatch alert notification through applicable policy channels.
     * @param {Alert} alert 
     * @param {Object} options 
     */
    async dispatch(alert, options = {}) {
        const policyId = options.policyId || (alert.metadata && alert.metadata.policyId) || 'default_policy';
        const policy = this.alertStore.getPolicy(policyId);

        if (!policy || !policy.enabled) {
            return { dispatched: false, reason: 'POLICY_DISABLED_OR_NOT_FOUND' };
        }

        if (!policy.shouldNotify(alert.severity)) {
            return { dispatched: false, reason: 'SEVERITY_BELOW_THRESHOLD' };
        }

        const sanitizedPayload = this.buildSanitizedPayload(alert, options);
        const results = [];

        for (const channelId of policy.channels) {
            const provider = this.registry.get(channelId);
            if (!provider) {
                results.push({ channelId, status: 'FAILED', error: `Provider ${channelId} not found` });
                continue;
            }

            const cooldownKey = `${alert.fingerprint}:${channelId}`;
            const lastNotified = this.lastNotifiedMap.get(cooldownKey);
            const now = Date.now();

            if (lastNotified && (now - lastNotified) < (policy.cooldownSeconds * 1000)) {
                results.push({
                    channelId,
                    status: 'SUPPRESSED',
                    reason: 'COOLDOWN_ACTIVE',
                    cooldownRemainingMs: (policy.cooldownSeconds * 1000) - (now - lastNotified)
                });
                continue;
            }

            // Attempt delivery with bounded retries
            const deliveryResult = await this.deliverWithRetry(provider, sanitizedPayload, policy.maxAttempts);

            if (deliveryResult.status === 'SENT') {
                this.lastNotifiedMap.set(cooldownKey, now);
            }

            this.alertStore.recordDelivery({
                alertId: alert.id,
                channelId,
                status: deliveryResult.status,
                attempts: deliveryResult.attempts,
                error: deliveryResult.error || null,
                deliveryId: deliveryResult.deliveryId || null
            });

            results.push({ channelId, ...deliveryResult });
        }

        const anySent = results.some(r => r.status === 'SENT');
        const anyFailed = results.some(r => r.status === 'FAILED' || r.status === 'EXHAUSTED');

        if (anySent) alert.notificationStatus = 'SENT';
        else if (anyFailed) alert.notificationStatus = 'FAILED';

        return { dispatched: true, results };
    }

    /**
     * Bounded retry loop for delivery attempts.
     */
    async deliverWithRetry(provider, payload, maxAttempts = 3) {
        let attempts = 0;
        let lastError = null;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                const res = await provider.send(payload);
                if (res.success) {
                    return { status: 'SENT', attempts, deliveryId: res.deliveryId };
                } else {
                    lastError = res.error || 'Delivery returned unsuccessful status';
                }
            } catch (err) {
                lastError = err.message || 'Delivery error';
                const isRetryable = err.isRetryable !== undefined ? err.isRetryable : true;
                if (!isRetryable) {
                    return { status: 'FAILED', attempts, error: lastError };
                }
            }
        }

        return { status: 'EXHAUSTED', attempts, error: lastError };
    }

    /**
     * Strip credentials, tokens, passwords, cookies, and secrets from notification payloads.
     */
    buildSanitizedPayload(alert, options = {}) {
        const raw = alert.toJSON ? alert.toJSON() : alert;

        const sanitizeObject = (obj) => {
            if (!obj || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(sanitizeObject);

            const safe = {};
            const FORBIDDEN_KEYS = ['password', 'token', 'secret', 'apikey', 'api_key', 'authorization', 'cookie', 'auth'];

            for (const [key, val] of Object.entries(obj)) {
                if (FORBIDDEN_KEYS.some(f => key.toLowerCase().includes(f))) {
                    safe[key] = '[REDACTED_CREDENTIAL]';
                } else if (typeof val === 'object' && val !== null) {
                    safe[key] = sanitizeObject(val);
                } else {
                    safe[key] = val;
                }
            }
            return safe;
        };

        return {
            alertId: raw.id,
            systemId: raw.systemId,
            source: raw.source,
            severity: raw.severity,
            status: raw.status,
            category: raw.category,
            title: raw.title,
            description: raw.description,
            firstDetectedAt: raw.firstDetectedAt,
            lastDetectedAt: raw.lastDetectedAt,
            occurrenceCount: raw.occurrenceCount,
            evidence: sanitizeObject(raw.evidence || []),
            metadata: sanitizeObject(raw.metadata || {}),
            dispatchedAt: new Date().toISOString()
        };
    }
}

module.exports = NotificationDispatcher;
