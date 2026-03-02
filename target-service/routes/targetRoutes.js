const express = require('express');
const router = express.Router();
const { verifyTargetOwnership } = require('../middleware/authMiddleware');
const targetController = require('../controllers/targetController');

// Public routes (no auth)
router.get('/targets', targetController.getAllTargets);
router.get('/targets/:id', targetController.getTargetById);

// Protected routes (require auth via gateway)
router.post('/targets', verifyTargetOwnership, targetController.createTarget);
router.put('/targets/:id', verifyTargetOwnership, targetController.updateTarget);
router.delete('/targets/:id', verifyTargetOwnership, targetController.deleteTarget);
router.get('/targets/:id/scores', verifyTargetOwnership, targetController.getTargetScores);

module.exports = router;