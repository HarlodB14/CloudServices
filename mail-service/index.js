require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const mailRoutes = require('./routes/mailRoutes');
const { runGlobalReminderSweep } = require('./services/reminderService');
const { startBrokerConsumer } = require('./services/brokerConsumer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3005;
const DB_URL = process.env.DB_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/mail';

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'Mail service healthy',
        timestamp: new Date()
    });
});

app.use('/mail', mailRoutes);

const REMINDER_JOB_ENABLED = String(process.env.REMINDER_JOB_ENABLED || 'true') === 'true';
const REMINDER_JOB_FREQUENCY_MS = Number(process.env.REMINDER_JOB_FREQUENCY_MS || 5 * 60 * 1000);

async function startReminderLoop() {
    if (!REMINDER_JOB_ENABLED) {
        console.log('Reminder scheduler disabled');
        return;
    }

    console.log(`Reminder scheduler started (${REMINDER_JOB_FREQUENCY_MS}ms)`);

    setInterval(async() => {
        try {
            const result = await runGlobalReminderSweep(false);
            console.log(`[REMINDER-JOB] targets=${result.targets} sent=${result.sent} skipped=${result.skipped}`);
        } catch (error) {
            console.error('[REMINDER-JOB] failed:', error.message);
        }
    }, REMINDER_JOB_FREQUENCY_MS);
}

mongoose.connect(DB_URL)
    .then(async() => {
        console.log('✓ Connected to MongoDB - Mail Service');
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Mail Service running on port ${PORT}`);
        });
        try {
            await startBrokerConsumer();
        } catch (error) {
            console.error('[BROKER][mail-service] consumer failed to start:', error.message);
        }
        startReminderLoop();
    })
    .catch((err) => {
        console.error('✗ MongoDB connection failed:', err);
        process.exit(1);
    });