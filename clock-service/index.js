require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const clockRoutes = require('./routes/clockRoutes');
const { loadScheduledCompetitions, getTimerCount } = require('./services/clockSchedulerService');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3006;
const DB_URL = process.env.DB_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/clock';

app.use('/clock', clockRoutes);

mongoose.connect(DB_URL)
    .then(async() => {
        const loaded = await loadScheduledCompetitions();
        console.log(`✓ Connected to MongoDB - Clock Service (loaded ${loaded} scheduled clocks, active timers=${getTimerCount()})`);

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Clock Service running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error('✗ MongoDB connection failed:', error.message);
        process.exit(1);
    });