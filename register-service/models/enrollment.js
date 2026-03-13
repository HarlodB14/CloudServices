const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
    // References
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    participantId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    participantEmail: {
        type: String,
        required: true
    },
    participantName: {
        type: String,
        required: true
    },

    // Enrollment state
    enrolledAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['active', 'withdrawn', 'closed'],
        default: 'active'
    },
    submittedAt: {
        type: Date,
        default: null
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index: each participant can only enroll once per target
enrollmentSchema.index({ targetId: 1, participantId: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', enrollmentSchema);