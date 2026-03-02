const Target = require('../models/target');
const { checkTargetOwnership } = require('../middleware/authMiddleware');

/**
 * Get all targets (public - no auth required)
 */
async function getAllTargets(req, res) {
    try {
        const targets = await Target.find({ status: 'active' })
            .select('-submissions') // Don't return full submissions in list view
            .sort({ createdAt: -1 });

        res.json(targets);
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Get target by ID (public)
 */
async function getTargetById(req, res) {
    try {
        const target = await Target.findById(req.params.id);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        res.json(target);
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Create new target (requires target_owner role)
 * User ID comes from X-User-Id header
 */
async function createTarget(req, res) {
    try {
        const { title, description, imageUrl, location, deadline, prize } = req.body;
        const userId = req.userId;

        if (!title || !imageUrl || !location || !deadline) {
            return res.status(400).json({
                error: 'Missing required fields: title, imageUrl, location, deadline'
            });
        }

        const newTarget = new Target({
            title,
            description,
            imageUrl,
            location,
            deadline,
            prize,
            ownerId: userId,
            ownerEmail: req.headers['x-user-email']
        });

        await newTarget.save();

        res.status(201).json({
            message: 'Target created successfully',
            target: newTarget
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Update target (requires ownership)
 */
async function updateTarget(req, res) {
    try {
        const targetId = req.params.id;
        const userId = req.userId;
        const userRoles = req.userRoles;

        const target = await Target.findById(targetId);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        // ✅ Verify ownership
        if (!checkTargetOwnership(target.ownerId, userId, userRoles)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only edit targets you own'
            });
        }

        // ✅ Only allow editing certain fields
        const allowedFields = ['title', 'description', 'prize', 'deadline'];
        const updates = {};

        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        const updatedTarget = await Target.findByIdAndUpdate(
            targetId,
            updates, { new: true, runValidators: true }
        );

        res.json({
            message: 'Target updated successfully',
            target: updatedTarget
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Delete target (requires ownership)
 */
async function deleteTarget(req, res) {
    try {
        const targetId = req.params.id;
        const userId = req.userId;
        const userRoles = req.userRoles;

        const target = await Target.findById(targetId);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        // ✅ Verify ownership
        if (!checkTargetOwnership(target.ownerId, userId, userRoles)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only delete targets you own'
            });
        }

        await Target.findByIdAndDelete(targetId);

        res.json({ message: 'Target deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Get scores for target (owner or admin only)
 */
async function getTargetScores(req, res) {
    try {
        const targetId = req.params.id;
        const userId = req.userId;
        const userRoles = req.userRoles;

        const target = await Target.findById(targetId);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        // ✅ Verify ownership
        if (!checkTargetOwnership(target.ownerId, userId, userRoles)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only view scores for targets you own'
            });
        }

        res.json({
            targetId: target._id,
            title: target.title,
            submissions: target.submissions,
            winner: target.winner
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

module.exports = {
    getAllTargets,
    getTargetById,
    createTarget,
    updateTarget,
    deleteTarget,
    getTargetScores
};