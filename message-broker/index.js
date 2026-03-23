'use strict';

const amqp = require('amqplib');

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createBroker({
    serviceName = 'service',
    url = process.env.MESSAGE_BROKER_URL || 'amqp://rabbitmq:5672',
    exchange = process.env.MESSAGE_BROKER_EXCHANGE || 'photo-prestige.events',
    exchangeType = process.env.MESSAGE_BROKER_EXCHANGE_TYPE || 'topic',
    reconnectDelayMs = Number(process.env.MESSAGE_BROKER_RECONNECT_MS || 5000)
} = {}) {
    let connection = null;
    let channel = null;
    let connecting = null;

    async function connect() {
        if (channel) {
            return channel;
        }

        if (connecting) {
            return connecting;
        }

        connecting = (async() => {
            while (!channel) {
                try {
                    connection = await amqp.connect(url);
                    connection.on('error', (err) => {
                        console.error(`[BROKER:${serviceName}] connection error: ${err.message}`);
                    });
                    connection.on('close', () => {
                        console.warn(`[BROKER:${serviceName}] connection closed, reconnecting...`);
                        channel = null;
                        connection = null;
                    });

                    channel = await connection.createConfirmChannel();
                    await channel.assertExchange(exchange, exchangeType, { durable: true });
                    console.log(`[BROKER:${serviceName}] connected (${url}) exchange=${exchange}`);
                } catch (error) {
                    console.error(`[BROKER:${serviceName}] connect failed: ${error.message}`);
                    await delay(reconnectDelayMs);
                }
            }

            return channel;
        })();

        try {
            return await connecting;
        } finally {
            connecting = null;
        }
    }

    async function publish(routingKey, payload, options = {}) {
        const ch = await connect();

        const messageBuffer = Buffer.from(JSON.stringify({
            eventType: routingKey,
            emittedAt: new Date().toISOString(),
            payload
        }));

        ch.publish(exchange, routingKey, messageBuffer, {
            persistent: true,
            contentType: 'application/json',
            contentEncoding: 'utf-8',
            messageId: options.messageId || undefined,
            timestamp: Date.now(),
            headers: options.headers || {}
        });

        await ch.waitForConfirms();
    }

    async function consume({ queue, bindingKeys = [], prefetch = 10, onMessage }) {
        if (!queue) {
            throw new Error('queue is required');
        }
        if (typeof onMessage !== 'function') {
            throw new Error('onMessage handler is required');
        }

        const ch = await connect();
        await ch.prefetch(prefetch);
        await ch.assertQueue(queue, { durable: true });

        const keys = bindingKeys.length ? bindingKeys : ['#'];
        for (const key of keys) {
            await ch.bindQueue(queue, exchange, key);
        }

        await ch.consume(queue, async(msg) => {
            if (!msg) {
                return;
            }

            try {
                const raw = msg.content.toString('utf-8');
                const parsed = JSON.parse(raw);
                await onMessage(parsed, msg);
                ch.ack(msg);
            } catch (error) {
                console.error(`[BROKER:${serviceName}] consumer error: ${error.message}`);
                ch.nack(msg, false, true);
            }
        }, { noAck: false });

        console.log(`[BROKER:${serviceName}] consuming queue=${queue} keys=${keys.join(',')}`);
    }

    async function close() {
        try {
            if (channel) {
                await channel.close();
            }
        } finally {
            channel = null;
            if (connection) {
                await connection.close();
                connection = null;
            }
        }
    }

    return {
        connect,
        publish,
        consume,
        close
    };
}

module.exports = {
    createBroker
};