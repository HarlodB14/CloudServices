const express = require('express');
const router = express.Router();
const { verifyIdentity, requireParticipant, requirePermission } = require('@photo-prestige/auth-utils');
const enrollmentController = require('../controllers/enrollmentController');

router.use(verifyIdentity());

// Authenticated participant routes
router.post('/target/:targetId', requireParticipant, enrollmentController.registerForTarget);
router.delete('/target/:targetId', requireParticipant, enrollmentController.withdrawFromTarget);
router.get('/target/:targetId/my-enrollment', requireParticipant, enrollmentController.getEnrollmentByUserTarget);

// Internal/service routes (called by clock-service, mail-service, target-service)
router.get('/target/:targetId', requirePermission('manage:target_deadline'), enrollmentController.getTargetEnrollments);
router.post('/target/:targetId/close', requirePermission('manage:target_deadline'), enrollmentController.closeTargetEnrollments);
router.post('/submission-recorded', requirePermission('upload:submission'), enrollmentController.markSubmitted);

module.exports = router;