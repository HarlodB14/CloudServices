const { sendEmail } = require('./emailService');
const { getActiveTargets, getTargetById } = require('./targetServiceClient');
const { getTargetEnrollments } = require('./registerServiceClient');
const { hasRecentReminder, logDispatch } = require('./mailLogService');

const MIN_REMINDER_GAP_MINUTES = Number(process.env.MIN_REMINDER_GAP_MINUTES || 60);

function formatRemainingTime(deadline) {
    const msLeft = new Date(deadline).getTime() - Date.now();
    if (msLeft <= 0) {
        return '0 minutes';
    }

    const totalMinutes = Math.ceil(msLeft / (1000 * 60));
    if (totalMinutes < 60) {
        return `${totalMinutes} minute(s)`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours} hour(s) and ${minutes} minute(s)`;
}

async function sendReminderToParticipant(target, enrollment, force = false) {
    if (!enrollment.participantEmail || !enrollment.participantId) {
        return { skipped: true, reason: 'missing-participant-email-or-id' };
    }

    const deadline = new Date(target.deadline);
    if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) {
        return { skipped: true, reason: 'target-expired' };
    }

    if (enrollment.submittedAt) {
        return { skipped: true, reason: 'already-submitted' };
    }

    const targetId = String(target._id || target.id);
    const participantId = String(enrollment.participantId);

    if (!force) {
        const hasRecent = await hasRecentReminder(targetId, participantId, MIN_REMINDER_GAP_MINUTES * 60 * 1000);
        if (hasRecent) {
            return { skipped: true, reason: 'already-reminded-recently' };
        }
    }

    const timeLeft = formatRemainingTime(target.deadline);
    const subject = `Reminder: '${target.title}' closes soon`;
    const text = [
        `Hi ${enrollment.participantName || 'participant'},`,
        '',
        `You are enrolled in '${target.title}'.`,
        `Deadline: ${new Date(target.deadline).toISOString()}.`,
        `Time remaining: ${timeLeft}.`,
        '',
        'Submit your photo before the deadline to enter the competition.',
        '',
        'Photo Prestige'
    ].join('\n');

    await sendEmail({
        to: enrollment.participantEmail,
        subject,
        text
    });

    await logDispatch({
        type: 'reminder',
        targetId,
        participantId,
        recipientEmail: enrollment.participantEmail,
        meta: {
            deadline: target.deadline,
            title: target.title
        }
    });

    return { sent: true, participantEmail: enrollment.participantEmail };
}

async function sendRemindersForTarget(targetId, force = false) {
    const target = await getTargetById(targetId);

    if (!target || target.status !== 'active') {
        return { targetId, sent: 0, skipped: 0, reason: 'target-not-active' };
    }

    const enrollmentData = await getTargetEnrollments(targetId, 'active');
    const enrollments = enrollmentData.enrollments || [];

    let sent = 0;
    let skipped = 0;

    for (const enrollment of enrollments) {
        const result = await sendReminderToParticipant(target, enrollment, force);
        if (result.sent) {
            sent += 1;
        } else {
            skipped += 1;
        }
    }

    return {
        targetId,
        sent,
        skipped,
        totalEnrollments: enrollments.length
    };
}

async function runGlobalReminderSweep(force = false) {
    let page = 1;
    const limit = Number(process.env.REMINDER_TARGET_PAGE_SIZE || 100);
    const summaries = [];

    while (true) {
        const data = await getActiveTargets(page, limit);
        const targets = data.targets || [];

        if (targets.length === 0) {
            break;
        }

        for (const target of targets) {
            const summary = await sendRemindersForTarget(String(target._id || target.id), force);
            summaries.push(summary);
        }

        if (!data.pagination || page >= data.pagination.pages) {
            break;
        }

        page += 1;
    }

    const totals = summaries.reduce((acc, row) => {
        acc.targets += 1;
        acc.sent += row.sent || 0;
        acc.skipped += row.skipped || 0;
        return acc;
    }, { targets: 0, sent: 0, skipped: 0 });

    return {
        ...totals,
        summaries
    };
}

module.exports = {
    sendRemindersForTarget,
    runGlobalReminderSweep
};