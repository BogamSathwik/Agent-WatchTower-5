/**
 * Notification Provider Registry
 * Manager for registering, listing, and retrieving notification channel providers.
 * Purely domain-agnostic.
 */

const {
    InAppNotificationProvider,
    WebhookNotificationProvider,
    MockNotificationProvider
} = require('./NotificationChannel');

class NotificationProviderRegistry {
    constructor() {
        this.providers = new Map();

        // Register default initial providers
        this.register(new InAppNotificationProvider('in_app'));
        this.register(new WebhookNotificationProvider('webhook'));
        this.register(new MockNotificationProvider('mock'));
    }

    register(provider) {
        if (!provider || !provider.id) {
            throw new Error('Provider must have a valid id');
        }
        this.providers.set(provider.id, provider);
        return provider;
    }

    get(providerId) {
        return this.providers.get(providerId) || null;
    }

    list() {
        return Array.from(this.providers.values()).map(p => ({
            id: p.id,
            type: p.type,
            config: p.config
        }));
    }

    remove(providerId) {
        return this.providers.delete(providerId);
    }

    clear() {
        this.providers.clear();
    }
}

module.exports = NotificationProviderRegistry;
