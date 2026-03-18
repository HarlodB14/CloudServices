const axios = require('axios');

const MAIL_SERVICE_URL = process.env.MAIL_SERVICE_URL;
const REQUEST_TIMEOUT_MS = Number(process.env.MAIL_REQUEST_TIMEOUT_MS || 5000);

function buildSystemHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-User-Id': 'auth-service-system',
        'X-User-Email': 'auth-service@internal.local',
        'X-User-Name': 'Auth Service System',
        'X-User-Roles': 'admin',
        'X-User-Permissions': 'manage:users'
    };
}

async function sendRegistrationConfirmation({ name, email, roles, generatedCredentials = null }) {
    if (!MAIL_SERVICE_URL) {
        return { skipped: true, reason: 'MAIL_SERVICE_URL not configured' };
    }

    const response = await axios.post(
        `${MAIL_SERVICE_URL}/mail/registrations/confirmation`, { name, email, roles, generatedCredentials }, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: buildSystemHeaders()
        }
    );

    return response.data;
}

module.exports = { sendRegistrationConfirmation };