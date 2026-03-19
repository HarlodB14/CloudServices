const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyTargetOwnership } = require('../middleware/authMiddleware');
const targetController = require('../controllers/targetController');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024)
    }
});

// Public routes (no auth)
router.get('/targets', targetController.getAllTargets);
router.get('/targets/:id', targetController.getTargetById);

// Participant routes (require auth via gateway)
router.post('/targets/:id/submit', targetController.submitPhoto);
router.get('/targets/:id/my-submission', targetController.getMySubmission);
router.delete('/targets/:id/my-submission', targetController.deleteMySubmission);
router.post('/targets/:id/rate', targetController.rateTarget);

// Protected routes (require auth via gateway + ownership)
router.post('/uploads', upload.single('image'), targetController.uploadImage);
router.post('/targets', verifyTargetOwnership, targetController.createTarget);
router.put('/targets/:id', verifyTargetOwnership, targetController.updateTarget);
router.delete('/targets/:id', verifyTargetOwnership, targetController.deleteTarget);
router.delete('/targets/:id/submissions/:submissionId', verifyTargetOwnership, targetController.deleteSubmissionByOwner);
router.get('/targets/:id/scores', verifyTargetOwnership, targetController.getTargetScores);
router.post('/targets/:id/finalize', verifyTargetOwnership, targetController.finalizeTarget);

module.exports = router;