const axios = require('axios');

const SCORE_SERVICE_URL = process.env.SCORE_SERVICE_URL || 'http://score-service:3004';
const SCORE_REQUEST_TIMEOUT_MS = Number(process.env.SCORE_REQUEST_TIMEOUT_MS || 8000);

function buildHeaders() {
    const headers = { 'Content-Type': 'application/json' };

    if (process.env.SCORE_SERVICE_API_KEY) {
        headers['x-service-key'] = process.env.SCORE_SERVICE_API_KEY;
    }

    return headers;
}

async function analyzeTargetImage(imageUrl) {
    const response = await axios.post(
        `${SCORE_SERVICE_URL}/scores/targets/analyze`, { imageUrl }, {
            headers: buildHeaders(),
            timeout: SCORE_REQUEST_TIMEOUT_MS
        }
    );

    return response.data.analysis || null;
}

async function evaluateSubmission(payload) {
    const response = await axios.post(
        `${SCORE_SERVICE_URL}/scores/evaluations`,
        payload, {
            headers: buildHeaders(),
            timeout: SCORE_REQUEST_TIMEOUT_MS
        }
    );

    return response.data;
}

async function finalizeTarget(targetId) {
    const response = await axios.post(
        `${SCORE_SERVICE_URL}/scores/targets/${targetId}/finalize`, {}, {
            headers: buildHeaders(),
            timeout: SCORE_REQUEST_TIMEOUT_MS
        }
    );

    return response.data;
}

async function getTargetLeaderboard(targetId, page = 1, limit = 100) {
    const response = await axios.get(
        `${SCORE_SERVICE_URL}/scores/targets/${targetId}/leaderboard`, {
            headers: buildHeaders(),
            params: { page, limit },
            timeout: SCORE_REQUEST_TIMEOUT_MS
        }
    );

    return response.data;
}

module.exports = {
    analyzeTargetImage,
    evaluateSubmission,
    finalizeTarget,
    getTargetLeaderboard
};