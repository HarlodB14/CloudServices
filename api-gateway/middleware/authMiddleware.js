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
 * Authorize based on user roles
 * @param {Array<string>} allowedRoles - Roles allowed to access this endpoint
 */
function authorize(allowedRoles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const userRoles = req.user.roles || [];
        const hasPermission = allowedRoles.length === 0 || 
                            allowedRoles.some(role => userRoles.includes(role));

        if (!hasPermission) {
            return res.status(403).json({ 
                error: 'Forbidden',
                message: `Requires one of: ${allowedRoles.join(', ')}`
            });
        }

        next();
    };
}

module.exports = { verifyToken, authorize };
