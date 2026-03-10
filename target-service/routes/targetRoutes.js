const express = require('express');
const router = express.Router();
const { verifyTargetOwnership } = require('../middleware/authMiddleware');
const targetController = require('../controllers/targetController');

// Public routes (no auth)
router.get('/targets', targetController.getAllTargets);
router.get('/targets/:id', targetController.getTargetById);

// Participant routes (require auth via gateway)
router.post('/targets/:id/submit', targetController.submitPhoto);
router.get('/targets/:id/my-submission', targetController.getMySubmission);
router.delete('/targets/:id/my-submission', targetController.deleteMySubmission);
router.post('/targets/:id/rate', targetController.rateTarget);

// Protected routes (require auth via gateway + ownership)
router.post('/targets', verifyTargetOwnership, targetController.createTarget);
router.put('/targets/:id', verifyTargetOwnership, targetController.updateTarget);
router.delete('/targets/:id', verifyTargetOwnership, targetController.deleteTarget);
router.get('/targets/:id/scores', verifyTargetOwnership, targetController.getTargetScores);
router.post('/targets/:id/finalize', verifyTargetOwnership, targetController.finalizeTarget);

module.exports = router;