require('dotenv').config();
const { sendEmail } = require('./lib/email');
const { Pool } = require('pg');
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

function ipv4Lookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  dns.lookup(hostname, { family: 4, all: false }, callback);
}

const url = (process.env.DATABASE_URL || 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:6543/postgres').trim();
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, lookup: ipv4Lookup });

const targetEmail = 'jordanedanield13@gmail.com';

async function testAllEmails() {
  console.log(`🚀 Starting Test Dispatch of ALL Emails to: ${targetEmail}\n`);

  // Fetch site config for template
  const { rows } = await pool.query('SELECT name, meeting_email_template FROM site_config LIMIT 1');
  const config = rows[0] || {};
  const studentName = config.name || 'Jordan';

  // 1. Contact Form Message Notification Email
  console.log('1️⃣ Dispatching Contact Form Inquiry Email...');
  const res1 = await sendEmail({
    to: targetEmail,
    subject: `📬 [TEST] New Contact Message from Alex Morgan`,
    html: `
      <div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #1f2937; color:#e5e7eb;">
          <div style="background: linear-gradient(135deg, #6c63ff 0%, #3b82f6 100%); padding: 30px; text-align: center;">
            <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800;">📬 New Contact Message Received</h1>
            <p style="margin:6px 0 0 0; color:rgba(255,255,255,0.9); font-size:14px;">Direct inquiry from your portfolio website</p>
          </div>
          <div style="padding:35px 30px;">
            <p style="margin:0 0 16px 0; font-size:15px; color:#cbd5e1; line-height:1.7;">
              You have received a new direct communication inquiry submitted through your interactive portfolio contact modal.
            </p>
            <div style="background-color:#1f2937; border:1px solid #374151; border-radius:10px; padding:20px; margin-bottom:25px;">
              <h3 style="margin:0 0 12px 0; color:#818cf8; font-size:15px; font-weight:700;">👤 Sender Information</h3>
              <p style="margin:6px 0; font-size:15px; color:#e5e7eb;"><strong>Name:</strong> Alex Morgan (Recruiter / Guest)</p>
              <p style="margin:6px 0; font-size:15px; color:#e5e7eb;"><strong>Email:</strong> <a href="mailto:${targetEmail}" style="color:#60a5fa;">${targetEmail}</a></p>
              <p style="margin:6px 0; font-size:13px; color:#9ca3af;"><strong>Received At:</strong> ${new Date().toLocaleString()}</p>
            </div>
            <div style="background-color:#141d2b; border-left:4px solid #6366f1; padding:20px; border-radius:6px; margin-bottom:25px;">
              <h4 style="margin:0 0 10px 0; color:#a5b4fc; font-size:14px; font-weight:700;">💬 Message Body</h4>
              <div style="font-size:15px; color:#e2e8f0; line-height:1.8;">Hi Jordan! I reviewed your portfolio website and was extremely impressed by your FBLA projects, web applications, and technical showcase. I would love to connect with you regarding potential opportunities!</div>
            </div>
          </div>
        </div>
      </div>
    `
  });
  console.log('Result 1:', res1);

  // 2. Admin Meeting Booking Request Alert Email
  console.log('\n2️⃣ Dispatching Admin Meeting Request Notification Email...');
  const res2 = await sendEmail({
    to: targetEmail,
    subject: `📅 [TEST] New Meeting Request from Dr. Sarah Jenkins`,
    html: `
      <div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #1f2937; color:#e5e7eb;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
            <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800;">📍 New Meeting Booking Requested</h1>
            <p style="margin:6px 0 0 0; color:rgba(255,255,255,0.95); font-size:14px;">Action Required • Approve or Decline Below</p>
          </div>
          <div style="padding:35px 30px;">
            <p style="margin:0 0 16px 0; font-size:15px; color:#cbd5e1; line-height:1.7;">
              Hello <strong>${studentName}</strong>, a visitor on your interactive portfolio website has submitted a new in-person meeting request.
            </p>
            <div style="background-color:#1f2937; border:1px solid #374151; border-radius:10px; padding:22px; margin-bottom:25px;">
              <h3 style="margin:0 0 14px 0; color:#fbbf24; font-size:15px; font-weight:700;">📌 Booking Details Summary</h3>
              <table style="width:100%; border-collapse:collapse; font-size:15px; color:#e5e7eb;">
                <tr><td style="padding:8px 0; font-weight:bold; color:#9ca3af; width:120px;">👤 Visitor:</td><td style="padding:8px 0;">Dr. Sarah Jenkins (Faculty Advisor)</td></tr>
                <tr><td style="padding:8px 0; font-weight:bold; color:#9ca3af;">📧 Email:</td><td style="padding:8px 0;"><a href="mailto:${targetEmail}" style="color:#60a5fa;">${targetEmail}</a></td></tr>
                <tr><td style="padding:8px 0; font-weight:bold; color:#9ca3af;">📅 Date & Time:</td><td style="padding:8px 0;">2026-10-15 @ 2:00 PM (EST)</td></tr>
                <tr><td style="padding:8px 0; font-weight:bold; color:#9ca3af;">📍 Location:</td><td style="padding:8px 0; color:#6f9bd1;">📍 School Media Center / Library Room B</td></tr>
                <tr><td style="padding:8px 0; font-weight:bold; color:#9ca3af;">💬 Topic:</td><td style="padding:8px 0;">Discussing FBLA Leadership Presentation & Activity Strategy</td></tr>
              </table>
            </div>
            <div style="background-color:#141d2b; border:1px solid #2d3748; border-radius:10px; padding:20px; text-align:center;">
              <p style="margin:0 0 16px 0; font-size:15px; font-weight:700; color:#ffffff;">Select an Action to Instantly Respond:</p>
              <a href="#" style="display:inline-block; padding:12px 28px; margin-right:12px; background-color:#22c55e; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:bold; font-size:14px;">✓ Accept & Confirm Meeting</a>
              <a href="#" style="display:inline-block; padding:12px 28px; background-color:#ef4444; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:bold; font-size:14px;">✕ Decline Request</a>
            </div>
          </div>
        </div>
      </div>
    `
  });
  console.log('Result 2:', res2);

  // 3. Guest Pending Request Acknowledgement Email
  console.log('\n3️⃣ Dispatching Guest Pending Meeting Request Acknowledgement Email...');
  const res3 = await sendEmail({
    to: targetEmail,
    subject: `⏳ [TEST] Meeting Request Received: 2026-10-15 @ 2:00 PM with Jordan`,
    html: `
      <div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #1f2937; color:#e5e7eb;">
          <div style="background: linear-gradient(135deg, #d8a53e 0%, #b45309 100%); padding: 30px; text-align: center;">
            <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800;">⏳ Meeting Request Received!</h1>
            <p style="margin:6px 0 0 0; color:rgba(255,255,255,0.95); font-size:14px;">Your reservation request is currently pending review</p>
          </div>
          <div style="padding:35px 30px;">
            <p style="margin:0 0 16px 0; font-size:16px; color:#ffffff; font-weight:600;">Hi <strong>Jordan Daniels</strong>,</p>
            <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:#cbd5e1;">
              Thank you for requesting an in-person meeting with <strong>${studentName}</strong>! Your request has been successfully recorded in our scheduling portal and is currently awaiting confirmation.
            </p>
            <div style="background-color:#1f2937; border:1px solid #374151; border-radius:10px; padding:22px; margin-bottom:25px;">
              <h3 style="margin:0 0 14px 0; color:#fbbf24; font-size:15px; font-weight:700;">📍 Pending Request Overview</h3>
              <table style="width:100%; border-collapse:collapse; font-size:15px; color:#e5e7eb;">
                <tr><td style="padding:8px 0; font-weight:bold; color:#9ca3af; width:120px;">📅 Date:</td><td style="padding:8px 0;">2026-10-15</td></tr>
                <tr><td style="padding:8px 0; font-weight:bold; color:#9ca3af;">⏰ Time Slot:</td><td style="padding:8px 0;">2:00 PM (EST)</td></tr>
                <tr><td style="padding:8px 0; font-weight:bold; color:#9ca3af;">📍 Location:</td><td style="padding:8px 0; color:#6f9bd1;">📍 Local Public Library / Study Room 3</td></tr>
                <tr><td style="padding:8px 0; font-weight:bold; color:#9ca3af;">💬 Topic:</td><td style="padding:8px 0;">Project Collaboration & Code Review</td></tr>
              </table>
            </div>
            <div>
              <a href="#" style="display:inline-block; background-color:#ef4444; color:#ffffff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:14px;">Cancel Pending Request</a>
            </div>
          </div>
        </div>
      </div>
    `
  });
  console.log('Result 3:', res3);

  // 4. Guest Meeting Confirmation Email (Populated Template)
  console.log('\n4️⃣ Dispatching Official Guest Meeting Confirmation Email...');
  let confirmHtml = config.meeting_email_template || '';
  confirmHtml = confirmHtml
    .replace(/\{\{name\}\}/g, 'Jordan Daniels')
    .replace(/\{\{student_name\}\}/g, studentName)
    .replace(/\{\{meeting_date\}\}/g, '2026-10-15')
    .replace(/\{\{time_slot\}\}/g, '2:00 PM (EST)')
    .replace(/\{\{location\}\}/g, 'Local Public Library / Study Room 3')
    .replace(/\{\{topic\}\}/g, 'Project Collaboration & Code Review')
    .replace(/\{\{cancel_url\}\}/g, '#');

  const res4 = await sendEmail({
    to: targetEmail,
    subject: `📅 [TEST] Meeting Confirmed! 2026-10-15 @ 2:00 PM with ${studentName}`,
    html: confirmHtml
  });
  console.log('Result 4:', res4);

  // 5. Guest Meeting Cancellation / Declined Email
  console.log('\n5️⃣ Dispatching Guest Meeting Cancellation Email...');
  const res5 = await sendEmail({
    to: targetEmail,
    subject: `✕ [TEST] Meeting Status Update: 2026-10-15 @ 2:00 PM`,
    html: `
      <div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #1f2937; color:#e5e7eb;">
          <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); padding: 30px; text-align: center;">
            <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800;">✕ Meeting Status Update</h1>
            <p style="margin:6px 0 0 0; color:rgba(255,255,255,0.95); font-size:14px;">Appointment Cancellation Notice</p>
          </div>
          <div style="padding:35px 30px;">
            <p style="margin:0 0 16px 0; font-size:16px; color:#ffffff; font-weight:600;">Hi <strong>Jordan Daniels</strong>,</p>
            <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:#cbd5e1;">
              Please be advised that the in-person meeting requested for <strong>2026-10-15 at 2:00 PM (EST)</strong> has been cancelled or declined.
            </p>
            <div style="background-color:#1f2937; border:1px solid #374151; border-radius:10px; padding:20px; margin-bottom:20px;">
              <p style="margin:0; font-size:14px; color:#9ca3af;">If you have any questions or would like to request a different time slot, please visit the scheduling portal on our main website.</p>
            </div>
          </div>
        </div>
      </div>
    `
  });
  console.log('Result 5:', res5);

  // 6. Teacher / Mentor Recommendation Request Email
  console.log('\n6️⃣ Dispatching Teacher Recommendation Request Email...');
  const res6 = await sendEmail({
    to: targetEmail,
    subject: `👨‍🏫 [TEST] Academic Recommendation Request from ${studentName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: 'Segoe UI', Arial, sans-serif; color: #e2e8f0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0b0f19; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #141b2d; border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                <tr>
                  <td style="background: linear-gradient(135deg, #6c63ff 0%, #00d4ff 100%); padding: 32px 30px; text-align: center;">
                    <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0;">👨‍🏫 Academic Recommendation Request</h1>
                    <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 6px 0 0 0;">From ${studentName}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px 30px;">
                    <p style="font-size: 16px; color: #ffffff; font-weight: 600; margin-top: 0;">Hello Dr. Smith,</p>
                    <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">I hope you are having a wonderful week! As I prepare my academic & activity portfolio, I would be truly grateful for a brief recommendation endorsement or letter from you.</p>
                    <div style="background: rgba(108, 99, 255, 0.12); border: 1px solid rgba(108, 99, 255, 0.3); border-radius: 10px; padding: 14px 18px; margin: 20px 0;">
                      <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #00d4ff;">Subject / Academic Context</span>
                      <span style="font-size: 14px; color: #ffffff; font-weight: 600; display:block; margin-top:4px;">AP Computer Science A & FBLA Club Advisor</span>
                    </div>
                    <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">I have set up a quick 1-minute form where you can type a short endorsement excerpt, and optionally attach a PDF letter if you have one.</p>
                    <div style="text-align: center; margin: 32px 0 20px 0;">
                      <a href="#" style="background: linear-gradient(135deg, #6c63ff, #00d4ff); color: #ffffff; text-decoration: none; padding: 15px 32px; border-radius: 99px; font-size: 15px; font-weight: 700; display: inline-block;">Open Recommendation Form ↗</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  });
  console.log('Result 6:', res6);

  console.log('\n🎉 ALL 6 Test Email Dispatches Completed Successfully!');
  await pool.end();
}

testAllEmails();
