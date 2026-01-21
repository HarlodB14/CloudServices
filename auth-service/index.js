require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

console.log('mongoose:', mongoose);

const app = express()

app.use(express.json());

// mount auth routes
const authRoutes = require('./routes/authroutes');
app.use('/auth', authRoutes);

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

mongoose.connect(process.env.DB_URL)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => {
            console.log(`Auth Service running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('MongoDB connection failed:', err);
        process.exit(1);
    });



