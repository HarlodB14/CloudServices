const jwt = require('jsonwebtoken');

function normalizeUser(req, source = {}) {
    const existing = req.user || {};
    const roles = source.userRoles || source.roles || req.userRoles || existing.userRoles || existing.roles || [];
    const permissions = source.userPermissions || source.permissions || req.userPermissions || existing.userPermissions || existing.permissions || [];
    const userId = source.userId || req.userId || existing.userId || existing.id;
    const email = source.userEmail || source.email || req.userEmail || existing.userEmail || existing.email;
    const name = source.userName || source.name || req.userName || existing.userName || existing.name;

    req.user = {
        ...existing,
        ...(source || {}),
        userId,
        email,
        name,
        userRoles: roles,
        userPermissions: permissions,
        // Backward compatibility for existing code paths
        roles,
        permissions
    };

    req.userId = userId;
    req.userEmail = email;
    req.userName = name;
    req.userRoles = roles;
    req.userPermissions = permissions;
    req.isAdmin = roles.includes('admin');
}

function toStringArray(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry).trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
        return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }

    return [];
}

/**
 * Build internal identity headers for service-to-service HTTP calls.
 * Useful for background jobs that run without an incoming Express request.
 */
function buildIdentityHeaders(identity = {}) {
    const {
        userId,
        email,
        name,
        roles = [],
        permissions = [],
        contentType = 'application/json'
    } = identity;

    const headers = {};

    if (contentType) {
        headers['Content-Type'] = contentType;
    }

    if (userId) {
        headers['X-User-Id'] = String(userId);
    }

    if (email) {
        headers['X-User-Email'] = String(email);
    }

    if (name) {
        headers['X-User-Name'] = String(name);
    }

    headers['X-User-Roles'] = toStringArray(roles).join(',');
    headers['X-User-Permissions'] = toStringArray(permissions).join(',');

    return headers;
}

/**
 * Verify JWT token from Authorization header (Bearer TOKEN)
 * Used at entry points to validate token signature and extract user info
 */
function verifyTokenFromHeader() {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            normalizeUser(req, decoded);
            next();
        } catch (error) {
            console.error('Token verification failed:', error.message);
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            }
            return res.status(403).json({ error: 'Invalid token' });
        }
    };
}

/**
 * Verify user identity from X-headers (set by API Gateway)
 * Used in microservices when gateway has already validated the token
 * Falls back to JWT decoding if headers are missing
 */
function verifyTokenFromXHeaders() {
    return (req, res, next) => {
        let userId = req.headers['x-user-id'];
        let userEmail = req.headers['x-user-email'];
        let userName = req.headers['x-user-name'];
        let userRoles = (req.headers['x-user-roles'] || '').split(',').filter(Boolean) || [];
        let userPermissions = (req.headers['x-user-permissions'] || '').split(',').filter(Boolean) || [];

        // Fallback: decode JWT if headers missing
        if (!userId) {
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];

            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    userId = decoded.userId;
                    userEmail = decoded.email;
                    userName = decoded.name;
                    userRoles = decoded.roles || [];
                    userPermissions = decoded.permissions || [];
                } catch (error) {
                    // Ignore JWT errors here, check userId below
                }
            }
        }

        if (!userId) {
            return res.status(401).json({ error: 'User ID not provided' });
        }

        normalizeUser(req, { userId, email: userEmail, name: userName, roles: userRoles, permissions: userPermissions });

        next();
    };
}

/**
 * Extract user identity trying multiple sources
 * Priority: X-headers → Authorization JWT → error
 * Most defensive approach for internal microservices
 */
function verifyIdentity() {
    return verifyTokenFromXHeaders(); // Same implementation - headers first, JWT fallback
}

/**
 * Check if user has specific role
 */
function requireRole(allowedRoles = []) {
    return (req, res, next) => {
        const userRoles = req.userRoles || (req.user && req.user.userRoles) || (req.user && req.user.roles) || [];
        if (!req.user || userRoles.length === 0) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const hasRole = allowedRoles.length === 0 ||
            allowedRoles.some(role => userRoles.includes(role));

        if (!hasRole) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `Requires one of: ${allowedRoles.join(', ')}`
            });
        }

        next();
    };
}

/**
 * Check if user has specific permission
 */
function requirePermission(permission) {
    return (req, res, next) => {
        const permissions = req.userPermissions || (req.user && req.user.userPermissions) || (req.user && req.user.permissions) || [];
        if (!req.user || permissions.length === 0) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        if (!permissions.includes(permission)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `This action requires '${permission}' permission`
            });
        }

        next();
    };
}

/**
 * Check if user has participant role (convenience wrapper)
 */
function requireParticipant(req, res, next) {
    const roles = req.userRoles || (req.user && req.user.userRoles) || (req.user && req.user.roles) || [];
    const permissions = req.userPermissions || (req.user && req.user.userPermissions) || (req.user && req.user.permissions) || [];
    if (!req.user || (!roles.includes('participant') && !permissions.includes('upload:submission'))) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Must be a participant to perform this action'
        });
    }
    next();
}

/**
 * Check if user has target_owner role (convenience wrapper)
 */
function requireTargetOwner(req, res, next) {
    const roles = req.userRoles || (req.user && req.user.userRoles) || (req.user && req.user.roles) || [];
    const permissions = req.userPermissions || (req.user && req.user.userPermissions) || (req.user && req.user.permissions) || [];
    if (!req.user || (!roles.includes('target_owner') && !permissions.includes('create:target'))) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Must be a target owner to perform this action'
        });
    }
    next();
}

/**
 * Check if user is admin (convenience wrapper)
 */
function requireAdmin(req, res, next) {
    const roles = req.userRoles || (req.user && req.user.userRoles) || (req.user && req.user.roles) || [];
    if (!req.user || !roles.includes('admin')) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Admin access required'
        });
    }
    next();
}

/**
 * Helper: Check if userId matches resource owner or user is admin
 * Used in controllers to verify CRUD ownership
 */
function checkOwnership(resourceOwnerId, userId, userRoles) {
    const isAdmin = userRoles.includes('admin');
    const isOwner = resourceOwnerId.toString() === userId;
    return isAdmin || isOwner;
}

module.exports = {
    // Token verification
    verifyTokenFromHeader,
    verifyTokenFromXHeaders,
    verifyIdentity,

    // Role/permission checks
    requireRole,
    requirePermission,

    // Convenience wrappers
    requireParticipant,
    requireTargetOwner,
    requireAdmin,

    // Helper utilities
    checkOwnership,
    buildIdentityHeaders
};