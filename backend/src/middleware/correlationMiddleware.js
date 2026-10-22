/**
 * Correlation ID Middleware
 * Assigns or propagates a unique correlation ID across request lifecycle.
 * Attaches req.correlationId and returns x-correlation-id in response header.
 */

const crypto = require('crypto');

function generateCorrelationId() {
    return `corr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function correlationMiddleware() {
    return (req, res, next) => {
        const headerId = req.headers['x-correlation-id'] || req.headers['x-request-id'];
        const correlationId = (headerId && typeof headerId === 'string' && headerId.trim())
            ? headerId.trim()
            : generateCorrelationId();

        req.correlationId = correlationId;
        res.setHeader('X-Correlation-ID', correlationId);

        next();
    };
}

module.exports = {
    correlationMiddleware,
    generateCorrelationId
};
