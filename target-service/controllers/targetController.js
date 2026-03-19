const Target = require('../models/target');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const scoreServiceClient = require('../services/scoreServiceClient');
const registerServiceClient = require('../services/registerServiceClient');
const mailServiceClient = require('../services/mailServiceClient');
const clockServiceClient = require('../services/clockServiceClient');
const TargetValidator = require('../validators/targetValidator');
const {
    parseBase64Image,
    fetchImageBuffer,
    computeImageHashFromUrl,
    saveUploadedImage
} = require('../services/imageStorageService');

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
            city,
            placeName,
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
                { description: { $regex: search, $options: 'i' } },
                { locationDescription: { $regex: search, $options: 'i' } },
                { 'location.city': { $regex: search, $options: 'i' } },
                { 'location.placeName': { $regex: search, $options: 'i' } }
            ];
        }

        if (city) {
            query['location.city'] = { $regex: String(city), $options: 'i' };
        }

        if (placeName) {
            query['location.placeName'] = { $regex: String(placeName), $options: 'i' };
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
            .select('-submissions -aiAnalysis -imageHash') // Don't return full submissions/internal hash in list view
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
 * Upload image and receive cacheable URL
 * Supports:
 * - multipart/form-data with field name `image`
 * - JSON body with `imageBase64`
 * - JSON body with `imageUrl` (re-host)
 */
async function uploadImage(req, res) {
    try {
        const authUser = extractAuthUser(req);
        if (!authUser.userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        let buffer;
        let mimeType;

        if (req.file && req.file.buffer) {
            buffer = req.file.buffer;
            mimeType = req.file.mimetype;
        } else if (req.body && req.body.imageBase64) {
            const parsed = parseBase64Image(req.body.imageBase64);
            buffer = parsed.buffer;
            mimeType = parsed.mimeType;
        } else if (req.body && req.body.imageUrl) {
            const downloaded = await fetchImageBuffer(req.body.imageUrl, req);
            buffer = downloaded.buffer;
            mimeType = downloaded.mimeType;
        } else {
            return res.status(400).json({
                error: 'Provide image as multipart file `image`, `imageBase64`, or `imageUrl`'
            });
        }

        if (!buffer || !buffer.length) {
            return res.status(400).json({ error: 'Empty image payload' });
        }

        const saved = await saveUploadedImage({ buffer, mimeType, req });

        return res.status(201).json({
            message: 'Image uploaded successfully',
            imageUrl: saved.imageUrl,
            imagePath: saved.mediaPath,
            imageHash: saved.imageHash,
            size: saved.size
        });
    } catch (error) {
        return res.status(500).json({ error: 'Image upload failed: ' + error.message });
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

        const payload = target.toObject();
        delete payload.imageHash;
        if (Array.isArray(payload.submissions)) {
            payload.submissions = payload.submissions.map((submission) => {
                const cleaned = {...submission };
                delete cleaned.imageHash;
                return cleaned;
            });
        }

        res.json(payload);
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
        const { title, description, locationDescription, imageUrl, location, deadline, prize } = req.body;
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

        let targetImageHash;
        let resolvedImageUrl;

        try {
            const hashResult = await computeImageHashFromUrl(imageUrl, req);
            targetImageHash = hashResult.imageHash;
            resolvedImageUrl = hashResult.resolvedUrl;
        } catch (hashError) {
            return res.status(400).json({
                error: 'Target image must be a valid and reachable image URL',
                details: hashError.message
            });
        }

        // Analyze target image via dedicated score service
        console.log('Analyzing target image via score service...');
        let aiAnalysis = null;
        try {
            aiAnalysis = await scoreServiceClient.analyzeTargetImage(resolvedImageUrl);
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
            locationDescription,
            imageUrl: resolvedImageUrl,
            imageHash: targetImageHash,
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

        let resolvedPhotoUrl;
        let submissionImageHash;
        try {
            const hashResult = await computeImageHashFromUrl(photoUrl, req);
            resolvedPhotoUrl = hashResult.resolvedUrl;
            submissionImageHash = hashResult.imageHash;
        } catch (hashError) {
            return res.status(400).json({
                error: 'Submitted photo must be a valid and reachable image URL',
                details: hashError.message
            });
        }

        if (!target.imageHash && target.imageUrl) {
            try {
                const targetHashResult = await computeImageHashFromUrl(target.imageUrl, req);
                target.imageHash = targetHashResult.imageHash;
            } catch (targetHashError) {
                console.warn('Unable to compute legacy target image hash:', targetHashError.message);
            }
        }

        if (target.imageHash && submissionImageHash === target.imageHash) {
            return res.status(400).json({
                error: 'Submitted photo cannot be identical to the original target photo'
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
            imageUrl: resolvedPhotoUrl,
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
            photoUrl: resolvedPhotoUrl,
            imageHash: submissionImageHash,
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

        try {
            await scoreServiceClient.deleteParticipantScore(targetId, userId);
        } catch (scoreError) {
            console.error('Failed to delete score entry after submission removal:', scoreError.message);
        }

        res.json({ message: 'Submission deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

/**
 * Owner/admin can remove a participant submission from own target
 */
async function deleteSubmissionByOwner(req, res) {
    try {
        const targetId = req.params.id;
        const submissionId = req.params.submissionId;
        const authUser = extractAuthUser(req);
        const userId = authUser.userId;
        const userRoles = authUser.roles;

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const target = await Target.findById(targetId);
        if (!target) {
            return res.status(404).json({ error: 'Target not found' });
        }

        if (!TargetValidator.checkOwnership(target.ownerId, userId, userRoles)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only manage submissions on targets you own'
            });
        }

        const submissionIndex = target.submissions.findIndex(
            (sub) => String(sub._id) === String(submissionId)
        );

        if (submissionIndex === -1) {
            return res.status(404).json({ error: 'Submission not found on this target' });
        }

        const [removedSubmission] = target.submissions.splice(submissionIndex, 1);
        target.submissionCount = Math.max(0, target.submissionCount - 1);
        await target.save();

        try {
            await scoreServiceClient.deleteParticipantScore(targetId, removedSubmission.participantId.toString());
        } catch (scoreError) {
            console.error('Failed to delete participant score after owner moderation:', scoreError.message);
        }

        return res.status(200).json({
            message: 'Submission deleted by target owner',
            deletedSubmissionId: removedSubmission._id,
            participantId: removedSubmission.participantId
        });
    } catch (error) {
        return res.status(500).json({ error: 'Server error: ' + error.message });
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
    uploadImage,
    createTarget,
    updateTarget,
    deleteTarget,
    getTargetScores,
    submitPhoto,
    getMySubmission,
    deleteMySubmission,
    deleteSubmissionByOwner,
    rateTarget,
    finalizeTarget
};