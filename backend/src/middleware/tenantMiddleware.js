/**
 * Multi-Tenant Isolation Middleware & Context Provider
 * Resolves tenant identity from trusted headers/auth context, attaches tenantContext,
 * and enforces cross-tenant query boundaries.
 */

const DEFAULT_TENANT = 'default-tenant';

function tenantMiddleware(options = {}) {
    const strictMode = options.strict || false;

    return (req, res, next) => {
        const headerTenant = req.headers['x-tenant-id'];
        const authTenant = req.user ? req.user.tenantId : null;

        const tenantId = headerTenant || authTenant || DEFAULT_TENANT;

        req.tenantContext = {
            tenantId,
            resourceId: req.params.id || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (strictMode && headerTenant && authTenant && headerTenant !== authTenant) {
            return res.status(403).json({
                success: false,
                error: `Forbidden: Tenant mismatch between token (${authTenant}) and header (${headerTenant})`,
                code: 'TENANT_MISMATCH'
            });
        }

        next();
    };
}

/**
 * Validate that a target resource belongs to the request tenant context.
 */
function hasTenantAccess(req, resourceTenantId) {
    if (!resourceTenantId) return true; // Default shared or unassigned resource
    const requestTenantId = req.tenantContext ? req.tenantContext.tenantId : (req.headers['x-tenant-id'] || DEFAULT_TENANT);
    return requestTenantId === resourceTenantId;
}

/**
 * Enforce tenant access check on a resource.
 */
function enforceTenantAccess(resourceTenantId) {
    return (req, res, next) => {
        if (!hasTenantAccess(req, resourceTenantId)) {
            return res.status(403).json({
                success: false,
                error: `Forbidden: Access denied to resource belonging to tenant '${resourceTenantId}'`,
                code: 'TENANT_ACCESS_DENIED'
            });
        }
        next();
    };
}

module.exports = {
    DEFAULT_TENANT,
    tenantMiddleware,
    hasTenantAccess,
    enforceTenantAccess
};
