require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

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
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Target Service, Running on port ${PORT}                  
            `);
        });
    })
    .catch((err) => {
        console.error('✗ MongoDB connection failed:', err);
        process.exit(1);
    });