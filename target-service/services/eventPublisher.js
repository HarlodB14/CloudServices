const { createBroker } = require('@photo-prestige/message-broker');

const broker = createBroker({
    serviceName: 'target-service'
});

async function initEventPublisher() {
    try {
        await broker.connect();
    } catch (error) {
        console.error('[BROKER][target-service] init failed:', error.message);
    }
}

async function publishSubmissionRecordedEvent({ targetId, participantId, submittedAt }) {
    await broker.publish('target.submission.recorded', {
        targetId,
        participantId,
        submittedAt: submittedAt || new Date().toISOString()
    });
}

async function publishTargetFinalizedEvent({ targetId, targetTitle, deadline, ownerEmail, winner, leaderboard }) {
    await broker.publish('target.finalized', {
        targetId,
        targetTitle,
        deadline,
        ownerEmail,
        winner: winner || null,
        leaderboard: leaderboard || []
    });
}

module.exports = {
    initEventPublisher,
    publishSubmissionRecordedEvent,
    publishTargetFinalizedEvent
};