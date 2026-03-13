require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const enrollmentRoutes = require('./routes/enrollmentRoutes');

const app = express();
const PORT = process.env.PORT || 3003;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/register';

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'Register service healthy' });
});

// Routes
app.use('/register', enrollmentRoutes);

// Connect to MongoDB
mongoose.connect(MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    .then(() => console.log('✓ Connected to MongoDB (register DB)'))
    .catch(err => {
        console.error('✗ MongoDB connection failed:', err.message);
        process.exit(1);
    });

// Start server
app.listen(PORT, () => {
    console.log(`✓ Register service running on port ${PORT}`);
});

module.exports = app;