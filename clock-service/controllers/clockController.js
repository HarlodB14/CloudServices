const ClockCompetition = require('../models/clockCompetition');
const {
    scheduleCompetition,
    cancelCompetition,
    getTimerCount
} = require('../services/clockSchedulerService');

async function startCompetitionClock(req, res) {
    try {
        const { targetId, deadline } = req.body;

        if (!targetId || !deadline) {
            return res.status(400).json({ error: 'targetId and deadline are required' });
        }

        const scheduled = await scheduleCompetition({ targetId, deadline });

        return res.status(200).json({
            message: 'Competition clock scheduled',
            targetId,
            deadline: scheduled.deadline,
            status: scheduled.status
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to schedule clock: ' + error.message });
    }
}

async function cancelCompetitionClock(req, res) {
    try {
        const { targetId } = req.params;
        const cancelled = await cancelCompetition(targetId);

        if (!cancelled) {
            return res.status(404).json({ error: 'Clock entry not found' });
        }

        return res.status(200).json({
            message: 'Competition clock cancelled',
            targetId,
            status: cancelled.status
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to cancel clock: ' + error.message });
    }
}

async function getCompetitionClock(req, res) {
    try {
        const { targetId } = req.params;

        const item = await ClockCompetition.findOne({ targetId }).lean();
        if (!item) {
            return res.status(404).json({ error: 'Clock entry not found' });
        }

        return res.status(200).json(item);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to read clock entry: ' + error.message });
    }
}

function getClockHealth(req, res) {
    return res.status(200).json({
        status: 'Clock service healthy',
        timestamp: new Date(),
        activeTimers: getTimerCount()
    });
}

module.exports = {
    startCompetitionClock,
    cancelCompetitionClock,
    getCompetitionClock,
    getClockHealth
};