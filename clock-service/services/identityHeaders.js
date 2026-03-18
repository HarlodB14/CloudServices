const { buildIdentityHeaders } = require('@photo-prestige/auth-utils');

function buildSystemHeaders() {
    return buildIdentityHeaders({
        userId: process.env.CLOCK_SERVICE_SYSTEM_USER_ID || 'clock-service-system',
        email: process.env.CLOCK_SERVICE_SYSTEM_USER_EMAIL || 'clock-service@internal.local',
        name: process.env.CLOCK_SERVICE_SYSTEM_USER_NAME || 'Clock Service System',
        roles: process.env.CLOCK_SERVICE_SYSTEM_ROLES || 'admin',
        permissions: process.env.CLOCK_SERVICE_SYSTEM_PERMISSIONS || 'manage:target_deadline'
    });
}

module.exports = {
    buildSystemHeaders
};