const axios = require('axios');
const { buildSystemHeaders } = require('./identityHeaders');

const REGISTER_SERVICE_URL = process.env.REGISTER_SERVICE_URL || 'http://register-service:3003';
const REQUEST_TIMEOUT_MS = Number(process.env.CLOCK_REQUEST_TIMEOUT_MS || 7000);

async function closeTargetEnrollments(targetId) {
    const response = await axios.post(
        `${REGISTER_SERVICE_URL}/register/target/${targetId}/close`, {}, {
            timeout: REQUEST_TIMEOUT_MS,
            headers: buildSystemHeaders()
        }
    );

    return response.data;
}

module.exports = {
    closeTargetEnrollments
};