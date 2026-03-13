const Enrollment = require('../models/enrollment');
const axios = require('axios');

const TARGET_SERVICE_URL = process.env.TARGET_SERVICE_URL || 'http://target-service:3002';
const TARGET_LOOKUP_TIMEOUT_MS = Number(process.env.TARGET_LOOKUP_TIMEOUT_MS || 5000);

async function fetchTargetById(targetId) {
    const response = await axios.get(`${TARGET_SERVICE_URL}/targets/${targetId}`, {
        timeout: TARGET_LOOKUP_TIMEOUT_MS
    });
    return response.data;
}

async function registerForTarget(req, res) {
    try {
        const { targetId } = req.params;
        const participantId = req.userId;
        const participantEmail = req.userEmail;
        const participantName = req.userName;

        // Validate input
        if (!targetId || !participantId) {
            return res.status(400).json({ error: 'Target ID and user ID required' });
        }

        // Business rule: owner cannot register for own target
        let target;
        try {
            target = await fetchTargetById(targetId);
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return res.status(404).json({ error: 'Target not found' });
            }
            return res.status(502).json({ error: 'Unable to validate target ownership' });
        }

        if (target.status && target.status !== 'active') {
            return res.status(400).json({ error: 'Target registrations are not open' });
        }

        if (target.ownerId && String(target.ownerId) === String(participantId)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Target owners cannot register for their own target'
            });
        }

        // Check if already enrolled
        const existingEnrollment = await Enrollment.findOne({
            targetId,
            participantId
        });

        if (existingEnrollment) {
            // If previously withdrawn, reactivate
            if (existingEnrollment.status === 'withdrawn') {
                existingEnrollment.status = 'active';
                existingEnrollment.enrolledAt = new Date();
                await existingEnrollment.save();
                return res.status(200).json({
                    message: 'Re-enrolled for target',
                    enrollment: existingEnrollment
                });
            }
            return res.status(409).json({ error: 'Already enrolled for this target' });
        }

        // Create new enrollment
        const enrollment = new Enrollment({
            targetId,
            participantId,
            participantEmail,
            participantName,
            status: 'active'
        });

        await enrollment.save();

        res.status(201).json({
            message: 'Successfully enrolled for target',
            enrollment
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

async function withdrawFromTarget(req, res) {
    try {
        const { targetId } = req.params;
        const participantId = req.userId;

        // Find enrollment
        const enrollment = await Enrollment.findOne({
            targetId,
            participantId
        });

        if (!enrollment) {
            return res.status(404).json({ error: 'Enrollment not found' });
        }

        if (enrollment.status === 'withdrawn') {
            return res.status(400).json({ error: 'Already withdrawn from this target' });
        }

        if (enrollment.status === 'closed') {
            return res.status(400).json({ error: 'Cannot withdraw - target registrations are closed' });
        }

        enrollment.status = 'withdrawn';
        enrollment.updatedAt = new Date();
        await enrollment.save();

        res.status(200).json({
            message: 'Successfully withdrawn from target',
            enrollment
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

async function getTargetEnrollments(req, res) {
    try {
        const { targetId } = req.params;
        const { status } = req.query; // optional filter by status

        let query = { targetId };
        if (status) {
            query.status = status;
        }

        const enrollments = await Enrollment.find(query).sort({ enrolledAt: -1 });

        // Count stats
        const stats = {
            total: enrollments.length,
            active: enrollments.filter(e => e.status === 'active').length,
            withdrawn: enrollments.filter(e => e.status === 'withdrawn').length,
            closed: enrollments.filter(e => e.status === 'closed').length,
            submitted: enrollments.filter(e => e.submittedAt !== null).length
        };

        res.status(200).json({
            targetId,
            stats,
            enrollments
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

async function closeTargetEnrollments(req, res) {
    try {
        const { targetId } = req.params;

        // Find all active enrollments for this target
        const enrollments = await Enrollment.updateMany({ targetId, status: 'active' }, {
            status: 'closed',
            updatedAt: new Date()
        });

        res.status(200).json({
            message: 'Target registrations closed',
            modifiedCount: enrollments.modifiedCount
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

async function getEnrollmentByUserTarget(req, res) {
    try {
        const { targetId } = req.params;
        const participantId = req.userId;

        const enrollment = await Enrollment.findOne({
            targetId,
            participantId
        });

        if (!enrollment) {
            return res.status(404).json({ error: 'No enrollment found' });
        }

        res.status(200).json({
            enrollment
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

async function markSubmitted(req, res) {
    // Internal endpoint: called by target-service after successful submission
    try {
        const { targetId, participantId } = req.body;

        if (!targetId || !participantId) {
            return res.status(400).json({ error: 'targetId and participantId required' });
        }

        const enrollment = await Enrollment.findOneAndUpdate({ targetId, participantId }, { submittedAt: new Date() }, { new: true });

        if (!enrollment) {
            return res.status(404).json({ error: 'Enrollment not found' });
        }

        res.status(200).json({
            message: 'Submission recorded',
            enrollment
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

module.exports = {
    registerForTarget,
    withdrawFromTarget,
    getTargetEnrollments,
    closeTargetEnrollments,
    getEnrollmentByUserTarget,
    markSubmitted
};