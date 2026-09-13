const { Pool } = require('pg');
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

function ipv4Lookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  dns.lookup(hostname, { family: 4, all: false }, callback);
}

const url = (process.env.DATABASE_URL || 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:6543/postgres').trim();
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, lookup: ipv4Lookup });

const templateHtml = `<div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #1f2937; color:#e5e7eb;">
    
    <!-- Top Decorative Banner -->
    <div style="background: linear-gradient(135deg, #d8a53e 0%, #6f9bd1 100%); padding: 30px; text-align: center;">
      <h1 style="margin:0; color:#ffffff; font-size:26px; font-weight:800; letter-spacing:-0.5px;">
        📅 Meeting Confirmed!
      </h1>
      <p style="margin:6px 0 0 0; color:rgba(255,255,255,0.9); font-size:14px;">Official Calendar Event & Discussion Outline</p>
    </div>

    <!-- Body Content -->
    <div style="padding:35px 30px;">
      <p style="margin:0 0 16px 0; font-size:16px; color:#ffffff; font-weight:600;">Hello <strong>{{name}}</strong>,</p>
      
      <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:#cbd5e1;">
        Thank you for reaching out! Your in-person meeting request with <strong>{{student_name}}</strong> has been officially reviewed, accepted, and scheduled into the calendar. We are excited to meet and engage in a valuable discussion regarding your topic.
      </p>

      <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:#cbd5e1;">
        Below are the complete details and log for our upcoming appointment. Please take a moment to review the scheduled location, date, and discussion agenda carefully.
      </p>

      <!-- Details Card -->
      <div style="background-color:#1f2937; border:1px solid #374151; border-radius:10px; padding:22px; margin-bottom:28px;">
        <h3 style="margin:0 0 16px 0; color:#fbbf24; font-size:16px; border-bottom:1px solid #374151; padding-bottom:8px; font-weight:700;">📌 Appointment Summary</h3>
        <table style="width:100%; border-collapse:collapse; font-size:15px; color:#e5e7eb;">
          <tr>
            <td style="padding:10px 0; font-weight:bold; color:#9ca3af; width:110px; border-bottom:1px solid rgba(255,255,255,0.05);">📅 Date:</td>
            <td style="padding:10px 0; font-weight:600; color:#ffffff; border-bottom:1px solid rgba(255,255,255,0.05);">{{meeting_date}}</td>
          </tr>
          <tr>
            <td style="padding:10px 0; font-weight:bold; color:#9ca3af; border-bottom:1px solid rgba(255,255,255,0.05);">⏰ Time:</td>
            <td style="padding:10px 0; font-weight:600; color:#ffffff; border-bottom:1px solid rgba(255,255,255,0.05);">{{time_slot}}</td>
          </tr>
          <tr>
            <td style="padding:10px 0; font-weight:bold; color:#9ca3af; border-bottom:1px solid rgba(255,255,255,0.05);">📍 Location:</td>
            <td style="padding:10px 0; font-weight:600; color:#6f9bd1; border-bottom:1px solid rgba(255,255,255,0.05);">📍 {{location}}</td>
          </tr>
          <tr>
            <td style="padding:10px 0; font-weight:bold; color:#9ca3af;">💬 Topic / Agenda:</td>
            <td style="padding:10px 0; color:#e5e7eb;">{{topic}}</td>
          </tr>
        </table>
      </div>

      <!-- Preparation & Notes -->
      <div style="background-color:rgba(216, 165, 62, 0.08); border-left:4px solid #fbbf24; padding:16px; border-radius:6px; margin-bottom:28px;">
        <h4 style="margin:0 0 6px 0; color:#fbbf24; font-size:14px;">💡 Preparing for the Meeting</h4>
        <p style="margin:0; font-size:14px; color:#cbd5e1; line-height:1.6;">
          To ensure our meeting is as productive and meaningful as possible, feel free to bring any relevant notes, project documents, or questions you wish to cover. If you need to make adjustments beforehand, please communicate in advance using the portal link below.
        </p>
      </div>

      <p style="margin:0 0 16px 0; font-size:14px; color:#9ca3af;">
        Need to change your plans or cancel this meeting? You can cancel your reservation directly at any time:
      </p>

      <!-- Action Section -->
      <div style="text-align:left; margin-bottom:10px;">
        <a href="{{cancel_url}}" style="display:inline-block; background-color:#ef4444; color:#ffffff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:14px; box-shadow:0 4px 12px rgba(239,68,68,0.3);">Cancel / Reschedule Meeting</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color:#0b111e; padding:20px 30px; text-align:center; border-top:1px solid #1f2937;">
      <p style="font-size:12px; color:#64748b; margin:0;">Sent with gratitude via {{student_name}}'s Interactive Scheduling System</p>
    </div>

  </div>
</div>`;

async function run() {
  try {
    await pool.query('UPDATE site_config SET meeting_email_template = $1', [templateHtml]);
    console.log('✓ Expanded detailed meeting_email_template updated in site_config DB!');
  } catch (err) {
    console.error('Error updating template:', err);
  } finally {
    await pool.end();
  }
}
run();
