const axios = require('axios');

const CLOCK_SERVICE_URL = process.env.CLOCK_SERVICE_URL;
const REQUEST_TIMEOUT_MS = Number(process.env.CLOCK_REQUEST_TIMEOUT_MS || 7000);

function buildHeaders(authContext = {}) {
    const headers = { 'Content-Type': 'application/json' };

    if (authContext.userId) headers['X-User-Id'] = String(authContext.userId);
    if (authContext.email) headers['X-User-Email'] = String(authContext.email);
    if (authContext.name) headers['X-User-Name'] = String(authContext.name);
    headers['X-User-Roles'] = (authContext.roles || []).join(',');
    headers['X-User-Permissions'] = (authContext.permissions || []).join(',');

    return headers;
}

async function startClock(targetId, deadline, authContext = {}) {
    if (!CLOCK_SERVICE_URL) {
        return { skipped: true, reason: 'CLOCK_SERVICE_URL not configured' };
    }

    const response = await axios.post(
        `${CLOCK_SERVICE_URL}/clock/targets/start`, { targetId, deadline }, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: buildHeaders(authContext)
        }
    );

    return response.data;
}

async function cancelClock(targetId, authContext = {}) {
    if (!CLOCK_SERVICE_URL) {
        return { skipped: true, reason: 'CLOCK_SERVICE_URL not configured' };
    }

    const response = await axios.delete(
        `${CLOCK_SERVICE_URL}/clock/targets/${targetId}`, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: buildHeaders(authContext)
        }
    );

    return response.data;
}

module.exports = {
    startClock,
    cancelClock
};