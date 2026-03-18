const mongoose = require('mongoose');

const clockCompetitionSchema = new mongoose.Schema({
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        unique: true,
        index: true
    },
    deadline: {
        type: Date,
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['scheduled', 'fired', 'cancelled'],
        default: 'scheduled',
        index: true
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    firedAt: {
        type: Date,
        default: null
    },
    registerCloseResult: {
        type: Object,
        default: null
    },
    finalizeResult: {
        type: Object,
        default: null
    },
    lastError: {
        type: String,
        default: null
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

clockCompetitionSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('ClockCompetition', clockCompetitionSchema);