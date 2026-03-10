const Target = require('../models/target');
const { checkTargetOwnership } = require('../middleware/authMiddleware');
const { analyzeAndScore, analyzeTargetImage } = require('../services/aiScoringService');
const TargetValidator = require('../validators/targetValidator');

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
        const userId = req.userId;

        // Validate request
        const validation = TargetValidator.validateCreateTarget(req.body);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Validation failed',
                details: validation.errors
            });
        }

        // Analyze target image with AI
        console.log('Analyzing target image with AI...');
        let aiAnalysis = null;
        try {
            aiAnalysis = await analyzeTargetImage(imageUrl);
            console.log('AI Analysis complete:', aiAnalysis.labels.slice(0, 5));
        } catch (aiError) {
            console.error('AI analysis failed:', aiError.message);
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
            ownerEmail: req.headers['x-user-email'],
            aiAnalysis
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

        // Verify ownership
        if (!TargetValidator.checkOwnership(target.ownerId, userId, userRoles)) {
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

        // Verify ownership
        if (!TargetValidator.checkOwnership(target.ownerId, userId, userRoles)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only view scores for targets you own'
            });
        }

        // Sort submissions by final rank (combined score)
        const sortedSubmissions = target.submissions.sort((a, b) => {
            return (b.finalRank || 0) - (a.finalRank || 0);
        });

        res.json({
            targetId: target._id,
            title: target.title,
            status: target.status,
            deadline: target.deadline,
            totalSubmissions: target.submissionCount,
            submissions: sortedSubmissions,
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
        const userId = req.userId || req.headers['x-user-id'];
        const userEmail = req.headers['x-user-email'];
        const userName = req.headers['x-user-name'];

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

        // Analyze submitted photo with AI
        console.log('Analyzing submission with AI...');
        let aiResult = null;
        let similarity = 0;

        try {
            aiResult = await analyzeAndScore(photoUrl, target.aiAnalysis);
            similarity = aiResult.similarity;
            console.log('Submission analysis complete. Similarity:', similarity);
        } catch (aiError) {
            console.error('AI analysis failed:', aiError.message);
            // Continue with 0 score if AI fails
        }

        // Calculate time bonus (earlier submissions get higher time score)
        const timeElapsed = Date.now() - new Date(target.createdAt).getTime();
        const totalTime = new Date(target.deadline).getTime() - new Date(target.createdAt).getTime();
        const timeRatio = Math.max(0, 1 - (timeElapsed / totalTime));
        const timeScore = timeRatio * 100;

        // Calculate final rank: 60% similarity + 40% time
        const finalRank = (similarity * 0.6) + (timeScore * 0.4);

        // Create submission
        const submission = {
            _id: new Date(), // MongoDB will generate proper ObjectId
            participantId: userId,
            participantEmail: userEmail,
            participantName: userName,
            photoUrl,
            score: timeScore,
            similarity,
            submittedAt: new Date(),
            finalRank,
            aiAnalysis: aiResult ? {
                labels: aiResult.labels,
                confidence: aiResult.confidence,
                timestamp: aiResult.timestamp,
                service: aiResult.service
            } : null
        };

        target.submissions.push(submission);
        target.submissionCount += 1;

        await target.save();

        res.status(201).json({
            message: 'Photo submitted successfully',
            submission: {
                submissionId: submission._id,
                similarity,
                timeScore: Math.round(timeScore),
                finalRank: Math.round(finalRank),
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
        const userId = req.userId || req.headers['x-user-id'];

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
        const userId = req.userId || req.headers['x-user-id'];

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
        const userId = req.userId || req.headers['x-user-id'];
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
        const userId = req.userId;
        const userRoles = req.userRoles;

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

        // Find winner (highest finalRank)
        const sortedSubmissions = target.submissions.sort((a, b) => {
            return (b.finalRank || 0) - (a.finalRank || 0);
        });

        const winningSubmission = sortedSubmissions[0];

        target.winner = {
            participantId: winningSubmission.participantId,
            participantEmail: winningSubmission.participantEmail,
            participantName: winningSubmission.participantName,
            score: winningSubmission.finalRank,
            submittedAt: winningSubmission.submittedAt
        };

        target.status = 'completed';
        await target.save();

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