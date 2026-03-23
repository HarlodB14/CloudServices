const mongoose = require('mongoose');
const MailDispatchLog = require('../models/mailDispatchLog');

async function logDispatch({ type, targetId, participantId, recipientEmail, meta = {} }) {
    const document = {
        type,
        recipientEmail,
        meta
    };

    if (targetId && mongoose.Types.ObjectId.isValid(targetId)) {
        document.targetId = new mongoose.Types.ObjectId(targetId);
    }

    if (participantId && mongoose.Types.ObjectId.isValid(participantId)) {
        document.participantId = new mongoose.Types.ObjectId(participantId);
    }

    return MailDispatchLog.create(document);
}

async function hasRecentReminder(targetId, participantId, minimumGapMs) {
    const query = {
        type: 'reminder',
        targetId: new mongoose.Types.ObjectId(targetId),
        participantId: new mongoose.Types.ObjectId(participantId)
    };

    const lastReminder = await MailDispatchLog.findOne(query).sort({ sentAt: -1 }).lean();

    if (!lastReminder) {
        return false;
    }

    const elapsed = Date.now() - new Date(lastReminder.sentAt).getTime();
    return elapsed < minimumGapMs;
}

async function wasFinalResultsDispatched(targetId) {
    if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
        return false;
    }

    const existing = await MailDispatchLog.findOne({
        type: 'owner-summary',
        targetId: new mongoose.Types.ObjectId(targetId)
    }).lean();

    return Boolean(existing);
}

module.exports = {
    logDispatch,
    hasRecentReminder,
    wasFinalResultsDispatched
};