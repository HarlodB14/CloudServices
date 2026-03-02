const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/user');

// registratie nieuwe gebruiker
async function register(req, res) {
    const { name, email, password, bio, avatar, registerAs } = req.body;
    try {
        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Determine initial role based on registration type
        let roles = ['participant'];
        let permissions = ['upload:submission', 'view:own_submission', 'delete:own_submission'];

        if (registerAs === 'target_owner') {
            roles.push('target_owner');
            permissions.push('create:target', 'edit:own_target', 'delete:own_target', 'view:target_scores', 'manage:target_deadline');
        }

        const userData = {
            name,
            email,
            password,
            roles,
            permissions,
            bio: bio || '',
            avatar: avatar || null
        };

        const newUser = new User(userData);
        const savedUser = await newUser.save();

        res.status(201).json({
            message: 'User registered successfully',
            userId: savedUser._id,
            user: {
                id: savedUser._id,
                name: savedUser.name,
                email: savedUser.email,
                roles: savedUser.roles,
                permissions: savedUser.permissions
            }
        });

    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

// login user en JWT genereren
async function login(req, res) {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        // Include roles and permissions in JWT
        const token = jwt.sign({
                userId: user._id,
                email: user.email,
                name: user.name,
                roles: user.roles,
                permissions: user.permissions
            },
            process.env.JWT_SECRET, { expiresIn: '24h' }
        );
        res.json({
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                roles: user.roles,
                permissions: user.permissions
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
}

module.exports = { register, login };