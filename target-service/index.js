require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { initEventPublisher } = require('./services/eventPublisher');

const app = express();
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '15mb' }));
app.use('/media', express.static(path.join(process.cwd(), 'storage', 'uploads')));

// Minimal routes
const healthRoutes = require('./routes/health');
const targetsRoutes = require('./routes/targetRoutes');
app.use('/', healthRoutes);
app.use('/', targetsRoutes);

const PORT = process.env.PORT || 3002;
const DB_URL = process.env.DB_URL || 'mongodb://localhost:27017/targets';

// Connect to MongoDB
mongoose.connect(DB_URL)
    .then(() => {
        console.log('✓ Connected to MongoDB - Target Service');
        initEventPublisher().catch((error) => {
            console.error('[BROKER][target-service] init failed:', error.message);
        });
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Target Service, Running on port ${PORT}                  
            `);
        });
    })
    .catch((err) => {
        console.error('✗ MongoDB connection failed:', err);
        process.exit(1);
    });