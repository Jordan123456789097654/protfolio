const router = require('express').Router();
const multer = require('multer');
const { getNowPlaying } = require('../lib/spotify');
const { uploadImage } = require('../lib/supabaseStorage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const { safeQuery } = require('../lib/dbAdapter');
const { sendEmail } = require('../lib/email');

// ── GET site config ──────────────────────────────────────────────
router.get('/config', async (req, res) => {
  const { rows } = await safeQuery(req.app.locals.pool, 'SELECT * FROM site_config LIMIT 1');
  res.json(rows[0] || {});
});

// ── GET projects ─────────────────────────────────────────────────
router.get('/projects', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM projects WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
  );
  res.json(rows);
});

// ── GET skills ───────────────────────────────────────────────────
router.get('/skills', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM skills WHERE is_published = true ORDER BY category ASC, sort_order ASC'
  );
  res.json(rows);
});

// ── GET experience ───────────────────────────────────────────────
router.get('/experience', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM experience WHERE is_published = true ORDER BY sort_order ASC'
  );
  res.json(rows);
});

// ── GET achievements ──────────────────────────────────────────────
router.get('/achievements', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM achievements WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
  );
  res.json(rows);
});

// ── GET gallery photos ───────────────────────────────────────────
router.get('/gallery', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM gallery WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
  );
  res.json(rows);
});

// ── GET testimonials ─────────────────────────────────────────────
router.get('/testimonials', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM testimonials WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
  );
  res.json(rows);
});

// ── GET social links ─────────────────────────────────────────────
router.get('/social', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM social_links WHERE is_published = true ORDER BY sort_order ASC'
  );
  res.json(rows);
});

// ── GET recommendations ──────────────────────────────────────────
router.get('/recommendations', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM recommendations WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
  );
  res.json(rows);
});

// ── GET faqs ─────────────────────────────────────────────────────
router.get('/faqs', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM faqs WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
  );
  res.json(rows);
});

// ── GET certifications ───────────────────────────────────────────
router.get('/certifications', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM certifications WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
  );
  res.json(rows);
});


// ── GET Spotify now-playing ───────────────────────────────────────
router.get('/spotify/now-playing', async (req, res) => {
  try {
    const data = await getNowPlaying(req.app.locals.pool);
    res.json(data);
  } catch (err) {
    res.json({ connected: false, isPlaying: false });
  }
});

// ── GET sections order & visibility ──────────────────────────────
router.get('/sections', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM sections WHERE is_visible = true ORDER BY sort_order ASC'
  );
  res.json(rows);
});

// ── POST analytics event ─────────────────────────────────────────
router.post('/analytics/event', async (req, res) => {
  try {
    const { event_type, details } = req.body;
    if (event_type) {
      await req.app.locals.pool.query(
        'INSERT INTO analytics_events (event_type, details) VALUES ($1, $2)',
        [event_type.trim(), details || '']
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST contact message ─────────────────────────────────────────
router.post('/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required.' });
    }
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    await req.app.locals.pool.query(
      'INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)',
      [name.trim(), email.trim(), message.trim()]
    );

    // Send Discord Webhook Notification if configured
    try {
      const { rows } = await req.app.locals.pool.query('SELECT discord_webhook_url FROM site_config LIMIT 1');
      const webhookUrl = rows[0]?.discord_webhook_url || 'https://discord.com/api/webhooks/1543661253698781335/P65nZ2XKxeWxDP4fiNUMLVRysGU0tt-iOFqihSd2rZUC16yTvTkqdp6DllFn4Q0nB5OB';
      if (webhookUrl && webhookUrl.startsWith('http')) {
        const payload = {
          embeds: [{
            title: '📬 New Portfolio Contact Message',
            color: 7095295, // #6c63ff accent color
            fields: [
              { name: '👤 Sender Name', value: name.trim(), inline: true },
              { name: '📧 Sender Email', value: email.trim(), inline: true },
              { name: '💬 Message', value: message.trim().length > 1024 ? message.trim().substring(0, 1020) + '...' : message.trim() }
            ],
            timestamp: new Date().toISOString()
          }]
        };
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(e => console.error('Discord Webhook Dispatch Error:', e.message));
      }
    } catch (discordErr) {
      console.error('Discord webhook error:', discordErr.message);
    }
    // Send Resend Email Notification if configured
    try {
      const { rows } = await req.app.locals.pool.query('SELECT resend_api_key, notification_email FROM site_config LIMIT 1');
      const toEmail = rows[0]?.notification_email || 'jordan.lmmsfbla@outlook.com';

      sendEmail({
        to: toEmail,
        subject: `📬 New Portfolio Message from ${name.trim()}`,
        html: `
          <div style="font-family:sans-serif;padding:20px;color:#333;">
            <h2 style="color:#6c63ff;">New Portfolio Contact Message</h2>
            <p><strong>Name:</strong> ${name.trim()}</p>
            <p><strong>Email:</strong> <a href="mailto:${email.trim()}">${email.trim()}</a></p>
            <p><strong>Message:</strong></p>
            <blockquote style="background:#f4f4f7;padding:15px;border-left:4px solid #6c63ff;margin:0;">${message.trim().replace(/\n/g, '<br>')}</blockquote>
            <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
            <p style="font-size:12px;color:#888;">Sent from your Portfolio Website</p>
          </div>
        `
      }).catch(e => console.error('✗ Contact Email Error:', e.message));
    } catch (emailErr) {
      console.error('Email notification lookup failed:', emailErr.message);
    }

    res.json({ success: true, message: 'Message sent successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET countdown settings ─────────────────────────────────────────
router.get('/countdown', async (req, res) => {
  try {
    const { rows } = await safeQuery(
      req.app.locals.pool,
      'SELECT countdown_title, countdown_target_date, countdown_enabled FROM site_config LIMIT 1'
    );
    res.json(rows[0] || {
      countdown_title: 'FBLA State Leadership Conference',
      countdown_target_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      countdown_enabled: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET email read receipt tracking pixel ────────────────────────
router.get('/recommendations/track/open/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (token) {
      await req.app.locals.pool.query(
        `UPDATE recommendation_requests 
         SET opened_at = COALESCE(opened_at, NOW()), open_count = COALESCE(open_count, 0) + 1 
         WHERE token = $1`,
        [token]
      ).catch(() => {});
      if (router.broadcastChange) router.broadcastChange('update');
    }
  } catch (e) {}

  // 1x1 transparent GIF binary buffer
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': pixel.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
  });
  res.end(pixel);
});

// ── GET teacher recommendation request token & track link click ──
router.get('/recommendation-request/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM recommendation_requests WHERE token = $1 LIMIT 1',
      [token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired recommendation request link.' });
    }

    // Record click timestamp
    await req.app.locals.pool.query(
      'UPDATE recommendation_requests SET clicked_at = COALESCE(clicked_at, NOW()) WHERE token = $1',
      [token]
    ).catch(() => {});
    if (router.broadcastChange) router.broadcastChange('update');

    const { rows: configRows } = await req.app.locals.pool.query('SELECT name FROM site_config LIMIT 1');
    res.json({ request: rows[0], studentName: configRows[0]?.name || 'Jordan' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── POST submit teacher recommendation ──────────────────────────
router.post('/recommendation-request/:token/submit', async (req, res) => {
  try {
    const { token } = req.params;
    const { recommender_name, recommender_title, school_or_org, quote_excerpt, letter_pdf_url } = req.body;

    const { rows: reqRows } = await req.app.locals.pool.query(
      'SELECT * FROM recommendation_requests WHERE token = $1 LIMIT 1',
      [token]
    );
    if (reqRows.length === 0) {
      return res.status(404).json({ error: 'Invalid recommendation request link.' });
    }

    if (!recommender_name || !quote_excerpt) {
      return res.status(400).json({ error: 'Recommender name and quote excerpt are required.' });
    }

    // Insert into recommendations table
    const { rows: recRows } = await req.app.locals.pool.query(
      `INSERT INTO recommendations (recommender_name, recommender_title, school_or_org, quote_excerpt, letter_pdf_url, is_published, sort_order)
       VALUES ($1, $2, $3, $4, $5, true, 0) RETURNING *`,
      [recommender_name.trim(), recommender_title || '', school_or_org || '', quote_excerpt.trim(), letter_pdf_url || '']
    );

    // Update request status to completed
    await req.app.locals.pool.query(
      'UPDATE recommendation_requests SET status = $1 WHERE token = $2',
      ['completed', token]
    );

    res.json({ success: true, message: 'Recommendation submitted successfully! Thank you.', recommendation: recRows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET Seasonal / Holiday Theme Status ────────────────────────────
function calculateAutoSeason() {
  const date = new Date();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  if (month === 10) return 'halloween'; // Oct 1 - Oct 31
  if (month === 12 || (month === 1 && day <= 7)) return 'winter'; // Dec 1 - Jan 7
  if ((month === 3 && day >= 20) || month === 4 || month === 5) return 'spring'; // Mar 20 - May 31
  if (month >= 6 && month <= 8) return 'summer'; // June - August
  return 'standard';
}

router.get('/theme/seasonal', async (req, res) => {
  try {
    const { rows } = await safeQuery(req.app.locals.pool, 'SELECT seasonal_theme FROM site_config LIMIT 1');
    const setting = rows[0]?.seasonal_theme || 'auto';
    const effectiveSeason = (setting && setting !== 'auto') ? setting : calculateAutoSeason();
    res.json({ setting, effectiveSeason });
  } catch (err) {
    res.status(500).json({ setting: 'auto', effectiveSeason: calculateAutoSeason() });
  }
});

// ── GET Meeting Configuration & Locations ─────────────────────────
router.get('/meetings/config', async (req, res) => {
  try {
    const { rows } = await safeQuery(
      req.app.locals.pool,
      'SELECT meeting_enabled, meeting_locations, meeting_start_time, meeting_end_time, meeting_notice_days FROM site_config LIMIT 1'
    );
    const config = rows[0] || {};
    const locations = (config.meeting_locations || '').split('\n').map(l => l.trim()).filter(Boolean);

    res.json({
      meeting_enabled: config.meeting_enabled !== false,
      locations: locations.length > 0 ? locations : [
        '📍 High School Campus / Classroom',
        '📍 Local Public Library',
        '📍 Coffee Shop / Cafe',
        '📍 Community Center / Club Lab',
        '📍 FBLA / Robotics Practice Space'
      ],
      start_time: config.meeting_start_time || '09:00',
      end_time: config.meeting_end_time || '17:00',
      notice_days: config.meeting_notice_days || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET Meeting Availability for a date ────────────────────────────
router.get('/meetings/availability', async (req, res) => {
  try {
    const { date } = req.query; // YYYY-MM-DD
    if (!date) return res.status(400).json({ error: 'Date parameter required (YYYY-MM-DD)' });

    const selectedDate = new Date(date + 'T00:00:00');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[selectedDate.getDay()];

    const { rows: configRows } = await safeQuery(
      req.app.locals.pool,
      'SELECT meeting_start_time, meeting_end_time FROM site_config LIMIT 1'
    );
    const config = configRows[0] || {};
    const startHour = parseInt((config.meeting_start_time || '09:00').split(':')[0], 10);
    const endHour = parseInt((config.meeting_end_time || '17:00').split(':')[0], 10);

    // Fetch recurring busy schedules for this day of week
    const { rows: busyBlocks } = await safeQuery(
      req.app.locals.pool,
      'SELECT * FROM busy_schedules WHERE day_of_week = $1',
      [dayName]
    );

    // Fetch existing booked meetings for this specific date
    const { rows: bookedMeetings } = await safeQuery(
      req.app.locals.pool,
      'SELECT time_slot FROM meetings WHERE meeting_date = $1 AND status != $2',
      [date, 'declined']
    );
    const bookedSlotsSet = new Set(bookedMeetings.map(m => m.time_slot));

    // Dynamic hourly slots from startHour to endHour
    const baseSlots = [];
    for (let h = startHour; h < endHour; h++) {
      baseSlots.push(`${String(h).padStart(2, '0')}:00`);
    }

    const slots = baseSlots.map(timeStr => {
      const slotHour = parseInt(timeStr.split(':')[0], 10);

      // Check if slot overlaps with any busy block
      let busyReason = null;
      for (const b of busyBlocks) {
        const startH = parseInt(b.start_time.split(':')[0], 10);
        const endH = parseInt(b.end_time.split(':')[0], 10);
        if (slotHour >= startH && slotHour < endH) {
          busyReason = b.title;
          break;
        }
      }

      const isBooked = bookedSlotsSet.has(timeStr);

      let status = 'available';
      if (isBooked) status = 'booked';
      else if (busyReason) status = 'busy';

      return {
        time: timeStr,
        displayTime: new Date(2000, 0, 1, slotHour, 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        status,
        busyReason
      };
    });

    res.json({ date, dayName, slots, busyBlocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST Book a Meeting / Chat ─────────────────────────────────────
router.post('/meetings/book', async (req, res) => {
  try {
    const crypto = require('crypto');
    const { name, email, role, meeting_date, time_slot, topic, location_type, guest_timezone } = req.body;
    if (!name || !email || !meeting_date || !time_slot || !topic) {
      return res.status(400).json({ error: 'Name, email, date, time slot, and topic are required.' });
    }

    const cancelToken = crypto.randomBytes(24).toString('hex');
    const meetingLocation = location_type || 'IRL Meeting (School / Library / Coffee Shop)';
    const guestTz = guest_timezone || 'EST';

    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO meetings (name, email, role, meeting_date, time_slot, topic, location_type, guest_timezone, cancel_token, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed') RETURNING *`,
      [name.trim(), email.trim(), role || 'Visitor', meeting_date, time_slot, topic.trim(), meetingLocation, guestTz, cancelToken]
    );
    const meeting = rows[0];

    // Fetch site config for custom templates, notification email, discord webhook, and Twilio settings
    const { rows: configRows } = await safeQuery(
      req.app.locals.pool,
      `SELECT name, notification_email, discord_webhook_url,
              meeting_email_subject, meeting_email_template,
              twilio_account_sid, twilio_auth_token, twilio_phone_number, admin_phone_number, twilio_sms_enabled
       FROM site_config LIMIT 1`
    );
    const config = configRows[0] || {};
    const notifyEmail = config.notification_email || 'jordan.lmmsfbla@outlook.com';

    // Format readable time display
    const hour = parseInt(time_slot.split(':')[0], 10);
    const timeDisplay = new Date(2000, 0, 1, hour, 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const protocol = req.protocol || 'https';
    const host = req.get('host') || 'localhost:3000';
    const cancelUrl = `${protocol}://${host}/api/meetings/cancel/${cancelToken}`;
    const studentName = config.name || 'Jordan';

    // Send email notification to student (admin)
    sendEmail({
      to: notifyEmail,
      subject: `📅 New IRL Meeting Booked: ${name.trim()} (${role || 'Visitor'})`,
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#101726;color:#e2e8f0;padding:24px;border-radius:12px;">
          <h2 style="color:#d8a53e;margin-top:0;">📍 New In-Person Meeting Scheduled</h2>
          <p><strong>Visitor Name:</strong> ${name.trim()} (${role || 'Visitor'})</p>
          <p><strong>Email:</strong> <a href="mailto:${email.trim()}" style="color:#6f9bd1;">${email.trim()}</a></p>
          <p><strong>Date & Time:</strong> ${meeting_date} at ${timeDisplay} (${guestTz})</p>
          <p><strong>Location:</strong> 📍 ${meetingLocation}</p>
          <p><strong>Topic / Discussion Agenda:</strong></p>
          <blockquote style="background:#1a2336;border-left:4px solid #d8a53e;padding:12px 16px;margin:0;color:#cbd5e1;">${topic.trim().replace(/\n/g, '<br>')}</blockquote>
        </div>
      `
    }).catch(e => console.error('Meeting email error:', e.message));

    // Determine custom email subject & template or default
    let customSubject = (config.meeting_email_subject || '✓ Meeting Confirmation: {{meeting_date}} @ {{time_slot}} with {{student_name}}')
      .replace(/\{\{name\}\}/g, name.trim())
      .replace(/\{\{meeting_date\}\}/g, meeting_date)
      .replace(/\{\{time_slot\}\}/g, timeDisplay)
      .replace(/\{\{student_name\}\}/g, studentName);

    let customHtml = config.meeting_email_template;
    if (customHtml && customHtml.trim()) {
      customHtml = customHtml
        .replace(/\{\{name\}\}/g, name.trim())
        .replace(/\{\{meeting_date\}\}/g, meeting_date)
        .replace(/\{\{time_slot\}\}/g, `${timeDisplay} (${guestTz})`)
        .replace(/\{\{location\}\}/g, meetingLocation)
        .replace(/\{\{topic\}\}/g, topic.trim())
        .replace(/\{\{cancel_url\}\}/g, cancelUrl)
        .replace(/\{\{student_name\}\}/g, studentName);
    } else {
      customHtml = `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#101726;color:#e2e8f0;padding:24px;border-radius:12px;">
          <h2 style="color:#d8a53e;margin-top:0;">✓ Meeting Confirmed!</h2>
          <p>Hi <strong>${name.trim()}</strong>,</p>
          <p>Your in-person meeting with ${studentName} has been confirmed.</p>
          <div style="background:#1a2336;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #2d3748;">
            <p style="margin:4px 0;"><strong>Date:</strong> ${meeting_date}</p>
            <p style="margin:4px 0;"><strong>Time:</strong> ${timeDisplay} (${guestTz})</p>
            <p style="margin:4px 0;"><strong>Location:</strong> 📍 ${meetingLocation}</p>
            <p style="margin:4px 0;"><strong>Topic:</strong> ${topic.trim()}</p>
          </div>
          <p style="font-size:0.9rem;color:#cbd5e1;">Need to cancel or reschedule? Click the link below:</p>
          <p><a href="${cancelUrl}" style="display:inline-block;padding:8px 16px;background:#ef4444;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:0.85rem;">Cancel / Reschedule Meeting</a></p>
        </div>
      `;
    }

    // Send confirmation & calendar event email to guest
    sendEmail({
      to: email.trim(),
      subject: customSubject,
      html: customHtml
    }).catch(e => console.error('Guest confirmation email error:', e.message));

    // Send Twilio SMS text alert to admin if enabled & configured
    if (config.twilio_sms_enabled && config.twilio_account_sid && config.twilio_auth_token && config.twilio_phone_number && config.admin_phone_number) {
      try {
        const smsBody = `📅 New Portfolio Meeting Booked!\nName: ${name.trim()} (${role || 'Visitor'})\nDate: ${meeting_date} @ ${timeDisplay}\nLoc: ${meetingLocation}\nTopic: ${topic.trim()}`;
        const auth = Buffer.from(`${config.twilio_account_sid.trim()}:${config.twilio_auth_token.trim()}`).toString('base64');
        
        fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.twilio_account_sid.trim()}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            To: config.admin_phone_number.trim(),
            From: config.twilio_phone_number.trim(),
            Body: smsBody
          }).toString()
        }).then(r => r.json()).then(data => {
          if (data.sid) console.log('✓ Twilio SMS Alert sent:', data.sid);
          else console.warn('⚠️ Twilio SMS error:', JSON.stringify(data));
        }).catch(err => console.error('Twilio SMS fetch error:', err.message));
      } catch (smsErr) {
        console.error('Twilio setup error:', smsErr.message);
      }
    }

    // Send Discord webhook notification if configured
    if (config.discord_webhook_url) {
      fetch(config.discord_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '📅 New Portfolio Meeting Booked!',
            color: 0xd8a53e,
            fields: [
              { name: 'Name', value: `${name.trim()} (${role || 'Visitor'})`, inline: true },
              { name: 'Email', value: email.trim(), inline: true },
              { name: 'Date & Time', value: `${meeting_date} @ ${timeDisplay} (${guestTz})`, inline: false },
              { name: 'Location', value: meetingLocation, inline: false },
              { name: 'Topic', value: topic.trim(), inline: false }
            ],
            timestamp: new Date().toISOString()
          }]
        })
      }).catch(e => console.error('Discord webhook error:', e.message));
    }

    if (router.broadcastChange) router.broadcastChange('update');

    res.json({ success: true, message: `Meeting confirmed for ${meeting_date} at ${timeDisplay}! Confirmation & cancellation link sent to ${email.trim()}.`, meeting, cancelUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET/POST Cancel Meeting via Guest Token ────────────────────────
router.all('/meetings/cancel/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM meetings WHERE cancel_token = $1 LIMIT 1',
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).send('<h2 style="font-family:sans-serif;color:#e11d48;text-align:center;margin-top:50px;">Invalid or Expired Cancellation Link</h2>');
    }

    const meeting = rows[0];

    if (req.method === 'POST' || req.query.confirm === 'true') {
      await req.app.locals.pool.query(
        'UPDATE meetings SET status = $1 WHERE cancel_token = $2',
        ['cancelled', token]
      );
      if (router.broadcastChange) router.broadcastChange('update');

      return res.send(`
        <div style="font-family:sans-serif;max-width:500px;margin:60px auto;padding:30px;background:#0f172a;color:#f8fafc;border-radius:12px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
          <h2 style="color:#ef4444;">Meeting Cancelled</h2>
          <p>Your meeting on <strong>${meeting.meeting_date} at ${meeting.time_slot}</strong> has been successfully cancelled.</p>
          <a href="/" style="display:inline-block;margin-top:15px;padding:10px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;">Return to Portfolio</a>
        </div>
      `);
    }

    res.send(`
      <div style="font-family:sans-serif;max-width:500px;margin:60px auto;padding:30px;background:#0f172a;color:#f8fafc;border-radius:12px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <h2 style="color:#f59e0b;">Cancel Scheduled Meeting?</h2>
        <p>Are you sure you want to cancel your meeting with Jordan on <strong>${meeting.meeting_date}</strong> at <strong>${meeting.time_slot}</strong>?</p>
        <form method="POST">
          <button type="submit" style="padding:10px 24px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:1rem;cursor:pointer;font-weight:600;">Yes, Cancel Meeting</button>
        </form>
        <br>
        <a href="/" style="color:#94a3b8;text-decoration:underline;">Keep Meeting & Return</a>
      </div>
    `);
  } catch (err) {
    res.status(500).send('Error processing cancellation: ' + err.message);
  }
});


// ── Server-Sent Events (SSE) Live Sync Endpoint ────────────────
const sseClients = new Set();

router.get('/live-updates', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  sseClients.add(res);

  // Send immediate connection ping
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

function broadcastChange(type = 'update') {
  const payload = `data: ${JSON.stringify({ type, timestamp: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Attach broadcast helper to router
router.broadcastChange = broadcastChange;

module.exports = router;


