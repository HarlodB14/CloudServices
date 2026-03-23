const axios = require('axios');

const REGISTER_SERVICE_URL = process.env.REGISTER_SERVICE_URL;
const REQUEST_TIMEOUT_MS = Number(process.env.REGISTER_REQUEST_TIMEOUT_MS || 5000);

function buildHeaders(authContext = {}) {
    const headers = { 'Content-Type': 'application/json' };

    if (authContext.userId) headers['X-User-Id'] = String(authContext.userId);
    if (authContext.email) headers['X-User-Email'] = String(authContext.email);
    if (authContext.name) headers['X-User-Name'] = String(authContext.name);
    headers['X-User-Roles'] = (authContext.roles || []).join(',');
    headers['X-User-Permissions'] = (authContext.permissions || []).join(',');

    const internalSecret = String(process.env.INTERNAL_SERVICE_SECRET || '').trim();
    if (internalSecret) headers['X-Internal-Auth'] = internalSecret;

    return headers;
}

async function markSubmissionRecorded(targetId, participantId, authContext = {}) {
    if (!REGISTER_SERVICE_URL) {
        return { skipped: true, reason: 'REGISTER_SERVICE_URL not configured' };
    }

    const response = await axios.post(
        `${REGISTER_SERVICE_URL}/register/submission-recorded`, { targetId, participantId }, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: buildHeaders(authContext)
        }
    );

    return response.data;
}

module.exports = {
    markSubmissionRecorded
};