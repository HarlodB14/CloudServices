const express = require('express');
const { verifyIdentity, requirePermission } = require('@photo-prestige/auth-utils');
const {
    startCompetitionClock,
    cancelCompetitionClock,
    getCompetitionClock,
    getClockHealth
} = require('../controllers/clockController');

const router = express.Router();

router.get('/health', getClockHealth);

router.use(verifyIdentity());

router.post('/targets/start', requirePermission('manage:target_deadline'), startCompetitionClock);
router.delete('/targets/:targetId', requirePermission('manage:target_deadline'), cancelCompetitionClock);
router.get('/targets/:targetId', requirePermission('manage:target_deadline'), getCompetitionClock);

module.exports = router;