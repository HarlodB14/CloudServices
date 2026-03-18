const axios = require('axios');

const TARGET_SERVICE_URL = process.env.TARGET_SERVICE_URL || 'http://target-service:3002';
const REQUEST_TIMEOUT_MS = Number(process.env.MAIL_REQUEST_TIMEOUT_MS || 8000);

async function getTargetById(targetId) {
    const response = await axios.get(`${TARGET_SERVICE_URL}/targets/${targetId}`, {
        timeout: REQUEST_TIMEOUT_MS
    });
    return response.data;
}

async function getActiveTargets(page = 1, limit = 100) {
    const response = await axios.get(`${TARGET_SERVICE_URL}/targets`, {
        timeout: REQUEST_TIMEOUT_MS,
        params: {
            status: 'active',
            page,
            limit
        }
    });

    return response.data;
}

module.exports = {
    getTargetById,
    getActiveTargets
};