// This file is deprecated - import from @photo-prestige/auth-utils instead
// Kept for backwards compatibility during transition

const { verifyTokenFromXHeaders, checkOwnership } = require('@photo-prestige/auth-utils');

module.exports = {
    verifyTargetOwnership: verifyTokenFromXHeaders(),
    checkTargetOwnership: checkOwnership
};