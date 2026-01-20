const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const user = require('../models/user');
const user = require('../models/user');
const router = express.Router();

//registratie nieuwe gebruiker
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const newUser = new user({ name, email, password });
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully' });

    } catch (error) {
        res.status(400).json({ error: 'User already exists' });
    }
});

// login user en JWT genereren
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await user.findOne({ email });
        if (!User) return res.status(404).json({ error: 'User not found' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});