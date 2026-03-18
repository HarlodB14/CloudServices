const Target = require('../models/target');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const scoreServiceClient = require('../services/scoreServiceClient');
const registerServiceClient = require('../services/registerServiceClient');
const mailServiceClient = require('../services/mailServiceClient');
const clockServiceClient = require('../services/clockServiceClient');
const TargetValidator = require('../validators/targetValidator');

function extractAuthUser(req) {
    const fromHeaders = {
        userId: req.userId || req.headers['x-user-id'],
        email: req.userEmail || req.headers['x-user-email'],
        name: req.headers['x-user-name'],
        roles: req.userRoles || ((req.headers['x-user-roles'] || '').split(',').filter(Boolean)),
        permissions: req.userPermissions || ((req.headers['x-user-permissions'] || '').split(',').filter(Boolean))
    };

    if (fromHeaders.userId) {
        return fromHeaders;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return fromHeaders;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return {
            userId: decoded.userId,
            email: decoded.email,
            name: decoded.name,
            roles: decoded.roles || [],
            permissions: decoded.permissions || []
        };
    } catch (error) {
        return fromHeaders;
    }
}

/**
 * Get all targets (public - no auth required)
 * Supports filtering by location, status, search term
 */
async function getAllTargets(req, res) {
    try {
        const {
            latitude,
            longitude,
            radius, // in km
            status,
            search,
            limit = 50,
            page = 1
        } = req.query;

        let query = {};

        // Filter by status (default: active only)
        if (status) {
            query.status = status;
        } else {
            query.status = 'active';
        }

        // Search by title or description
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Geospatial query if location provided
        if (latitude && longitude) {
            const lat = parseFloat(latitude);
            const lon = parseFloat(longitude);
            const radiusInKm = parseFloat(radius) || 10; // default 10km

            query['location.latitude'] = {
                $gte: lat - (radiusInKm / 111), // rough conversion
                $lte: lat + (radiusInKm / 111)
            };
            query['location.longitude'] = {
                $gte: lon - (radiusInKm / (111 * Math.cos(lat * Math.PI / 180))),
                $lte: lon + (radiusInKm / (111 * Math.cos(lat * Math.PI / 180)))
            };
        }

        const targets = await Target.find(query)
            .select('-submissions -aiAnalysis') // Don't return full submissions in list view
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        const total = await Target.countDocuments(query);

        res.json({
            targets,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
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
        const authUser = extractAuthUser(req);
        const userId = authUser.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Validate request
        const validation = TargetValidator.validateCreateTarget(req.body);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors
            });
        }

        // Analyze target image via dedicated score service
        console.log('Analyzing target image via score service...');
        let aiAnalysis = null;
        try {
            aiAnalysis = await scoreServiceClient.analyzeTargetImage(imageUrl);
            if (aiAnalysis && aiAnalysis.labels) {
                console.log('Target AI analysis complete:', aiAnalysis.labels.slice(0, 5));
            }
        } catch (scoreError) {
            console.error('Target image analysis via score service failed:', scoreError.message);
            // Continue without AI analysis - optional feature
        }

        const newTarget = new Target({
            title,
            description,
            imageUrl,
            location,
            deadline,
            prize,
            ownerId: userId,
            ownerEmail: authUser.email,
            aiAnalysis
        });

        await newTarget.save();

        try {
            await clockServiceClient.startClock(newTarget._id.toString(), newTarget.deadline, {
                userId: authUser.userId,
                email: authUser.email,
                name: authUser.name,
                roles: authUser.roles || [],
                permissions: authUser.permissions || []
            });
        } catch (clockError) {
            console.error('Failed to start competition clock:', clockError.message);
            // Do not fail target creation if clock-service is temporarily unavailable
        }

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
        const authUser = extractAuthUser(req);
        const userId = authUser.userId;
        const userRoles = authUser.roles;

        // Validate request
        const validation = TargetValidator.validateUpdateTarget(req.body);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors
            });
        }

        const target = await Target.findById(targetId);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        // Verify ownership
        if (!TargetValidator.checkOwnership(target.ownerId, userId, userRoles)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only edit targets you own'
            });
        }

        // Build updates from allowed fields
        const updates = {};
        validation.allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        const updatedTarget = await Target.findByIdAndUpdate(
            targetId,
            updates, { new: true, runValidators: true }
        );

        if (updates.deadline) {
            try {
                await clockServiceClient.startClock(updatedTarget._id.toString(), updatedTarget.deadline, {
                    userId: authUser.userId,
                    email: authUser.email,
                    name: authUser.name,
                    roles: authUser.roles || [],
                    permissions: authUser.permissions || []
                });
            } catch (clockError) {
                console.error('Failed to reschedule competition clock:', clockError.message);
            }
        }

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
        const authUser = extractAuthUser(req);
        const userId = authUser.userId;
        const userRoles = authUser.roles;

        const target = await Target.findById(targetId);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        // Verify ownership
        if (!TargetValidator.checkOwnership(target.ownerId, userId, userRoles)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only delete targets you own'
            });
        }

        await Target.findByIdAndDelete(targetId);

        try {
            await clockServiceClient.cancelClock(targetId, {
                userId: authUser.userId,
                email: authUser.email,
                name: authUser.name,
                roles: authUser.roles || [],
                permissions: authUser.permissions || []
            });
        } catch (clockError) {
            console.error('Failed to cancel competition clock:', clockError.message);
        }

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
        const authUser = extractAuthUser(req);
        const userId = authUser.userId;
        const userRoles = authUser.roles;

        const target = await Target.findById(targetId);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        // Verify ownership
        if (!TargetValidator.checkOwnership(target.ownerId, userId, userRoles)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only view scores for targets you own'
            });
        }

        const leaderboardResponse = await scoreServiceClient.getTargetLeaderboard(targetId, 1, 500);
        const leaderboard = leaderboardResponse.leaderboard || [];

        res.json({
            targetId: target._id,
            title: target.title,
            status: target.status,
            deadline: target.deadline,
            totalSubmissions: target.submissionCount,
            submissions: leaderboard,
            winner: target.winner
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Submit photo to target (participant)
 */
async function submitPhoto(req, res) {
    try {
        const targetId = req.params.id;
        const { photoUrl } = req.body;
        const authUser = extractAuthUser(req);
        const userId = authUser.userId;
        const userEmail = authUser.email;
        const userName = authUser.name;

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const target = await Target.findById(targetId);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        // Validate submission
        const validation = TargetValidator.validatePhotoSubmission(req.body, target);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors
            });
        }

        // Check for duplicate submission
        const duplicateCheck = TargetValidator.checkDuplicateSubmission(target.submissions, userId);
        if (duplicateCheck.isDuplicate) {
            return res.status(400).json({
                error: 'You have already submitted a photo for this target',
                submissionId: duplicateCheck.submissionId
            });
        }

        const submissionId = new mongoose.Types.ObjectId();
        const submittedAt = new Date();

        console.log('Scoring submission via score service...');
        const scoreResult = await scoreServiceClient.evaluateSubmission({
            targetId: target._id.toString(),
            submissionId: submissionId.toString(),
            participantId: userId,
            participantEmail: userEmail,
            participantName: userName,
            imageUrl: photoUrl,
            submittedAt: submittedAt.toISOString(),
            targetCreatedAt: new Date(target.createdAt).toISOString(),
            targetDeadline: new Date(target.deadline).toISOString(),
            targetAnalysis: target.aiAnalysis || null
        });

        // Create submission
        const submission = {
            _id: submissionId,
            participantId: userId,
            participantEmail: userEmail,
            participantName: userName,
            photoUrl,
            score: scoreResult.timingScore,
            similarity: scoreResult.visualSimilarity,
            submittedAt,
            finalRank: scoreResult.finalScore,
            aiAnalysis: scoreResult.ai ? {
                labels: scoreResult.ai.labels,
                confidence: scoreResult.ai.confidence,
                timestamp: scoreResult.ai.timestamp,
                service: scoreResult.ai.service
            } : null
        };

        target.submissions.push(submission);
        target.submissionCount += 1;

        await target.save();

        try {
            await registerServiceClient.markSubmissionRecorded(
                target._id.toString(),
                userId, {
                    userId: authUser.userId,
                    email: authUser.email,
                    name: authUser.name,
                    roles: authUser.roles || [],
                    permissions: authUser.permissions || []
                }
            );
        } catch (registerError) {
            console.error('Failed to mark enrollment submission state:', registerError.message);
            // Keep submission successful even if register-service is temporarily unavailable
        }

        res.status(201).json({
            message: 'Photo submitted successfully',
            submission: {
                submissionId: submission._id,
                similarity: scoreResult.visualSimilarity,
                timeScore: scoreResult.timingScore,
                finalRank: scoreResult.finalScore,
                submittedAt: submission.submittedAt
            }
        });
    } catch (error) {
        console.error('Submit photo error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Get my submission for a target
 */
async function getMySubmission(req, res) {
    try {
        const targetId = req.params.id;
        const userId = extractAuthUser(req).userId;

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const target = await Target.findById(targetId);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        const submission = target.submissions.find(
            sub => sub.participantId.toString() === userId
        );

        if (!submission) {
            return res.status(404).json({ error: 'No submission found' });
        }

        res.json({
            targetId: target._id,
            targetTitle: target.title,
            submission
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Delete my submission
 */
async function deleteMySubmission(req, res) {
    try {
        const targetId = req.params.id;
        const userId = extractAuthUser(req).userId;

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const target = await Target.findById(targetId);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        // Check if target is still active
        if (target.status === 'completed') {
            return res.status(400).json({ error: 'Cannot delete submission from completed target' });
        }

        const submissionIndex = target.submissions.findIndex(
            sub => sub.participantId.toString() === userId
        );

        if (submissionIndex === -1) {
            return res.status(404).json({ error: 'No submission found' });
        }

        target.submissions.splice(submissionIndex, 1);
        target.submissionCount = Math.max(0, target.submissionCount - 1);

        await target.save();

        res.json({ message: 'Submission deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Rate a target (thumbs up/down)
 */
async function rateTarget(req, res) {
    try {
        const targetId = req.params.id;
        const userId = extractAuthUser(req).userId;
        const { rating } = req.body;

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Validate rating
        const validation = TargetValidator.validateRating(rating);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors
            });
        }

        const target = await Target.findById(targetId);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        const submission = target.submissions.find(
            sub => sub.participantId.toString() === userId
        );

        if (!submission) {
            return res.status(404).json({ error: 'You must submit a photo before rating' });
        }

        submission.userRating = rating;
        await target.save();

        res.json({ message: 'Rating saved successfully', rating });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Finalize target and determine winner (owner only)
 * Should be called after deadline or manually by owner
 */
async function finalizeTarget(req, res) {
    try {
        const targetId = req.params.id;
        const authUser = extractAuthUser(req);
        const userId = authUser.userId;
        const userRoles = authUser.roles;

        const target = await Target.findById(targetId);

        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        // Verify ownership
        if (!TargetValidator.checkOwnership(target.ownerId, userId, userRoles)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only finalize targets you own'
            });
        }

        // Validate finalization
        const validation = TargetValidator.validateFinalization(target);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors
            });
        }

        if (!validation.canFinalize) {
            target.status = 'closed';
            await target.save();
            return res.json({ message: 'Target closed with no submissions' });
        }

        const finalized = await scoreServiceClient.finalizeTarget(targetId);
        const winningScore = finalized.winner;

        if (!winningScore) {
            target.status = 'closed';
            await target.save();
            return res.json({ message: 'Target closed with no scored submissions' });
        }

        const winningSubmission = target.submissions.find(
            (sub) => sub.participantId.toString() === winningScore.participantId.toString()
        );

        target.winner = {
            participantId: winningSubmission ? winningSubmission.participantId : winningScore.participantId,
            participantEmail: winningSubmission ? winningSubmission.participantEmail : winningScore.participantEmail,
            participantName: winningSubmission ? winningSubmission.participantName : winningScore.participantName,
            score: winningScore.finalScore,
            submittedAt: winningSubmission ? winningSubmission.submittedAt : winningScore.calculatedAt
        };

        target.status = 'completed';
        await target.save();

        try {
            const finalLeaderboard = await scoreServiceClient.getTargetLeaderboard(targetId, 1, 500);
            await mailServiceClient.sendFinalResults(targetId, {
                targetTitle: target.title,
                deadline: target.deadline,
                ownerEmail: target.ownerEmail,
                winner: finalized.winner || null,
                leaderboard: finalLeaderboard.leaderboard || []
            }, {
                userId: authUser.userId,
                email: authUser.email,
                name: authUser.name,
                roles: authUser.roles || [],
                permissions: authUser.permissions || []
            });
        } catch (mailError) {
            console.error('Failed to send final result emails:', mailError.message);
            // Keep target finalization successful even if mail service fails
        }

        res.json({
            message: 'Target finalized successfully',
            winner: target.winner,
            totalSubmissions: target.submissionCount
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
    getTargetScores,
    submitPhoto,
    getMySubmission,
    deleteMySubmission,
    rateTarget,
    finalizeTarget
};