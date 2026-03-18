const { sendEmail } = require('../services/emailService');
const { logDispatch } = require('../services/mailLogService');
const { runGlobalReminderSweep, sendRemindersForTarget } = require('../services/reminderService');

function buildOwnerSummaryBody({ targetTitle, deadline, winner, leaderboard }) {
    const lines = [
        `Target: ${targetTitle}`,
        `Deadline: ${new Date(deadline).toISOString()}`,
        '',
        'Final leaderboard:'
    ];

    leaderboard.forEach((entry, index) => {
        lines.push(
            `${index + 1}. ${entry.participantName || 'Participant'} (${entry.participantEmail || 'no-email'}) - ` +
            `Final: ${entry.finalScore}, Similarity: ${entry.visualSimilarity}, Timing: ${entry.timingScore}`
        );
    });

    if (winner) {
        lines.push('');
        lines.push(`Winner: ${winner.participantName || winner.participantEmail} with score ${winner.finalScore || winner.score}`);
    }

    return lines.join('\n');
}

async function sendFinalResults(req, res) {
    try {
        const { targetId } = req.params;
        const { targetTitle, deadline, ownerEmail, winner, leaderboard = [] } = req.body;

        if (!targetTitle || !deadline || !ownerEmail) {
            return res.status(400).json({ error: 'targetTitle, deadline and ownerEmail are required' });
        }

        // Owner summary
        await sendEmail({
            to: ownerEmail,
            subject: `Final results for '${targetTitle}'`,
            text: buildOwnerSummaryBody({ targetTitle, deadline, winner, leaderboard })
        });

        await logDispatch({
            type: 'owner-summary',
            targetId,
            recipientEmail: ownerEmail,
            meta: {
                winner: winner || null,
                participants: leaderboard.length
            }
        });

        // Participant individual mails
        let participantEmailsSent = 0;
        for (const entry of leaderboard) {
            if (!entry.participantEmail || !entry.participantId) {
                continue;
            }

            const text = [
                `Hi ${entry.participantName || 'participant'},`,
                '',
                `Competition '${targetTitle}' has ended.`,
                `Your final score: ${entry.finalScore}`,
                `Visual similarity: ${entry.visualSimilarity}`,
                `Timing score: ${entry.timingScore}`,
                entry.rank ? `Rank: #${entry.rank}` : '',
                '',
                'Thanks for participating in Photo Prestige!'
            ].filter(Boolean).join('\n');

            await sendEmail({
                to: entry.participantEmail,
                subject: `Your score for '${targetTitle}'`,
                text
            });

            await logDispatch({
                type: 'participant-score',
                targetId,
                participantId: String(entry.participantId),
                recipientEmail: entry.participantEmail,
                meta: {
                    finalScore: entry.finalScore,
                    rank: entry.rank || null
                }
            });

            participantEmailsSent += 1;
        }

        return res.status(200).json({
            message: 'Final result emails sent',
            ownerEmail,
            participantEmailsSent
        });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to send final results: ' + error.message });
    }
}

async function sendEnrollmentConfirmation(req, res) {
    try {
        const { participantEmail, participantName, targetId, targetTitle, deadline } = req.body;

        if (!participantEmail || !targetId || !targetTitle || !deadline) {
            return res.status(400).json({ error: 'participantEmail, targetId, targetTitle and deadline are required' });
        }

        const text = [
            `Hi ${participantName || 'participant'},`,
            '',
            `You are registered for '${targetTitle}'.`,
            `Submission deadline: ${new Date(deadline).toISOString()}.`,
            '',
            'You will receive reminder emails before this target closes.',
            '',
            'Photo Prestige'
        ].join('\n');

        await sendEmail({
            to: participantEmail,
            subject: `Enrollment confirmed: '${targetTitle}'`,
            text
        });

        await logDispatch({
            type: 'enrollment-confirmation',
            targetId,
            recipientEmail: participantEmail,
            meta: {
                participantName: participantName || null,
                targetTitle
            }
        });

        return res.status(200).json({ message: 'Enrollment confirmation sent' });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to send enrollment confirmation: ' + error.message });
    }
}

async function sendRegistrationConfirmation(req, res) {
    try {
        const { name, email, roles = [], generatedCredentials = null } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'email is required' });
        }

        const roleLabel = roles.includes('target_owner') ? 'Target Owner & Deelnemer' : 'Deelnemer';

        const text = [
            `Welkom bij Photo Prestige, ${name || email}!`,
            '',
            'Jouw account is succesvol aangemaakt.',
            '',
            `E-mailadres : ${email}`,
            `Rol         : ${roleLabel}`,

            generatedCredentials ? `Gebruikersnaam : ${generatedCredentials.username || email}` : '',
            generatedCredentials ? `Tijdelijk wachtwoord : ${generatedCredentials.temporaryPassword}` : '',
            generatedCredentials ? '' : '',
            generatedCredentials ? 'Je moet dit tijdelijke wachtwoord wijzigen na je eerste login.' : 'Je kunt nu inloggen met jouw e-mailadres en het wachtwoord dat je hebt opgegeven bij registratie.',
            '',
            'Photo Prestige'
        ].filter(Boolean).join('\n');

        await sendEmail({
            to: email,
            subject: 'Welkom bij Photo Prestige \u2013 Account aangemaakt',
            text
        });

        await logDispatch({
            type: 'registration-confirmation',
            recipientEmail: email,
            meta: {
                name: name || null,
                roles,
                credentialsGenerated: Boolean(generatedCredentials)
            }
        });

        return res.status(200).json({ message: 'Registration confirmation sent' });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to send registration confirmation: ' + error.message });
    }
}

async function triggerTargetReminders(req, res) {
    try {
        const { targetId } = req.params;
        const force = String(req.query.force || 'false') === 'true';

        const summary = await sendRemindersForTarget(targetId, force);
        return res.status(200).json(summary);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to trigger target reminders: ' + error.message });
    }
}

async function triggerGlobalReminders(req, res) {
    try {
        const force = String(req.query.force || 'false') === 'true';
        const result = await runGlobalReminderSweep(force);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to run reminder sweep: ' + error.message });
    }
}

module.exports = {
    sendFinalResults,
    sendEnrollmentConfirmation,
    sendRegistrationConfirmation,
    triggerTargetReminders,
    triggerGlobalReminders
};