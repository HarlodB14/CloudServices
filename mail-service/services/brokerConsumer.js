const { createBroker } = require('@photo-prestige/message-broker');
const { processFinalResultsPayload } = require('../controllers/mailController');
const { wasFinalResultsDispatched } = require('./mailLogService');

const broker = createBroker({
    serviceName: 'mail-service'
});

async function startBrokerConsumer() {
    await broker.consume({
        queue: process.env.BROKER_QUEUE_MAIL || 'mail.final-results',
        bindingKeys: ['target.finalized'],
        prefetch: Number(process.env.BROKER_PREFETCH || 5),
        onMessage: async(eventEnvelope) => {
            const payload = eventEnvelope && eventEnvelope.payload ? eventEnvelope.payload : {};
            const targetId = payload.targetId;

            if (!targetId) {
                throw new Error('target.finalized payload requires targetId');
            }

            const alreadyDispatched = await wasFinalResultsDispatched(targetId);
            if (alreadyDispatched) {
                console.log(`[BROKER][mail-service] target.finalized ignored (already dispatched) targetId=${targetId}`);
                return;
            }

            await processFinalResultsPayload(payload);
        }
    });
}

module.exports = {
    startBrokerConsumer
};