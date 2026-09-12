const nodemailer = require('nodemailer');

// Universal Email Sender — handles SMTP (Outlook/Gmail) or Resend fallback
async function sendEmail({ to, subject, html, text }) {
  const smtpUser = process.env.SMTP_USER || process.env.OUTLOOK_USER || 'jordandanielsportfolio@outlook.com';
  const smtpPass = process.env.SMTP_PASS || process.env.OUTLOOK_PASS || '0422jojob';

  // 1. If Outlook/SMTP credentials are available, use Nodemailer
  if (smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.office365.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // true for 465, false for 587
        auth: {
          user: smtpUser.trim(),
          pass: smtpPass.trim()
        },
        tls: {
          ciphers: 'SSLv3',
          rejectUnauthorized: false
        }
      });

      const info = await transporter.sendMail({
        from: `"${process.env.STUDENT_NAME || 'Jordan'}" <${smtpUser.trim()}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
        text
      });

      console.log('✓ Nodemailer SMTP Email Sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.warn('⚠️ Nodemailer SMTP failed (SmtpClientAuthentication disabled or auth failed):', err.message);
      console.log('🔄 Falling back to Resend API...');
    }
  }

  // 2. Fallback to Resend API if configured
  const resendApiKey = process.env.RESEND_API_KEY || 're_kRnSzQiD_PET41BvpZbzvjhmMy4S7hC7';
  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from: `${process.env.STUDENT_NAME || 'Jordan'} via Portfolio <onboarding@resend.dev>`,
          to: Array.isArray(to) ? to : [to],
          subject,
          html
        })
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, messageId: data.id };
      }
      return { success: false, error: data.message || JSON.stringify(data) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return { success: false, error: 'No email service credentials (SMTP or Resend) configured.' };
}

module.exports = { sendEmail };
