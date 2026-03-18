const nodemailer = require('nodemailer');

function createTransporter() {
    if (process.env.SMTP_HOST) {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: String(process.env.SMTP_SECURE || 'false') === 'true',
            auth: process.env.SMTP_USER ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            } : undefined
        });
    }

    return nodemailer.createTransport({
        jsonTransport: true
    });
}

const transporter = createTransporter();

function getFromAddress() {
    return process.env.MAIL_FROM || 'noreply@photoprestige.local';
}

async function sendEmail({ to, subject, text, html }) {
    const info = await transporter.sendMail({
        from: getFromAddress(),
        to,
        subject,
        text,
        html
    });

    if (process.env.SMTP_HOST) {
        console.log(`[MAIL] Sent to ${to} (messageId=${info.messageId || 'n/a'})`);
    } else {
        console.log(`[MAIL][DRY-RUN] ${to} :: ${subject}`);
    }

    return info;
}

module.exports = {
    sendEmail
};