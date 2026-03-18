const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/user');
const { sendRegistrationConfirmation } = require('../services/mailServiceClient');

function generateTemporaryPassword(length = 14) {
    // URL-safe + human-usable format
    return crypto.randomBytes(Math.ceil(length * 0.75)).toString('base64url').slice(0, length);
}

// registratie nieuwe gebruiker
async function register(req, res) {
    const { name, email, password, bio, avatar, registerAs, generateCredentials } = req.body;
    try {
        // Validate input
        if (!name || !email) {
            return res.status(400).json({ error: 'Name and email are required' });
        }

        const shouldGenerateCredentials = generateCredentials !== false;
        if (!shouldGenerateCredentials && !password) {
            return res.status(400).json({ error: 'password is required when generateCredentials=false' });
        }

        const plainPassword = shouldGenerateCredentials ? generateTemporaryPassword() : password;

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
            password: plainPassword,
            roles,
            permissions,
            bio: bio || '',
            avatar: avatar || null,
            mustChangePassword: shouldGenerateCredentials,
            passwordChangedAt: shouldGenerateCredentials ? null : new Date()
        };

        const newUser = new User(userData);
        const savedUser = await newUser.save();

        try {
            await sendRegistrationConfirmation({
                name: savedUser.name,
                email: savedUser.email,
                roles: savedUser.roles,
                generatedCredentials: shouldGenerateCredentials ? {
                    username: savedUser.email,
                    temporaryPassword: plainPassword
                } : null
            });
        } catch (mailError) {
            console.error('Registration confirmation email failed:', mailError.message);
            // Never fail registration because of mail
        }

        const exposeGeneratedCredentials = String(process.env.AUTH_EXPOSE_GENERATED_CREDENTIALS || 'true') === 'true';

        res.status(201).json({
            message: 'User registered successfully',
            userId: savedUser._id,
            generatedCredentials: (shouldGenerateCredentials && exposeGeneratedCredentials) ? {
                username: savedUser.email,
                temporaryPassword: plainPassword
            } : undefined,
            user: {
                id: savedUser._id,
                name: savedUser.name,
                email: savedUser.email,
                roles: savedUser.roles,
                permissions: savedUser.permissions,
                mustChangePassword: savedUser.mustChangePassword
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
                permissions: user.permissions,
                mustChangePassword: Boolean(user.mustChangePassword)
            },
            mustChangePassword: Boolean(user.mustChangePassword)
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
}

async function changePassword(req, res) {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'currentPassword and newPassword are required' });
        }

        if (String(newPassword).length < 8) {
            return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        user.password = newPassword;
        user.mustChangePassword = false;
        user.passwordChangedAt = new Date();
        await user.save();

        return res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        return res.status(500).json({ error: 'Server error: ' + error.message });
    }
}

module.exports = { register, login, changePassword };