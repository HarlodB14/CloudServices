const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
    // Relationship
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Target', required: true },
    submissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true },
    participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    participantEmail: { type: String, required: true },

    // Scoring Components (Photo Prestige specific formula)
    visualSimilarity: { type: Number, required: true }, // 0-100
    timingScore: { type: Number, required: true }, // 0-100 (early = high)
    finalScore: { type: Number, required: true }, // Combined

    // Ranking
    rank: { type: Number }, // 1st, 2nd, 3rd...
    percentile: { type: Number }, // Top X%

    // Timestamps
    calculatedAt: { type: Date, default: Date.now },

    // Details for appeal/review
    scoringDetails: {
        targetDeadline: Date,
        submissionTime: Date,
        timeSinceDeadline: Number, // seconds after deadline (negative = before)
        similarityReason: String,
        timingMultiplier: { type: Number, default: 1 },
        formula: String, // How score was calculated
        notes: String
    }
});

// Indexes
scoreSchema.index({ targetId: 1, finalScore: -1 }); // Leaderboard
scoreSchema.index({ participantId: 1 }); // User's scores
scoreSchema.index({ calculatedAt: -1 }); // Recent scores
scoreSchema.index({ targetId: 1, rank: 1 }); // Find rank

module.exports = mongoose.model('Score', scoreSchema);