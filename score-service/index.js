require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const scoreRoutes = require('./routes/scoreRoutes');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'Score service healthy', timestamp: new Date() });
});

app.use('/', scoreRoutes);

const PORT = process.env.PORT || 3004;
const DB_URL = process.env.DB_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/score';

mongoose.connect(DB_URL)
    .then(() => {
        console.log('✓ Connected to MongoDB - Score Service');
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Score Service running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('✗ MongoDB connection failed:', err);
        process.exit(1);
    });