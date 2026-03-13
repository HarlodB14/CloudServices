// This file is deprecated - import from @photo-prestige/auth-utils instead
// Kept for backwards compatibility during transition

const { verifyTokenFromHeader, requireParticipant } = require('@photo-prestige/auth-utils');

module.exports = {
    verifyToken: verifyTokenFromHeader,
    requireParticipant
};