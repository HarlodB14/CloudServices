const axios = require('axios');

const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 5000);

function hasImaggaConfig() {
    return Boolean(process.env.IMAGGA_API_KEY && process.env.IMAGGA_API_SECRET);
}

function hasGoogleVisionConfig() {
    return Boolean(process.env.GOOGLE_VISION_API_KEY);
}

/**
 * AI Scoring Service - Supports both Google Vision and Imagga
 * Configure which service to use via AI_SERVICE env variable
 */

/**
 * Analyze image using Imagga API (no credit card required)
 * @param {string} imageUrl - URL of the image to analyze
 * @returns {Object} - Analysis result with labels and confidence scores
 */
async function analyzeWithImagga(imageUrl) {
    try {
        const apiKey = process.env.IMAGGA_API_KEY;
        const apiSecret = process.env.IMAGGA_API_SECRET;

        if (!apiKey || !apiSecret) {
            throw new Error('Imagga API credentials not configured');
        }

        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await axios.get('https://api.imagga.com/v2/tags', {
            params: { image_url: imageUrl },
            headers: {
                'Authorization': `Basic ${auth}`
            },
            timeout: AI_REQUEST_TIMEOUT_MS
        });

        const tags = response.data.result.tags;

        // Extract top labels and confidences
        const labels = tags.slice(0, 10).map(tag => tag.tag.en);
        const confidence = tags.slice(0, 10).map(tag => tag.confidence);

        return {
            labels,
            confidence,
            timestamp: new Date(),
            service: 'imagga',
            rawData: tags
        };
    } catch (error) {
        console.error('Imagga API error:', error.response.data || error.message);
        throw new Error('Failed to analyze image with Imagga: ' + error.message);
    }
}

/**
 * Analyze image using Google Vision API
 * @param {string} imageUrl - URL of the image to analyze
 * @returns {Object} - Analysis result with labels and confidence scores
 */
async function analyzeWithGoogleVision(imageUrl) {
    try {
        const apiKey = process.env.GOOGLE_VISION_API_KEY;

        if (!apiKey) {
            throw new Error('Google Vision API key not configured');
        }

        const response = await axios.post(
            `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
                requests: [{
                    image: { source: { imageUri: imageUrl } },
                    features: [
                        { type: 'LABEL_DETECTION', maxResults: 10 },
                        { type: 'LANDMARK_DETECTION', maxResults: 5 }
                    ]
                }]
            }, {
                timeout: AI_REQUEST_TIMEOUT_MS
            }
        );

        const annotations = response.data.responses[0];
        const labelAnnotations = annotations.labelAnnotations || [];
        const landmarkAnnotations = annotations.landmarkAnnotations || [];

        // Combine labels and landmarks
        const allLabels = [
            ...labelAnnotations.map(l => l.description),
            ...landmarkAnnotations.map(l => l.description)
        ];
        const allConfidence = [
            ...labelAnnotations.map(l => l.score * 100),
            ...landmarkAnnotations.map(l => l.score * 100)
        ];

        return {
            labels: allLabels,
            confidence: allConfidence,
            timestamp: new Date(),
            service: 'google-vision',
            rawData: { labelAnnotations, landmarkAnnotations }
        };
    } catch (error) {
        console.error('Google Vision API error:', error.response ? error.response.data : error.message);
        throw new Error('Failed to analyze image with Google Vision: ' + error.message);
    }
}

/**
 * Calculate similarity score between two sets of labels
 * @param {Array} targetLabels - Labels from target image
 * @param {Array} targetConfidence - Confidence scores for target labels
 * @param {Array} submissionLabels - Labels from submission image
 * @param {Array} submissionConfidence - Confidence scores for submission labels
 * @returns {number} - Similarity score (0-100)
 */
function calculateSimilarity(targetLabels, targetConfidence, submissionLabels, submissionConfidence) {
    if (!targetLabels || !submissionLabels || targetLabels.length === 0 || submissionLabels.length === 0) {
        return 0;
    }

    // Normalize labels to lowercase for comparison
    const targetSet = new Set(targetLabels.map(l => l.toLowerCase()));
    const submissionSet = new Set(submissionLabels.map(l => l.toLowerCase()));

    // Calculate matching labels
    let matchingScore = 0;
    let totalWeight = 0;

    submissionLabels.forEach((label, index) => {
        const normalizedLabel = label.toLowerCase();
        const confidence = submissionConfidence[index] || 50;

        if (targetSet.has(normalizedLabel)) {
            // Direct match - weight by confidence
            matchingScore += confidence;
            totalWeight += confidence;
        } else {
            // No match - penalize
            totalWeight += confidence * 0.3;
        }
    });

    // Calculate Jaccard similarity for additional context
    const intersection = new Set([...targetSet].filter(x => submissionSet.has(x)));
    const union = new Set([...targetSet, ...submissionSet]);
    const jaccardScore = (intersection.size / union.size) * 100;

    // Combine weighted match score (70%) with Jaccard similarity (30%)
    const weightedScore = totalWeight > 0 ? (matchingScore / totalWeight) * 100 : 0;
    const finalScore = (weightedScore * 0.7) + (jaccardScore * 0.3);

    return Math.round(Math.min(100, Math.max(0, finalScore)));
}

/**
 * Main function to analyze image and calculate similarity
 * @param {string} imageUrl - URL of image to analyze
 * @param {Object} targetAnalysis - Analysis data from target image
 * @returns {Object} - Analysis result with similarity score
 */
async function analyzeAndScore(imageUrl, targetAnalysis) {
    try {
        const aiService = process.env.AI_SERVICE || 'imagga';

        if (aiService === 'google-vision' && !hasGoogleVisionConfig()) {
            return {
                labels: [],
                confidence: [],
                timestamp: new Date(),
                service: 'google-vision',
                similarity: 0,
                skipped: true,
                reason: 'Google Vision API key not configured'
            };
        }

        if (aiService !== 'google-vision' && !hasImaggaConfig()) {
            return {
                labels: [],
                confidence: [],
                timestamp: new Date(),
                service: 'imagga',
                similarity: 0,
                skipped: true,
                reason: 'Imagga credentials not configured'
            };
        }

        let analysis;
        if (aiService === 'google-vision') {
            analysis = await analyzeWithGoogleVision(imageUrl);
        } else {
            analysis = await analyzeWithImagga(imageUrl);
        }

        // Calculate similarity if target analysis exists
        let similarity = 0;
        if (targetAnalysis && targetAnalysis.labels) {
            similarity = calculateSimilarity(
                targetAnalysis.labels,
                targetAnalysis.confidence,
                analysis.labels,
                analysis.confidence
            );
        }

        return {
            ...analysis,
            similarity
        };
    } catch (error) {
        console.error('AI scoring error:', error.message);
        throw error;
    }
}

/**
 * Store AI analysis in target model
 * Used when creating a new target
 */
async function analyzeTargetImage(imageUrl) {
    const aiService = process.env.AI_SERVICE || 'imagga';

    if (aiService === 'google-vision' && !hasGoogleVisionConfig()) {
        return null;
    }

    if (aiService !== 'google-vision' && !hasImaggaConfig()) {
        return null;
    }

    if (aiService === 'google-vision') {
        return await analyzeWithGoogleVision(imageUrl);
    } else {
        return await analyzeWithImagga(imageUrl);
    }
}

module.exports = {
    analyzeAndScore,
    analyzeTargetImage,
    calculateSimilarity
};