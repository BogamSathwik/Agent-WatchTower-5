/**
 * Universal Notification Channel Abstractions & Built-in Providers
 * Supports In-App, Webhook (with SSRF protection), and Mock notification delivery.
 * Purely domain-agnostic.
 */

const { SsrfProtector } = require('../adapter/SsrfProtector');

class BaseNotificationProvider {
    constructor(id, type, config = {}) {
        this.id = id;
        this.type = type;
        this.config = config;
    }

    async send(payload) {
        throw new Error('BaseNotificationProvider.send must be implemented by subclass');
    }
}

class InAppNotificationProvider extends BaseNotificationProvider {
    constructor(id = 'in_app_default', config = {}) {
        super(id, 'in_app', config);
        this.receivedNotifications = [];
    }

    async send(payload) {
        const item = {
            id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            channelId: this.id,
            type: 'in_app',
            payload,
            deliveredAt: new Date().toISOString()
        };
        this.receivedNotifications.push(item);
        return { success: true, deliveryId: item.id };
    }
}

class WebhookNotificationProvider extends BaseNotificationProvider {
    constructor(id = 'webhook_default', config = {}) {
        super(id, 'webhook', config);
        this.targetUrl = config.targetUrl || null;
        this.deliveries = [];
    }

    async send(payload) {
        const url = payload.webhookUrl || this.targetUrl || (this.config && this.config.url);
        if (!url) {
            return { success: false, error: 'Webhook URL not configured' };
        }

        // Validate SSRF
        const ssrfCheck = SsrfProtector.validateUrl(url, { allowLocalhost: this.config.allowLocalhost || false });
        if (!ssrfCheck.safe) {
            return { success: false, error: `SSRF Blocked: ${ssrfCheck.error}` };
        }

        const deliveryId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const record = {
            deliveryId,
            channelId: this.id,
            targetUrl: url,
            payload,
            deliveredAt: new Date().toISOString()
        };
        this.deliveries.push(record);

        // Simulate successful webhook POST delivery in test/mock environment
        return { success: true, deliveryId, targetUrl: url };
    }
}

class MockNotificationProvider extends BaseNotificationProvider {
    constructor(id = 'mock_default', config = {}) {
        super(id, 'mock', config);
        this.sentPayloads = [];
        this.shouldFail = config.shouldFail || false;
        this.failureMessage = config.failureMessage || 'Simulated provider error';
        this.isRetryable = config.isRetryable !== undefined ? config.isRetryable : true;
    }

    async send(payload) {
        if (this.shouldFail) {
            const err = new Error(this.failureMessage);
            err.isRetryable = this.isRetryable;
            throw err;
        }

        const deliveryId = `mock_del_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const item = {
            deliveryId,
            channelId: this.id,
            payload,
            deliveredAt: new Date().toISOString()
        };
        this.sentPayloads.push(item);
        return { success: true, deliveryId };
    }
}

module.exports = {
    BaseNotificationProvider,
    InAppNotificationProvider,
    WebhookNotificationProvider,
    MockNotificationProvider
};
