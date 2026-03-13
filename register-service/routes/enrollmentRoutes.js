const express = require('express');
const router = express.Router();
const { verifyTokenFromHeader, requireParticipant } = require('@photo-prestige/auth-utils');
const enrollmentController = require('../controllers/enrollmentController');

// Authenticated participant routes
router.post('/target/:targetId', verifyTokenFromHeader(), requireParticipant, enrollmentController.registerForTarget);
router.delete('/target/:targetId', verifyTokenFromHeader(), requireParticipant, enrollmentController.withdrawFromTarget);
router.get('/target/:targetId/my-enrollment', verifyTokenFromHeader(), enrollmentController.getEnrollmentByUserTarget);

// Internal/service routes (called by clock-service, mail-service, target-service)
router.get('/target/:targetId', enrollmentController.getTargetEnrollments);
router.post('/target/:targetId/close', enrollmentController.closeTargetEnrollments);
router.post('/submission-recorded', enrollmentController.markSubmitted);

module.exports = router;