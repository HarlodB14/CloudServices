const mongoose = require('mongoose');

const REQUIRED_EVALUATION_FIELDS = ['targetId', 'submissionId', 'participantId', 'participantEmail', 'imageUrl', 'targetCreatedAt', 'targetDeadline'];

class ScoreValidator {

    static validateEvaluationRequest(body) {
        const missing = REQUIRED_EVALUATION_FIELDS.filter(f => !body[f]);

        if (missing.length > 0) {
            return { isValid: false, errors: [`Missing required fields: ${missing.join(', ')}`], required: REQUIRED_EVALUATION_FIELDS };
        }

        return { isValid: true, errors: [] };
    }

    static parseEvaluationIds(body) {
        const fields = [
            { key: 'targetId', value: body.targetId },
            { key: 'submissionId', value: body.submissionId },
            { key: 'participantId', value: body.participantId }
        ];

        for (const field of fields) {
            if (!mongoose.Types.ObjectId.isValid(field.value)) {
                return { error: `${field.key} must be a valid ObjectId` };
            }
        }

        return {
            target: new mongoose.Types.ObjectId(body.targetId),
            submission: new mongoose.Types.ObjectId(body.submissionId),
            participant: new mongoose.Types.ObjectId(body.participantId)
        };
    }

    static validateTargetId(targetId) {
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
            return { isValid: false, error: 'Invalid targetId' };
        }
        return { isValid: true };
    }

    static validateLeaderboardQuery(query) {
        const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
        const page = Math.max(1, Number(query.page) || 1);
        return { limit, page };
    }

    static validateParticipantScoreParams(targetId, participantId) {
        if (!mongoose.Types.ObjectId.isValid(targetId) || !mongoose.Types.ObjectId.isValid(participantId)) {
            return { isValid: false, error: 'Invalid targetId or participantId' };
        }
        return { isValid: true };
    }
}

module.exports = ScoreValidator;