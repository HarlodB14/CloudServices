const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    submissionId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    participantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    participantEmail: { type: String, required: true },
    participantName: { type: String },

    visualSimilarity: { type: Number, required: true },
    timingScore: { type: Number, required: true },
    finalScore: { type: Number, required: true },

    rank: { type: Number, default: null },
    percentile: { type: Number, default: null },

    calculatedAt: { type: Date, default: Date.now },
    formulaVersion: { type: String, default: 'v1.0.0' },

    scoringDetails: {
        targetCreatedAt: Date,
        targetDeadline: Date,
        submissionTime: Date,
        secondsFromStart: Number,
        totalWindowSeconds: Number,
        timeSinceDeadline: Number,
        similarityReason: String,
        timingWeight: { type: Number, default: 0.3 },
        similarityWeight: { type: Number, default: 0.7 },
        formula: String,
        notes: String,
        aiService: String
    }
}, { timestamps: true });

scoreSchema.index({ targetId: 1, finalScore: -1, calculatedAt: 1 });
scoreSchema.index({ targetId: 1, participantId: 1 }, { unique: true });
scoreSchema.index({ participantId: 1, createdAt: -1 });

module.exports = mongoose.model('Score', scoreSchema);