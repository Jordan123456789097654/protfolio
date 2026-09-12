const nodemailer = require('nodemailer');

// Universal Email Sender — tries Brevo API, then Resend API, then SMTP fallback
async function sendEmail({ to, subject, html, text }) {
  const recipientEmail = Array.isArray(to) ? to[0] : to;
  const brevoApiKey = process.env.BREVO_API_KEY;
  const errors = [];

  // 1. Try Brevo REST API v3
  if (brevoApiKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoApiKey.trim(),
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: {
            name: process.env.STUDENT_NAME || 'Jordan',
            email: process.env.BREVO_SENDER || 'jordandanielsportfolio@outlook.com'
          },
          to: [{ email: recipientEmail }],
          subject,
          htmlContent: html,
          textContent: text || html.replace(/<[^>]*>?/gm, '')
        })
      });

      const data = await res.json();
      if (res.ok) {
        console.log('✓ Brevo API Email Sent successfully:', data.messageId);
        return { success: true, messageId: data.messageId };
      } else {
        const brevoErr = data.message || JSON.stringify(data);
        console.warn('⚠️ Brevo API returned error:', brevoErr);
        errors.push(`Brevo: ${brevoErr}`);
      }
    } catch (err) {
      console.warn('⚠️ Brevo API request failed:', err.message);
      errors.push(`Brevo network error: ${err.message}`);
    }
  } else {
    errors.push('BREVO_API_KEY environment variable is not set');
  }

  // 2. Fallback to Resend API if configured
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey.trim()}`
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
        console.log('✓ Resend API Email Sent:', data.id);
        return { success: true, messageId: data.id };
      }
      const resendErr = data.message || JSON.stringify(data);
      console.warn('⚠️ Resend API returned error:', resendErr);
      errors.push(`Resend: ${resendErr}`);
    } catch (e) {
      console.warn('⚠️ Resend API request failed:', e.message);
      errors.push(`Resend network error: ${e.message}`);
    }
  }

  // 3. Last Fallback: Nodemailer SMTP
  const smtpUser = process.env.SMTP_USER || process.env.OUTLOOK_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.OUTLOOK_PASS;

  if (smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.office365.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
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
      console.warn('⚠️ Nodemailer SMTP failed:', err.message);
      errors.push(`SMTP: ${err.message}`);
    }
  }

  return { success: false, error: errors.join(' | ') || 'No email credentials configured.' };
}

module.exports = { sendEmail };


