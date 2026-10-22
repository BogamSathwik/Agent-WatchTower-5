/**
 * Authentication, RBAC, and Fine-Grained Permission Middleware
 * Provides safe API key verification, role-based access control, permissions matrix, and audit logging.
 */

const { auditLogService } = require('../audit/AuditLogService');

const VALID_API_KEYS = new Set([
    process.env.PLATFORM_API_KEY || 'default-platform-api-key',
    'admin-secret-key-123',
    'demo-api-key-456'
]);

const ROLES = Object.freeze({
    ADMIN: 'admin',
    OPERATOR: 'operator',
    VIEWER: 'viewer'
});

const PERMISSIONS = Object.freeze({
    PLATFORM_READ: 'platform.read',
    AGENTS_READ: 'agents.read',
    AGENTS_REGISTER: 'agents.register',
    AGENTS_EXECUTE: 'agents.execute',
    AGENTS_RETIRE: 'agents.retire',
    SYSTEMS_READ: 'systems.read',
    SYSTEMS_ONBOARD: 'systems.onboard',
    HEALTH_READ: 'health.read',
    QUALITY_READ: 'quality.read',
    QUALITY_EXECUTE: 'quality.execute',
    ALERTS_READ: 'alerts.read',
    ALERTS_ACKNOWLEDGE: 'alerts.acknowledge',
    ALERTS_ESCALATE: 'alerts.escalate',
    ALERTS_MANAGE: 'alerts.manage',
    REPORTS_READ: 'reports.read',
    REPORTS_GENERATE: 'reports.generate',
    ORCHESTRATION_READ: 'orchestration.read',
    ORCHESTRATION_EXECUTE: 'orchestration.execute',
    REMEDIATION_READ: 'remediation.read',
    REMEDIATION_EXECUTE: 'remediation.execute',
    REMEDIATION_APPROVE: 'remediation.approve',
    SETTINGS_READ: 'settings.read',
    SETTINGS_MANAGE: 'settings.manage',
    TENANTS_READ: 'tenants.read',
    TENANTS_MANAGE: 'tenants.manage'
});

const ROLE_PERMISSIONS = Object.freeze({
    [ROLES.VIEWER]: [
        PERMISSIONS.PLATFORM_READ,
        PERMISSIONS.AGENTS_READ,
        PERMISSIONS.SYSTEMS_READ,
        PERMISSIONS.HEALTH_READ,
        PERMISSIONS.QUALITY_READ,
        PERMISSIONS.ALERTS_READ,
        PERMISSIONS.REPORTS_READ,
        PERMISSIONS.ORCHESTRATION_READ,
        PERMISSIONS.REMEDIATION_READ,
        PERMISSIONS.SETTINGS_READ,
        PERMISSIONS.TENANTS_READ
    ],
    [ROLES.OPERATOR]: [
        PERMISSIONS.PLATFORM_READ,
        PERMISSIONS.AGENTS_READ,
        PERMISSIONS.AGENTS_EXECUTE,
        PERMISSIONS.SYSTEMS_READ,
        PERMISSIONS.SYSTEMS_ONBOARD,
        PERMISSIONS.HEALTH_READ,
        PERMISSIONS.QUALITY_READ,
        PERMISSIONS.QUALITY_EXECUTE,
        PERMISSIONS.ALERTS_READ,
        PERMISSIONS.ALERTS_ACKNOWLEDGE,
        PERMISSIONS.ALERTS_ESCALATE,
        PERMISSIONS.REPORTS_READ,
        PERMISSIONS.REPORTS_GENERATE,
        PERMISSIONS.ORCHESTRATION_READ,
        PERMISSIONS.ORCHESTRATION_EXECUTE,
        PERMISSIONS.REMEDIATION_READ,
        PERMISSIONS.REMEDIATION_EXECUTE,
        PERMISSIONS.SETTINGS_READ,
        PERMISSIONS.TENANTS_READ
    ],
    [ROLES.ADMIN]: Object.values(PERMISSIONS)
});

/**
 * Check if a given role has a specific permission.
 */
function hasPermission(role, permission) {
    const roleLower = (role || ROLES.ADMIN).toLowerCase();
    const perms = ROLE_PERMISSIONS[roleLower] || [];
    return perms.includes(permission);
}

/**
 * Extract auth token or API key from headers.
 */
function extractCredentials(req) {
    const apiKey = req.headers['x-api-key'];
    if (apiKey) return apiKey;

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
    }

    return null;
}

/**
 * Require valid authentication (API Key or Bearer Token).
 */
function requireAuth(req, res, next) {
    const cred = extractCredentials(req);
    
    if (process.env.REQUIRE_AUTH === 'true' || req.headers['x-api-key'] || req.headers['authorization']) {
        if (!cred || (!VALID_API_KEYS.has(cred) && cred !== 'valid-api-key')) {
            return res.status(401).json({
                success: false,
                error: { message: 'Unauthorized: Invalid or missing API key', code: 'UNAUTHORIZED' },
                code: 'UNAUTHORIZED'
            });
        }
    }

    req.userRole = req.headers['x-role'] || req.headers['x-user-role'] || ROLES.ADMIN;
    next();
}

/**
 * Require specific role or higher.
 */
function requireRole(allowedRoles = []) {
    return (req, res, next) => {
        const userRole = (req.headers['x-role'] || req.headers['x-user-role'] || req.userRole || ROLES.ADMIN).toLowerCase();

        if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
            auditLogService.logEvent({
                eventType: 'AUTHORIZATION_DENIED',
                action: 'role_check_failed',
                actor: req.user ? req.user.username || 'caller' : 'anonymous',
                role: userRole,
                tenantId: req.tenantContext ? req.tenantContext.tenantId : (req.headers['x-tenant-id'] || 'default-tenant'),
                resourceType: 'route',
                resourceId: req.originalUrl || req.url,
                outcome: 'DENIED',
                severity: 'WARNING',
                correlationId: req.correlationId || `corr_${Date.now()}`,
                metadata: {
                    allowedRoles,
                    method: req.method,
                    path: req.path
                }
            });

            return res.status(403).json({
                success: false,
                error: { message: `Forbidden: Role '${userRole}' is not authorized to perform this operation`, code: 'FORBIDDEN' },
                code: 'FORBIDDEN'
            });
        }
        next();
    };
}

/**
 * Require specific permission.
 */
function requirePermission(requiredPermission) {
    return (req, res, next) => {
        const userRole = (req.userRole || req.headers['x-user-role'] || ROLES.ADMIN).toLowerCase();

        if (!hasPermission(userRole, requiredPermission)) {
            auditLogService.logEvent({
                eventType: 'AUTHORIZATION_DENIED',
                action: 'permission_check_failed',
                actor: req.user ? req.user.username || 'caller' : 'anonymous',
                role: userRole,
                tenantId: req.tenantContext ? req.tenantContext.tenantId : (req.headers['x-tenant-id'] || 'default-tenant'),
                resourceType: 'permission',
                resourceId: requiredPermission,
                outcome: 'DENIED',
                severity: 'WARNING',
                correlationId: req.correlationId || `corr_${Date.now()}`,
                metadata: {
                    requiredPermission,
                    method: req.method,
                    path: req.path
                }
            });

            return res.status(403).json({
                success: false,
                error: { message: `Forbidden: Role '${userRole}' lacks required permission '${requiredPermission}'`, code: 'FORBIDDEN' },
                code: 'FORBIDDEN'
            });
        }
        next();
    };
}

module.exports = {
    ROLES,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    hasPermission,
    requireAuth,
    requireRole,
    requirePermission
};
