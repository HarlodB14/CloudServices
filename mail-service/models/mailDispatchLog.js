const mongoose = require('mongoose');

const mailDispatchLogSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['reminder', 'participant-score', 'owner-summary', 'enrollment-confirmation', 'registration-confirmation'],
        required: true,
        index: true
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
        default: null
    },
    participantId: {
        type: mongoose.Schema.Types.ObjectId,
        index: true,
        default: null
    },
    recipientEmail: {
        type: String,
        required: true,
        index: true
    },
    sentAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    meta: {
        type: Object,
        default: {}
    }
});

mailDispatchLogSchema.index({ type: 1, targetId: 1, participantId: 1, sentAt: -1 });

module.exports = mongoose.model('MailDispatchLog', mailDispatchLogSchema);