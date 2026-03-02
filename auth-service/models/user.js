const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    roles: {
        type: [String],
        default: ['participant'],
        enum: ['participant', 'target_owner', 'admin']
    },
    permissions: {
        type: [String],
        default: [],
        enum: [
            // Target management
            'create:target',
            'edit:own_target',
            'delete:own_target',
            'view:target_scores',
            'manage:target_deadline',

            // Submission management
            'upload:submission',
            'view:own_submission',
            'delete:own_submission',

            // User management (admin only)
            'manage:users',
            'manage:all_targets',
            'view:all_submissions'
        ]
    },
    location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number] // [longitude, latitude]
    },
    bio: { type: String },
    avatar: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Create geospatial index for location-based queries
userSchema.index({ location: '2dsphere' });


userSchema.pre('save', async function() {
    if (this.isModified('password')) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }
});


module.exports = mongoose.model('User', userSchema);