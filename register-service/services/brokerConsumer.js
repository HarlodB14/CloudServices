const mongoose = require('mongoose');
const { createBroker } = require('@photo-prestige/message-broker');
const Enrollment = require('../models/enrollment');

const broker = createBroker({
    serviceName: 'register-service'
});

async function handleSubmissionRecorded(payload) {
    const targetId = String(payload.targetId || '').trim();
    const participantId = String(payload.participantId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(targetId) || !mongoose.Types.ObjectId.isValid(participantId)) {
        throw new Error('Invalid targetId/participantId in target.submission.recorded event');
    }

    const submittedAt = payload.submittedAt ? new Date(payload.submittedAt) : new Date();

    await Enrollment.findOneAndUpdate({
        targetId: new mongoose.Types.ObjectId(targetId),
        participantId: new mongoose.Types.ObjectId(participantId)
    }, { submittedAt }, { new: true });
}

async function startBrokerConsumer() {
    await broker.consume({
        queue: process.env.BROKER_QUEUE_REGISTER || 'register.submission-recorded',
        bindingKeys: ['target.submission.recorded'],
        prefetch: Number(process.env.BROKER_PREFETCH || 10),
        onMessage: async(eventEnvelope) => {
            const payload = eventEnvelope && eventEnvelope.payload ? eventEnvelope.payload : {};
            await handleSubmissionRecorded(payload);
        }
    });
}

module.exports = {
    startBrokerConsumer
};