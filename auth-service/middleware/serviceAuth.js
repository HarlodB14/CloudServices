const jwt = require('jsonwebtoken');

/**
 * Middleware for microservices to verify JWT tokens
 * This is a secondary verification layer (defense in depth)
 * Primary verification happens at the API Gateway
 */
function verifyServiceToken(req, res, next) {
    // Get token from header OR custom header from gateway
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const userRoles = req.headers['x-user-roles'];
    const userId = req.headers['x-user-id'];

    if (!token && !userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // If gateway already verified, use header values
    if (userId && userRoles) {
        req.user = {
            userId,
            roles: userRoles.split(',')
        };
        return next();
    }

    // Fallback: Verify token directly
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid token' });
    }
}

/**
 * Check user has required role
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
                error: 'Insufficient permissions'
            });
        }

        next();
    };
}

module.exports = { verifyServiceToken, requireRole };