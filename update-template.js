const { Pool } = require('pg');
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

function ipv4Lookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  dns.lookup(hostname, { family: 4, all: false }, callback);
}

const url = (process.env.DATABASE_URL || 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:6543/postgres').trim();
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, lookup: ipv4Lookup });

const templateHtml = `<div style="background-color:#f4f6f9; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <div style="max-width:600px; margin:0 auto; background-color:#111827; border-radius:10px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.1); padding:35px 30px; color:#e5e7eb;">
    
    <!-- Header -->
    <h1 style="margin:0 0 25px 0; color:#fbbf24; font-size:24px; font-weight:bold;">
      📅 Meeting Confirmation!
    </h1>

    <!-- Body Content -->
    <p style="margin:0 0 15px 0; font-size:16px;">Hi <strong>{{name}}</strong>,</p>
    
    <p style="margin:0 0 25px 0; font-size:16px; line-height:1.6;">
      Your meeting with <strong>{{student_name}}</strong> has been confirmed and successfully scheduled. Please review the details of our scheduled appointment below.
    </p>

    <!-- Details Card -->
    <div style="background-color:#1f2937; border:1px solid #374151; border-radius:8px; padding:20px; margin-bottom:25px;">
      <table style="width:100%; border-collapse:collapse; font-size:15px; color:#e5e7eb;">
        <tr>
          <td style="padding:8px 0; font-weight:bold; width:80px;">Date:</td>
          <td style="padding:8px 0;">{{meeting_date}}</td>
        </tr>
        <tr>
          <td style="padding:8px 0; font-weight:bold;">Time:</td>
          <td style="padding:8px 0;">{{time_slot}}</td>
        </tr>
        <tr>
          <td style="padding:8px 0; font-weight:bold;">Location:</td>
          <td style="padding:8px 0;">📍 {{location}}</td>
        </tr>
        <tr>
          <td style="padding:8px 0; font-weight:bold;">Topic:</td>
          <td style="padding:8px 0;">{{topic}}</td>
        </tr>
      </table>
    </div>

    <p style="margin:0 0 25px 0; font-size:15px; line-height:1.6;">
      We look forward to connecting with you. If you have any specific materials or questions prepared regarding our topic, feel free to have them ready.
    </p>

    <p style="margin:0 0 15px 0; font-size:15px;">
      Need to cancel this meeting? Click below:
    </p>

    <!-- Action Section -->
    <div>
      <a href="{{cancel_url}}" style="display:inline-block; background-color:#ef4444; color:#ffffff; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:15px;">Cancel Meeting</a>
    </div>
    
  </div>
</div>`;

async function run() {
  try {
    await pool.query('UPDATE site_config SET meeting_email_template = $1', [templateHtml]);
    console.log('✓ Updated meeting_email_template in site_config!');
  } catch (err) {
    console.error('Error updating template:', err);
  } finally {
    await pool.end();
  }
}
run();
