/**
 * Target Validation Rules
 * Centralizes all validation logic for target operations
 */

class TargetValidator {
    /**
     * Validate target creation request
     */
    static validateCreateTarget(body) {
        const errors = [];
        const { title, imageUrl, location, deadline } = body;

        if (!title) errors.push('title is required');
        if (!imageUrl) errors.push('imageUrl is required');
        if (!location) errors.push('location is required');
        if (!deadline) errors.push('deadline is required');

        if (location && (!location.latitude || !location.longitude)) {
            errors.push('location must include latitude and longitude');
        }

        if (location && location.latitude) {
            const lat = parseFloat(location.latitude);
            if (isNaN(lat) || lat < -90 || lat > 90) {
                errors.push('latitude must be between -90 and 90');
            }
        }

        if (location && location.longitude) {
            const lon = parseFloat(location.longitude);
            if (isNaN(lon) || lon < -180 || lon > 180) {
                errors.push('longitude must be between -180 and 180');
            }
        }

        if (deadline) {
            const deadlineDate = new Date(deadline);
            if (isNaN(deadlineDate.getTime())) {
                errors.push('deadline must be a valid date');
            } else if (deadlineDate < new Date()) {
                errors.push('deadline must be in the future');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate target update request
     */
    static validateUpdateTarget(body) {
        const errors = [];
        const allowedFields = ['title', 'description', 'prize', 'deadline'];

        const providedFields = Object.keys(body);
        const invalidFields = providedFields.filter(field => !allowedFields.includes(field));

        if (invalidFields.length > 0) {
            errors.push(`Cannot update fields: ${invalidFields.join(', ')}`);
        }

        if (body.deadline) {
            const deadlineDate = new Date(body.deadline);
            if (isNaN(deadlineDate.getTime())) {
                errors.push('deadline must be a valid date');
            } else if (deadlineDate < new Date()) {
                errors.push('deadline must be in the future');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            allowedFields
        };
    }

    /**
     * Validate photo submission
     */
    static validatePhotoSubmission(body, target) {
        const errors = [];
        const { photoUrl } = body;

        if (!photoUrl) {
            errors.push('photoUrl is required');
        }

        if (target.status !== 'active') {
            errors.push('Target is no longer accepting submissions');
        }

        if (new Date() > new Date(target.deadline)) {
            errors.push('Submission deadline has passed');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate rating
     */
    static validateRating(rating) {
        const validRatings = ['thumbs-up', 'thumbs-down'];

        if (!rating) {
            return {
                isValid: false,
                errors: ['rating is required']
            };
        }

        if (!validRatings.includes(rating)) {
            return {
                isValid: false,
                errors: ['rating must be thumbs-up or thumbs-down']
            };
        }

        return {
            isValid: true,
            errors: []
        };
    }

    /**
     * Check ownership permissions
     */
    static checkOwnership(targetOwnerId, userId, userRoles) {
        const isAdmin = userRoles.includes('admin');
        const isOwner = targetOwnerId.toString() === userId;
        return isAdmin || isOwner;
    }

    /**
     * Validate user already submitted
     */
    static checkDuplicateSubmission(submissions, userId) {
        const existing = submissions.find(
            sub => sub.participantId.toString() === userId
        );

        if (existing) {
            return {
                isDuplicate: true,
                submissionId: existing._id
            };
        }

        return {
            isDuplicate: false
        };
    }

    /**
     * Validate target can be finalized
     */
    static validateFinalization(target) {
        const errors = [];

        if (target.status === 'completed') {
            errors.push('Target already finalized');
        }

        if (target.submissions.length === 0) {
            return {
                isValid: true,
                canFinalize: false,
                errors: ['No submissions to finalize']
            };
        }

        return {
            isValid: errors.length === 0,
            canFinalize: true,
            errors
        };
    }
}

module.exports = TargetValidator;