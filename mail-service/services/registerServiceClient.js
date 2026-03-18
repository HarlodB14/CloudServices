const axios = require('axios');

const REGISTER_SERVICE_URL = process.env.REGISTER_SERVICE_URL || 'http://register-service:3003';
const REQUEST_TIMEOUT_MS = Number(process.env.MAIL_REQUEST_TIMEOUT_MS || 8000);

function buildSystemHeaders() {
    const roles = (process.env.MAIL_SERVICE_SYSTEM_ROLES || 'admin').split(',').map((value) => value.trim()).filter(Boolean);
    const permissions = (process.env.MAIL_SERVICE_SYSTEM_PERMISSIONS || 'manage:target_deadline').split(',').map((value) => value.trim()).filter(Boolean);

    return {
        'X-User-Id': process.env.MAIL_SERVICE_SYSTEM_USER_ID || 'mail-service-system',
        'X-User-Email': process.env.MAIL_SERVICE_SYSTEM_USER_EMAIL || 'mail-service@internal.local',
        'X-User-Name': process.env.MAIL_SERVICE_SYSTEM_USER_NAME || 'Mail Service System',
        'X-User-Roles': roles.join(','),
        'X-User-Permissions': permissions.join(',')
    };
}

async function getTargetEnrollments(targetId, status = 'active') {
    const response = await axios.get(`${REGISTER_SERVICE_URL}/register/target/${targetId}`, {
        timeout: REQUEST_TIMEOUT_MS,
        params: { status },
        headers: buildSystemHeaders()
    });

    return response.data;
}

module.exports = {
    getTargetEnrollments
};