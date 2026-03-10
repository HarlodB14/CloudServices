const User = require('../models/user');

/**
 * Assign roles to a user
 * Only admins should have access to this
 */
async function assignRole(req, res) {
    const { userId, roles } = req.body;

    try {
        if (!userId || !roles || !Array.isArray(roles)) {
            return res.status(400).json({
                error: 'userId and roles array are required'
            });
        }

        const user = await User.findByIdAndUpdate(
            userId, { roles }, { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            message: 'Roles updated successfully',
            user: {
                id: user._id,
                email: user.email,
                roles: user.roles
            }
        });
    } catch (error) {}
}

/**
 * Assign permissions to a user
 */
async function assignPermissions(req, res) {
    const { userId, permissions } = req.body;

    try {
        if (!userId || !permissions || !Array.isArray(permissions)) {
            return res.status(400).json({
                error: 'userId and permissions array are required'
            });
        }

        const user = await User.findByIdAndUpdate(
            userId, { permissions }, { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            message: 'Permissions updated successfully',
            user: {
                id: user._id,
                email: user.email,
                permissions: user.permissions
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Get user details with roles and permissions
 */
async function getUserInfo(req, res) {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user._id,
            email: user.email,
            name: user.name,
            roles: user.roles,
            permissions: user.permissions,
            createdAt: user.createdAt
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = { assignRole, assignPermissions, getUserInfo };