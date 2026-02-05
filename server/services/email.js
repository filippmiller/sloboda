const { Resend } = require('resend');

let resend = null;

function getClient() {
    if (!resend && process.env.RESEND_API_KEY) {
        resend = new Resend(process.env.RESEND_API_KEY);
    }
    return resend;
}

function isConfigured() {
    return !!process.env.RESEND_API_KEY;
}

// Replace {{variable}} placeholders with registration data
function renderTemplate(text, data) {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined && data[key] !== null ? String(data[key]) : match;
    });
}

async function sendEmail({ to, subject, body, from }) {
    const client = getClient();
    if (!client) {
        console.warn('[email] RESEND_API_KEY not set — skipping email to:', to);
        return { success: false, skipped: true };
    }

    const sender = from || process.env.EMAIL_FROM || 'SLOBODA <noreply@sloboda.land>';

    try {
        const result = await client.emails.send({
            from: sender,
            to: [to],
            subject,
            html: body.replace(/\n/g, '<br>'),
        });

        if (result.error) {
            console.error('[email] Resend error:', result.error);
            return { success: false, error: result.error.message };
        }

        console.log(`[email] Sent to ${to}: "${subject}" (id: ${result.data?.id})`);
        return { success: true, id: result.data?.id };
    } catch (err) {
        console.error('[email] Send failed:', err.message);
        return { success: false, error: err.message };
    }
}

async function sendCampaign({ subject, body, recipients, db, campaignId }) {
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
        const personalizedSubject = renderTemplate(subject, recipient);
        const personalizedBody = renderTemplate(body, recipient);

        const result = await sendEmail({
            to: recipient.email,
            subject: personalizedSubject,
            body: personalizedBody,
        });

        if (result.success) {
            sentCount++;
            if (db && recipient._sendId) {
                await db.markEmailSent(recipient._sendId);
            }
        } else if (result.skipped) {
            break; // No API key, stop trying
        } else {
            failedCount++;
        }
    }

    if (db && campaignId && sentCount > 0) {
        await db.markCampaignSent(campaignId);
    }

    return { sentCount, failedCount };
}

async function sendWelcomeEmail(registration, settings) {
    if (settings.auto_welcome_email !== 'true') return;

    await sendEmail({
        to: registration.email,
        subject: 'Welcome to SLOBODA!',
        body: `Dear ${registration.name},\n\nThank you for joining SLOBODA! We received your registration and will be in touch soon.\n\nBest regards,\nThe SLOBODA Team`,
    });
}

async function sendRegistrationNotification(registration, settings) {
    if (settings.notify_on_registration !== 'true') return;

    let emails = [];
    try {
        emails = JSON.parse(settings.notification_emails || '[]');
    } catch { /* ignore */ }

    if (emails.length === 0) return;

    const subject = `New registration: ${registration.name}`;
    const body = `New registration received:\n\nName: ${registration.name}\nEmail: ${registration.email}\nTelegram: ${registration.telegram || '-'}\nLocation: ${registration.location || '-'}\nMotivation: ${registration.motivation || '-'}\nParticipation: ${registration.participation || '-'}\nBudget: ${registration.budget || '-'}`;

    for (const email of emails) {
        await sendEmail({ to: email, subject, body });
    }
}

module.exports = {
    isConfigured,
    renderTemplate,
    sendEmail,
    sendCampaign,
    sendWelcomeEmail,
    sendRegistrationNotification,
};
