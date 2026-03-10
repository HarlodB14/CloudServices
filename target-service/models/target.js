const mongoose = require('mongoose');

const targetSchema = new mongoose.Schema({
    // Competition Info
    title: { type: String, required: true },
    description: { type: String },
    imageUrl: { type: String, required: true },

    // Owner Info
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ownerEmail: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Legacy reference

    // Location (GeoJSON for geospatial queries)
    location: {
        longitude: { type: Number, required: true },
        latitude: { type: Number, required: true },
        radius: { type: Number, required: true, default: 50 } // in meters
    },

    // Timeline
    createdAt: { type: Date, default: Date.now },
    deadline: { type: Date, required: true },
    status: {
        type: String,
        enum: ['active', 'closed', 'completed'],
        default: 'active'
    },
    updatedAt: { type: Date, default: Date.now },

    // Prize/Info
    prize: { type: String, default: '' },

    // AI Analysis of target image
    aiAnalysis: {
        labels: [String],
        confidence: [Number],
        timestamp: Date,
        service: String // 'google-vision' or 'imagga'
    },

    // Submissions & Results
    submissions: [{
        _id: mongoose.Schema.Types.ObjectId,
        participantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        participantEmail: { type: String, required: true },
        participantName: { type: String },
        photoUrl: { type: String },
        score: { type: Number, default: null }, // 0-100
        similarity: { type: Number, default: null }, // AI score
        submittedAt: { type: Date, default: Date.now },
        finalRank: { type: Number, default: null }, // Combined score
        aiAnalysis: {
            labels: [String],
            confidence: [Number],
            timestamp: Date,
            service: String // 'google-vision' or 'imagga'
        },
        userRating: { type: String, enum: ['thumbs-up', 'thumbs-down', null], default: null }
    }],

    submissionCount: { type: Number, default: 0 },

    winner: {
        participantId: mongoose.Schema.Types.ObjectId,
        participantEmail: String,
        participantName: String,
        score: Number,
        submittedAt: Date
    },

    // Analytics
    viewCount: { type: Number, default: 0 }
});

// Create indexes for performance
targetSchema.index({ ownerId: 1 });
targetSchema.index({ deadline: 1 });
targetSchema.index({ status: 1 });
targetSchema.index({ createdAt: -1 });

// Hook to update updatedAt on save
targetSchema.pre('save', function() {
    this.updatedAt = new Date();
});

module.exports = mongoose.model('Target', targetSchema);