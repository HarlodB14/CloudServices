const jwt = require('jsonwebtoken');

/**
 * Verify JWT token from Authorization header
 * Extracts token and validates it
 */
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach user info to request
        next();
    } catch (error) {
        console.error('Token verification failed:', error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
}

/**
 * Check if user can participate in competitions
 * Participants need the "upload:submission" permission
 */
function requireParticipant(req, res, next) {
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('upload:submission')) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'You must be registered as a participant to perform this action'
        });
    }
    next();
}

/**
 * Check if user can create/manage targets
 * Target owners need the "create:target" permission
 */
function requireTargetOwner(req, res, next) {
    if (!req.user || !req.user.permissions || !req.user.permissions.includes('create:target')) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'You must be registered as a target owner to create targets'
        });
    }
    next();
}

/**
 * Check if user is admin
 */
function requireAdmin(req, res, next) {
    if (!req.user || !req.user.roles || !req.user.roles.includes('admin')) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'Admin access required'
        });
    }
    next();
}

/**
 * Check if user has specific permission
 * @param {string} permission - Permission to check
 */
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user || !req.user.permissions || !req.user.permissions.includes(permission)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: `This action requires '${permission}' permission`
            });
        }
        next();
    };
}

/**
 * Check if user has specific role
 * @param {Array<string>} allowedRoles - Roles allowed
 */
function requireRole(allowedRoles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const userRoles = req.user.roles || [];
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
 * Check if user can manage a specific resource (own target/submission)
 * Admins can manage all, owners can manage their own
 */
function canManageResource(ownerFieldName = 'ownerId') {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const isAdmin = req.user.roles && req.user.roles.includes('admin');
        const isOwner = req.body[ownerFieldName] === req.user.userId ||
            req.params[ownerFieldName] === req.user.userId;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only manage your own resources'
            });
        }

        next();
    };
}

module.exports = {
    verifyToken,
    requireParticipant,
    requireTargetOwner,
    requireAdmin,
    requirePermission,
    requireRole,
    canManageResource
};