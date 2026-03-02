/**
 * Extract user id/roles from headers inserted by the API gateway.  The gateway
 * must send X-User-Id, X-User-Roles (comma-separated) and X-User-Email.
 */
function verifyTargetOwnership(req, res, next) {
    const userId = req.headers['x-user-id'];
    const userRoles = req.headers['x-user-roles']?.split(',') || [];

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