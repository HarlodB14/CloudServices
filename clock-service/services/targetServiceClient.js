const axios = require('axios');
const { buildSystemHeaders } = require('./identityHeaders');

const TARGET_SERVICE_URL = process.env.TARGET_SERVICE_URL || 'http://target-service:3002';
const REQUEST_TIMEOUT_MS = Number(process.env.CLOCK_REQUEST_TIMEOUT_MS || 7000);

async function finalizeTarget(targetId) {
    const response = await axios.post(
        `${TARGET_SERVICE_URL}/targets/${targetId}/finalize`, {}, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: buildSystemHeaders()
        }
    );

    return response.data;
}

module.exports = {
    finalizeTarget
};