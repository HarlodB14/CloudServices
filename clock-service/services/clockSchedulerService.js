const mongoose = require('mongoose');
const ClockCompetition = require('../models/clockCompetition');
const { closeTargetEnrollments } = require('./registerServiceClient');
const { finalizeTarget } = require('./targetServiceClient');

const timers = new Map();
const AUTO_FINALIZE = String(process.env.CLOCK_AUTO_FINALIZE || 'true') === 'true';

function clearExistingTimer(targetId) {
    const key = String(targetId);
    const current = timers.get(key);
    if (current) {
        clearTimeout(current);
        timers.delete(key);
    }
}

async function executeDeadline(targetId) {
    const key = String(targetId);

    let registerResult = null;
    let finalizeResult = null;
    let lastError = null;

    try {
        registerResult = await closeTargetEnrollments(key);
    } catch (error) {
        lastError = `register-close failed: ${error.message}`;
    }

    if (AUTO_FINALIZE) {
        try {
            finalizeResult = await finalizeTarget(key);
        } catch (error) {
            const msg = `target-finalize failed: ${error.message}`;
            lastError = lastError ? `${lastError}; ${msg}` : msg;
        }
    }

    await ClockCompetition.findOneAndUpdate({ targetId: new mongoose.Types.ObjectId(key) }, {
        status: 'fired',
        firedAt: new Date(),
        registerCloseResult: registerResult,
        finalizeResult,
        lastError
    }, { new: true });

    timers.delete(key);
}

function scheduleTimer(targetId, deadline) {
    const key = String(targetId);
    clearExistingTimer(key);

    const delayMs = Math.max(0, new Date(deadline).getTime() - Date.now());

    const timer = setTimeout(() => {
        executeDeadline(key).catch((error) => {
            console.error(`[CLOCK] Deadline execution failed for ${key}:`, error.message);
        });
    }, delayMs);

    timers.set(key, timer);
}

async function scheduleCompetition({ targetId, deadline }) {
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
        throw new Error('targetId must be a valid ObjectId');
    }

    const parsedDeadline = new Date(deadline);
    if (Number.isNaN(parsedDeadline.getTime())) {
        throw new Error('deadline must be a valid date');
    }

    const doc = await ClockCompetition.findOneAndUpdate({ targetId: new mongoose.Types.ObjectId(targetId) }, {
        deadline: parsedDeadline,
        status: 'scheduled',
        firedAt: null,
        lastError: null
    }, { upsert: true, new: true, setDefaultsOnInsert: true });

    scheduleTimer(targetId, parsedDeadline);

    return doc;
}

async function cancelCompetition(targetId) {
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
        throw new Error('targetId must be a valid ObjectId');
    }

    clearExistingTimer(targetId);

    const doc = await ClockCompetition.findOneAndUpdate({ targetId: new mongoose.Types.ObjectId(targetId) }, {
        status: 'cancelled',
        lastError: null
    }, { new: true });

    return doc;
}

async function loadScheduledCompetitions() {
    const pending = await ClockCompetition.find({ status: 'scheduled' }).lean();

    for (const entry of pending) {
        const targetId = String(entry.targetId);
        const deadline = new Date(entry.deadline);

        if (deadline.getTime() <= Date.now()) {
            await executeDeadline(targetId);
            continue;
        }

        scheduleTimer(targetId, deadline);
    }

    return pending.length;
}

function getTimerCount() {
    return timers.size;
}

module.exports = {
    scheduleCompetition,
    cancelCompetition,
    loadScheduledCompetitions,
    getTimerCount
};