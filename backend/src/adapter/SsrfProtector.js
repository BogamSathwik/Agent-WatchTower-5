/**
 * SSRF Protector
 * Security utility preventing Server-Side Request Forgery (SSRF) attacks.
 * Validates external endpoints before outbound network requests.
 */

const { URL } = require('url');

const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'localhost.localdomain',
    'broadcasthost',
    'loopback',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '169.254.169.254', // AWS / GCP / Azure Instance Metadata endpoint
    'metadata.google.internal'
]);

class SsrfProtector {
    /**
     * Check whether an IP string falls into private/reserved IPv4 ranges.
     */
    static isPrivateIp(ip) {
        if (!ip || typeof ip !== 'string') return false;

        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some(isNaN)) return false;

        // 127.0.0.0/8 (Loopback)
        if (parts[0] === 127) return true;

        // 10.0.0.0/8 (Private)
        if (parts[0] === 10) return true;

        // 172.16.0.0/12 (Private)
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

        // 192.168.0.0/16 (Private)
        if (parts[0] === 192 && parts[1] === 168) return true;

        // 169.254.0.0/16 (Link-Local / Cloud Metadata)
        if (parts[0] === 169 && parts[1] === 254) return true;

        // 0.0.0.0/8 (Current network)
        if (parts[0] === 0) return true;

        return false;
    }

    /**
     * Validate an target URL for SSRF vulnerabilities.
     * @param {string} urlString 
     * @param {Object} options - { allowLocalhost: boolean }
     * @returns {Object} { safe: boolean, error?: string, url?: URL }
     */
    static validateUrl(urlString, options = {}) {
        if (!urlString || typeof urlString !== 'string') {
            return { safe: false, error: 'URL must be a non-empty string' };
        }

        try {
            const parsed = new URL(urlString.trim());

            // 1. Protocol check
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return {
                    safe: false,
                    error: `Forbidden protocol '${parsed.protocol}'. Only http: and https: are allowed`
                };
            }

            const hostname = parsed.hostname.toLowerCase();

            // 2. Localhost / Metadata hostname check (unless explicit testing override)
            if (!options.allowLocalhost) {
                if (BLOCKED_HOSTNAMES.has(hostname)) {
                    return {
                        safe: false,
                        error: `Access to target host '${hostname}' is blocked due to SSRF protection rules`
                    };
                }

                // 3. Private IP check
                if (this.isPrivateIp(hostname)) {
                    return {
                        safe: false,
                        error: `Access to private IP address '${hostname}' is blocked due to SSRF protection rules`
                    };
                }
            }

            return {
                safe: true,
                url: parsed
            };
        } catch (err) {
            return {
                safe: false,
                error: `Malformed target URL: ${err.message}`
            };
        }
    }
}

module.exports = {
    SsrfProtector
};
