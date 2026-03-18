const axios = require('axios');

const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 5000);

function hasImaggaConfig() {
    return Boolean(process.env.IMAGGA_API_KEY && process.env.IMAGGA_API_SECRET);
}

function hasGoogleVisionConfig() {
    return Boolean(process.env.GOOGLE_VISION_API_KEY);
}

async function analyzeWithImagga(imageUrl) {
    const apiKey = process.env.IMAGGA_API_KEY;
    const apiSecret = process.env.IMAGGA_API_SECRET;

    if (!apiKey || !apiSecret) {
        throw new Error('Imagga API credentials not configured');
    }

    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

    const response = await axios.get('https://api.imagga.com/v2/tags', {
        params: { image_url: imageUrl },
        headers: { Authorization: `Basic ${auth}` },
        timeout: AI_REQUEST_TIMEOUT_MS
    });

    const tags = response.data.result.tags || [];

    return {
        labels: tags.slice(0, 10).map((tag) => tag.tag.en),
        confidence: tags.slice(0, 10).map((tag) => tag.confidence),
        timestamp: new Date(),
        service: 'imagga',
        rawData: tags
    };
}

async function analyzeWithGoogleVision(imageUrl) {
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
        }, { timeout: AI_REQUEST_TIMEOUT_MS }
    );

    const annotations = (response.data && response.data.responses && response.data.responses[0]) || {};
    const labelAnnotations = annotations.labelAnnotations || [];
    const landmarkAnnotations = annotations.landmarkAnnotations || [];

    return {
        labels: [
            ...labelAnnotations.map((l) => l.description),
            ...landmarkAnnotations.map((l) => l.description)
        ],
        confidence: [
            ...labelAnnotations.map((l) => (l.score || 0) * 100),
            ...landmarkAnnotations.map((l) => (l.score || 0) * 100)
        ],
        timestamp: new Date(),
        service: 'google-vision',
        rawData: { labelAnnotations, landmarkAnnotations }
    };
}

function calculateSimilarity(targetLabels = [], submissionLabels = [], submissionConfidence = []) {
    if (!targetLabels.length || !submissionLabels.length) {
        return 0;
    }

    const targetSet = new Set(targetLabels.map((l) => String(l).toLowerCase()));
    const submissionSet = new Set(submissionLabels.map((l) => String(l).toLowerCase()));

    let matchingScore = 0;
    let totalWeight = 0;

    submissionLabels.forEach((label, index) => {
        const normalized = String(label).toLowerCase();
        const confidence = submissionConfidence[index] || 50;

        if (targetSet.has(normalized)) {
            matchingScore += confidence;
            totalWeight += confidence;
            return;
        }

        totalWeight += confidence * 0.3;
    });

    const intersection = new Set([...targetSet].filter((x) => submissionSet.has(x)));
    const union = new Set([...targetSet, ...submissionSet]);
    const jaccardScore = union.size ? (intersection.size / union.size) * 100 : 0;

    const weightedScore = totalWeight > 0 ? (matchingScore / totalWeight) * 100 : 0;
    const finalScore = (weightedScore * 0.7) + (jaccardScore * 0.3);

    return Math.round(Math.max(0, Math.min(100, finalScore)));
}

async function analyzeImage(imageUrl) {
    const provider = process.env.AI_SERVICE || 'imagga';

    if (provider === 'google-vision') {
        if (!hasGoogleVisionConfig()) {
            return { skipped: true, reason: 'Google Vision API key not configured', labels: [], confidence: [], service: 'google-vision', timestamp: new Date() };
        }
        return analyzeWithGoogleVision(imageUrl);
    }

    if (!hasImaggaConfig()) {
        return { skipped: true, reason: 'Imagga credentials not configured', labels: [], confidence: [], service: 'imagga', timestamp: new Date() };
    }

    return analyzeWithImagga(imageUrl);
}

module.exports = {
    analyzeImage,
    calculateSimilarity
};