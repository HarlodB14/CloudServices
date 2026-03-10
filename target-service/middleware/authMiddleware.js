const jwt = require('jsonwebtoken');

/**
 * Extract user id/roles from headers inserted by the API gateway.  The gateway
 * must send X-User-Id, X-User-Roles (comma-separated) and X-User-Email.
 */
function verifyTargetOwnership(req, res, next) {
    let userId = req.headers['x-user-id'];
    let userRoles = req.headers['x-user-roles']?.split(',') || [];

    // Fallback: read identity from JWT when gateway did not inject headers
    if (!userId) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.userId;
                userRoles = decoded.roles || [];
                req.userEmail = decoded.email;
            } catch (error) {
                // Ignore token parse errors here; handled by missing user check below
            }
        }
    }

    if (!userId) {
        return res.status(401).json({ error: 'User ID not provided' });
    }

    req.userId = userId;
    req.userRoles = userRoles;
    req.isAdmin = userRoles.includes('admin');

    next();
}

/**
 * Helper used by controllers after the target document has been fetched.
 */
function checkTargetOwnership(targetOwnerId, userId, userRoles) {
    const isAdmin = userRoles.includes('admin');
    const isOwner = targetOwnerId.toString() === userId;
    return isAdmin || isOwner;
}

module.exports = {
    verifyTargetOwnership,
    checkTargetOwnership
};