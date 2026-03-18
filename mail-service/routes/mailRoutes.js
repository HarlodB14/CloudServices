const express = require('express');
const {
    verifyIdentity,
    requirePermission,
    requireParticipant,
    requireAdmin
} = require('@photo-prestige/auth-utils');
const {
    sendFinalResults,
    sendEnrollmentConfirmation,
    sendRegistrationConfirmation,
    triggerTargetReminders,
    triggerGlobalReminders
} = require('../controllers/mailController');

const router = express.Router();

router.use(verifyIdentity());

// Internal endpoints, expected to be called by other services
router.post('/registrations/confirmation', requirePermission('manage:users'), sendRegistrationConfirmation);
router.post('/targets/:targetId/final-results', requirePermission('manage:target_deadline'), sendFinalResults);
router.post('/enrollments/confirmation', requireParticipant, sendEnrollmentConfirmation);
router.post('/targets/:targetId/reminders', requirePermission('manage:target_deadline'), triggerTargetReminders);
router.post('/reminders/run', requireAdmin, triggerGlobalReminders);

module.exports = router;