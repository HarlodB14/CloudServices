const mongoose = require('mongoose');
const Score = require('../models/score');
const { analyzeImage, calculateSimilarity } = require('../services/aiProviderService');
const { calculateTimingScore, calculateFinalScore } = require('../services/scoringFormula');
const ScoreValidator = require('../validators/scoreValidator');

async function analyzeTarget(req, res) {
    try {
        const { imageUrl } = req.body;

        if (!imageUrl) {
            return res.status(400).json({ error: 'imageUrl is required' });
        }

        const analysis = await analyzeImage(imageUrl);
        return res.status(200).json({ analysis });
    } catch (error) {
        return res.status(500).json({ error: `Target image analysis failed: ${error.message}` });
    }
}

function buildScoringDetails({ targetCreatedAt, targetDeadline, submittedTime, timing, final, analyzedSubmission }) {
    return {
        targetCreatedAt: new Date(targetCreatedAt),
        targetDeadline: new Date(targetDeadline),
        submissionTime: submittedTime,
        secondsFromStart: timing.secondsFromStart,
        totalWindowSeconds: timing.totalWindowSeconds,
        timeSinceDeadline: timing.timeSinceDeadline,
        similarityReason: analyzedSubmission.skipped ?
            analyzedSubmission.reason : 'AI label overlap and confidence weighted match',
        timingWeight: final.timingWeight,
        similarityWeight: final.similarityWeight,
        formula: final.formula,
        notes: analyzedSubmission.skipped ? 'AI analysis skipped due to configuration' : 'Scored with active AI provider',
        aiService: analyzedSubmission.service
    };
}

function buildScorePayload({ ids, participantEmail, participantName, similarity, timing, final, scoringDetails }) {
    return {
        targetId: ids.target,
        submissionId: ids.submission,
        participantId: ids.participant,
        participantEmail,
        participantName,
        visualSimilarity: similarity,
        timingScore: timing.timingScore,
        finalScore: final.finalScore,
        formulaVersion: 'v1.0.0',
        calculatedAt: new Date(),
        scoringDetails
    };
}

async function evaluateSubmission(req, res) {
    try {
        const validation = ScoreValidator.validateEvaluationRequest(req.body);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.errors[0], required: validation.required });
        }

        const ids = ScoreValidator.parseEvaluationIds(req.body);
        if (ids.error) {
            return res.status(400).json({ error: ids.error });
        }

        const { participantEmail, participantName, imageUrl, submittedAt, targetCreatedAt, targetDeadline, targetAnalysis } = req.body;

        const analyzedSubmission = await analyzeImage(imageUrl);
        const similarity = analyzedSubmission.skipped ?
            0 :
            calculateSimilarity(
                (targetAnalysis && targetAnalysis.labels) || [],
                analyzedSubmission.labels || [],
                analyzedSubmission.confidence || []
            );

        const submittedTime = submittedAt ? new Date(submittedAt) : new Date();
        const timing = calculateTimingScore(targetCreatedAt, targetDeadline, submittedTime);
        const final = calculateFinalScore(similarity, timing.timingScore);

        const scoringDetails = buildScoringDetails({ targetCreatedAt, targetDeadline, submittedTime, timing, final, analyzedSubmission });
        const scorePayload = buildScorePayload({ ids, participantEmail, participantName, similarity, timing, final, scoringDetails });

        const savedScore = await Score.findOneAndUpdate({ targetId: scorePayload.targetId, participantId: scorePayload.participantId },
            scorePayload, { upsert: true, new: true, runValidators: true }
        );

        return res.status(200).json({
            scoreId: savedScore._id,
            targetId: savedScore.targetId,
            participantId: savedScore.participantId,
            visualSimilarity: savedScore.visualSimilarity,
            timingScore: savedScore.timingScore,
            finalScore: savedScore.finalScore,
            calculatedAt: savedScore.calculatedAt,
            scoringDetails: savedScore.scoringDetails,
            ai: analyzedSubmission
        });
    } catch (error) {
        console.error('evaluateSubmission error:', error);
        return res.status(500).json({ error: `Failed to evaluate submission: ${error.message}` });
    }
}

async function getTargetLeaderboard(req, res) {
    try {
        const { targetId } = req.params;

        const idCheck = ScoreValidator.validateTargetId(targetId);
        if (!idCheck.isValid) return res.status(400).json({ error: idCheck.error });

        const { limit: parsedLimit, page: parsedPage } = ScoreValidator.validateLeaderboardQuery(req.query);

        const filter = { targetId: new mongoose.Types.ObjectId(targetId) };

        const total = await Score.countDocuments(filter);
        const scores = await Score.find(filter)
            .sort({ finalScore: -1, calculatedAt: 1 })
            .limit(parsedLimit)
            .skip((parsedPage - 1) * parsedLimit)
            .lean();

        return res.status(200).json({
            targetId,
            leaderboard: scores,
            pagination: {
                total,
                page: parsedPage,
                limit: parsedLimit,
                pages: Math.ceil(total / parsedLimit)
            }
        });
    } catch (error) {
        return res.status(500).json({ error: `Failed to fetch leaderboard: ${error.message}` });
    }
}

async function getParticipantScore(req, res) {
    try {
        const { targetId, participantId } = req.params;

        const idCheck = ScoreValidator.validateParticipantScoreParams(targetId, participantId);
        if (!idCheck.isValid) return res.status(400).json({ error: idCheck.error });

        const score = await Score.findOne({
            targetId: new mongoose.Types.ObjectId(targetId),
            participantId: new mongoose.Types.ObjectId(participantId)
        });

        if (!score) {
            return res.status(404).json({ error: 'Score not found' });
        }

        return res.status(200).json(score);
    } catch (error) {
        return res.status(500).json({ error: `Failed to fetch participant score: ${error.message}` });
    }
}

async function deleteParticipantScore(req, res) {
    try {
        const { targetId, participantId } = req.params;

        const idCheck = ScoreValidator.validateParticipantScoreParams(targetId, participantId);
        if (!idCheck.isValid) return res.status(400).json({ error: idCheck.error });

        const result = await Score.deleteOne({
            targetId: new mongoose.Types.ObjectId(targetId),
            participantId: new mongoose.Types.ObjectId(participantId)
        });

        return res.status(200).json({
            message: 'Participant score deleted',
            targetId,
            participantId,
            deletedCount: result.deletedCount || 0
        });
    } catch (error) {
        return res.status(500).json({ error: `Failed to delete participant score: ${error.message}` });
    }
}

async function finalizeTargetScores(req, res) {
    try {
        const { targetId } = req.params;

        const idCheck = ScoreValidator.validateTargetId(targetId);
        if (!idCheck.isValid) return res.status(400).json({ error: idCheck.error });

        const scores = await Score.find({ targetId: new mongoose.Types.ObjectId(targetId) })
            .sort({ finalScore: -1, calculatedAt: 1 });

        if (scores.length === 0) {
            return res.status(200).json({ message: 'No scores to finalize', targetId, winner: null });
        }

        const total = scores.length;
        const bulkOps = scores.map((score, index) => {
            const rank = index + 1;
            const percentile = Math.round(((total - index) / total) * 100);

            return {
                updateOne: {
                    filter: { _id: score._id },
                    update: { $set: { rank, percentile } }
                }
            };
        });

        if (bulkOps.length > 0) {
            await Score.bulkWrite(bulkOps);
        }

        const winner = await Score.findOne({ targetId: new mongoose.Types.ObjectId(targetId) })
            .sort({ rank: 1, finalScore: -1, calculatedAt: 1 });

        return res.status(200).json({
            message: 'Target scores finalized',
            targetId,
            totalScores: total,
            winner
        });
    } catch (error) {
        return res.status(500).json({ error: `Failed to finalize target scores: ${error.message}` });
    }
}

module.exports = {
    analyzeTarget,
    evaluateSubmission,
    getTargetLeaderboard,
    getParticipantScore,
    finalizeTargetScores,
    deleteParticipantScore
};