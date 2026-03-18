const express = require('express');
const { requireServiceKey } = require('../middleware/serviceAuth');
const {
    analyzeTarget,
    evaluateSubmission,
    getTargetLeaderboard,
    getParticipantScore,
    finalizeTargetScores
} = require('../controllers/scoreController');

const router = express.Router();

router.post('/scores/targets/analyze', requireServiceKey, analyzeTarget);
router.post('/scores/evaluations', requireServiceKey, evaluateSubmission);
router.get('/scores/targets/:targetId/leaderboard', getTargetLeaderboard);
router.get('/scores/targets/:targetId/participants/:participantId', getParticipantScore);
router.post('/scores/targets/:targetId/finalize', requireServiceKey, finalizeTargetScores);

module.exports = router;