const { verifyIdentity, requireRole } = require('@photo-prestige/auth-utils');

const verifyServiceToken = verifyIdentity();

module.exports = { verifyServiceToken, requireRole };