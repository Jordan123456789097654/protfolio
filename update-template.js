const { Pool } = require('pg');
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

function ipv4Lookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  dns.lookup(hostname, { family: 4, all: false }, callback);
}

const url = (process.env.DATABASE_URL || 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:6543/postgres').trim();
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, lookup: ipv4Lookup });

const ultraDetailedTemplate = `<div style="background-color:#070b14; padding:50px 20px; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width:680px; margin:0 auto; background-color:#111827; border-radius:16px; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,0.6); border:1px solid #1f2937; color:#e5e7eb;">
    
    <!-- Top Hero Banner with Gradient Glow -->
    <div style="background: linear-gradient(135deg, #10b981 0%, #3b82f6 50%, #6366f1 100%); padding: 36px 30px; text-align: center; position:relative;">
      <div style="display:inline-block; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.2); padding:6px 16px; border-radius:99px; font-size:12px; font-weight:700; color:#ffffff; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:12px;">
        Official Calendar Confirmation
      </div>
      <h1 style="margin:0; color:#ffffff; font-size:28px; font-weight:800; letter-spacing:-0.5px; text-shadow:0 2px 4px rgba(0,0,0,0.3);">
        📅 In-Person Meeting Scheduled
      </h1>
      <p style="margin:8px 0 0 0; color:rgba(255,255,255,0.92); font-size:15px; font-weight:500;">
        Confirmed Appointment with {{student_name}}
      </p>
    </div>

    <!-- Body Content Area -->
    <div style="padding:40px 32px;">
      
      <!-- Greeting & Intro -->
      <div style="margin-bottom:28px;">
        <h2 style="margin:0 0 12px 0; font-size:20px; color:#ffffff; font-weight:700;">Hello {{name}},</h2>
        <p style="margin:0 0 14px 0; font-size:15px; line-height:1.75; color:#cbd5e1;">
          We are pleased to inform you that your in-person meeting request with <strong>{{student_name}}</strong> has been formally accepted, finalized, and logged into our official academic schedule.
        </p>
        <p style="margin:0; font-size:15px; line-height:1.75; color:#cbd5e1;">
          Below is a comprehensive summary outlining your appointment time, meeting location, agenda topics, and helpful preparation guidelines to ensure our discussion is as productive and valuable as possible.
        </p>
      </div>

      <!-- Detailed Appointment Overview Card -->
      <div style="background-color:#141d2b; border:1px solid #263346; border-radius:12px; padding:26px; margin-bottom:30px; box-shadow:inset 0 1px 0 rgba(255,255,255,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #263346; padding-bottom:12px; margin-bottom:18px;">
          <h3 style="margin:0; color:#fbbf24; font-size:16px; font-weight:700; display:flex; align-items:center; gap:8px;">
            📌 Appointment & Log Details
          </h3>
          <span style="font-size:12px; background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid rgba(34,197,94,0.3); padding:3px 10px; border-radius:6px; font-weight:700;">
            Status: Confirmed
          </span>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:15px; color:#e5e7eb;">
          <tr>
            <td style="padding:12px 0; font-weight:bold; color:#9ca3af; width:130px; border-bottom:1px solid rgba(255,255,255,0.04);">📅 Date:</td>
            <td style="padding:12px 0; font-weight:700; color:#ffffff; border-bottom:1px solid rgba(255,255,255,0.04);">{{meeting_date}}</td>
          </tr>
          <tr>
            <td style="padding:12px 0; font-weight:bold; color:#9ca3af; border-bottom:1px solid rgba(255,255,255,0.04);">⏰ Scheduled Time:</td>
            <td style="padding:12px 0; font-weight:700; color:#ffffff; border-bottom:1px solid rgba(255,255,255,0.04);">{{time_slot}}</td>
          </tr>
          <tr>
            <td style="padding:12px 0; font-weight:bold; color:#9ca3af; border-bottom:1px solid rgba(255,255,255,0.04);">📍 Designated Location:</td>
            <td style="padding:12px 0; font-weight:600; color:#60a5fa; border-bottom:1px solid rgba(255,255,255,0.04);">📍 {{location}}</td>
          </tr>
          <tr>
            <td style="padding:12px 0; font-weight:bold; color:#9ca3af; border-bottom:1px solid rgba(255,255,255,0.04);">💬 Discussion Topic:</td>
            <td style="padding:12px 0; color:#e2e8f0; line-height:1.6; border-bottom:1px solid rgba(255,255,255,0.04);">{{topic}}</td>
          </tr>
          <tr>
            <td style="padding:12px 0; font-weight:bold; color:#9ca3af;">👤 Host / Contact:</td>
            <td style="padding:12px 0; color:#e2e8f0;">{{student_name}} (Interactive Portfolio Platform)</td>
          </tr>
        </table>
      </div>

      <!-- Section: What to Bring & Preparation Guide -->
      <div style="background-color:rgba(59, 130, 246, 0.08); border:1px solid rgba(59, 130, 246, 0.25); border-radius:12px; padding:22px; margin-bottom:30px;">
        <h4 style="margin:0 0 10px 0; color:#60a5fa; font-size:15px; font-weight:700;">💡 Preparation & Meeting Notes</h4>
        <ul style="margin:0; padding-left:20px; color:#cbd5e1; font-size:14px; line-height:1.8;">
          <li><strong>Arrive 5 Minutes Early:</strong> Please arrive a few minutes prior to the scheduled start time at 📍 {{location}}.</li>
          <li><strong>Bring Relevant Materials:</strong> Feel free to bring laptops, project documents, FBLA rubrics, or questions you wish to review.</li>
          <li><strong>48-Hour Follow Up:</strong> You will receive an automated agenda reminder 2 days prior to the event.</li>
        </ul>
      </div>

      <!-- Section: Calendar & Sync Options -->
      <div style="background-color:#1f2937; border-radius:10px; padding:20px; margin-bottom:30px; text-align:center;">
        <h4 style="margin:0 0 8px 0; color:#ffffff; font-size:15px; font-weight:700;">🔔 Automatic Email Reminders</h4>
        <p style="margin:0; font-size:14px; color:#9ca3af; line-height:1.6;">
          Our system will automatically send you a <strong>24-hour reminder</strong> tomorrow and a <strong>1-hour alert</strong> before we meet.
        </p>
      </div>

      <!-- Section: Action & Cancellation Button -->
      <div style="border-top:1px solid #1f2937; padding-top:28px; text-align:center;">
        <p style="margin:0 0 16px 0; font-size:14px; color:#9ca3af; line-height:1.6;">
          Need to make adjustments to your schedule, update your topic, or cancel this reservation?
        </p>
        <a href="{{cancel_url}}" style="display:inline-block; background: linear-gradient(135deg, #ef4444, #dc2626); color:#ffffff; padding:14px 30px; border-radius:8px; text-decoration:none; font-weight:700; font-size:15px; box-shadow:0 6px 20px rgba(239,68,68,0.35);">
          Cancel or Reschedule Reservation ↗
        </a>
      </div>

    </div>

    <!-- Professional Footer -->
    <div style="background-color:#0b111e; padding:24px 32px; text-align:center; border-top:1px solid #1f2937;">
      <p style="font-size:13px; color:#94a3b8; margin:0 0 6px 0; font-weight:600;">{{student_name}}'s Academic & Portfolio Interactive Platform</p>
      <p style="font-size:12px; color:#64748b; margin:0;">Sent via Automated Meeting Dispatch System • Secure Token-Based Authorization</p>
    </div>

  </div>
</div>`;

async function run() {
  try {
    await pool.query('UPDATE site_config SET meeting_email_template = $1', [ultraDetailedTemplate]);
    console.log('✓ Ultra-detailed 500x meeting_email_template updated in site_config DB!');
  } catch (err) {
    console.error('Error updating template:', err);
  } finally {
    await pool.end();
  }
}
run();
