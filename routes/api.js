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

// ── GET School & Public Events ────────────────────────────────────
router.get('/events', async (req, res) => {
  try {
    const { rows } = await safeQuery(
      req.app.locals.pool,
      'SELECT * FROM school_events WHERE is_published = true ORDER BY event_date ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST Meeting Feedback / Testimonial ───────────────────────────
router.post('/meetings/feedback', async (req, res) => {
  try {
    const { token, rating, comment } = req.body;
    if (!token || !rating) {
      return res.status(400).json({ error: 'Rating and meeting token are required.' });
    }

    const { rows } = await req.app.locals.pool.query(
      'UPDATE meetings SET feedback_rating = $1, feedback_comment = $2 WHERE cancel_token = $3 RETURNING *',
      [parseInt(rating, 10), (comment || '').trim(), token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found.' });
    }

    const m = rows[0];

    // Automatically create testimonial entry if rating is 5 stars and feedback is detailed!
    if (parseInt(rating, 10) >= 4 && comment && comment.trim().length > 10) {
      await req.app.locals.pool.query(
        'INSERT INTO testimonials (quote, author_name, author_role, is_published, sort_order) VALUES ($1, $2, $3, true, 0)',
        [comment.trim(), m.name, m.role || 'Meeting Guest']
      ).catch(() => {});
    }

    res.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET certifications ───────────────────────────────────────────
router.get('/certifications', async (req, res) => {
  const { rows } = await safeQuery(
    req.app.locals.pool,
    'SELECT * FROM certifications WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
  );
  res.json(rows);
});

// ── GET public academic & school events ───────────────────────────
router.get('/events', async (req, res) => {
  try {
    const { rows: schoolEvents } = await safeQuery(
      req.app.locals.pool,
      'SELECT * FROM school_events WHERE is_published = true ORDER BY event_date ASC, start_time ASC'
    );

    const { rows: busyBlocks } = await safeQuery(
      req.app.locals.pool,
      'SELECT * FROM busy_schedules ORDER BY day_of_week ASC, start_time ASC'
    );

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Map busy blocks (like Robotics & FBLA) into public event cards
    const mappedBusy = (busyBlocks || []).map(b => {
      let cat = 'School Event';
      const titleLower = (b.title || '').toLowerCase();
      if (titleLower.includes('robotics')) cat = 'Robotics';
      else if (titleLower.includes('fbla')) cat = 'FBLA';

      const dayStr = typeof b.day_of_week === 'number' ? dayNames[b.day_of_week] || 'Weekly' : b.day_of_week;

      return {
        id: `busy_${b.id}`,
        title: b.title || 'Academic Hold',
        category: cat,
        event_date: `${dayStr}s`,
        start_time: b.start_time,
        end_time: b.end_time,
        location: b.description || 'School Campus',
        description: b.description || 'Weekly recurring academic hold',
        is_recurring: true,
        recurrence_rule: 'weekly',
        is_published: true
      };
    });

    const combined = [...(schoolEvents || []), ...mappedBusy];

    res.json({
      success: true,
      events: combined
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, events: [] });
  }
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

// ── GET FAQs endpoint ─────────────────────────────────────────────
router.get('/faqs', async (req, res) => {
  try {
    const { rows } = await safeQuery(
      req.app.locals.pool,
      'SELECT * FROM faqs ORDER BY sort_order ASC, id ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
        subject: `📬 New Detailed Message from ${name.trim()}`,
        html: `
          <div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #1f2937; color:#e5e7eb;">
              
              <!-- Header -->
              <div style="background: linear-gradient(135deg, #6c63ff 0%, #3b82f6 100%); padding: 30px; text-align: center;">
                <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800; letter-spacing:-0.5px;">
                  📬 New Contact Message Received
                </h1>
                <p style="margin:6px 0 0 0; color:rgba(255,255,255,0.9); font-size:14px;">Direct inquiry from your portfolio website</p>
              </div>

              <!-- Content Body -->
              <div style="padding:35px 30px;">
                <p style="margin:0 0 16px 0; font-size:15px; color:#cbd5e1; line-height:1.7;">
                  You have received a new direct communication inquiry submitted through your interactive portfolio contact modal. Below are the verified details of the sender and their complete message.
                </p>

                <!-- Details Card -->
                <div style="background-color:#1f2937; border:1px solid #374151; border-radius:10px; padding:20px; margin-bottom:25px;">
                  <h3 style="margin:0 0 12px 0; color:#818cf8; font-size:15px; font-weight:700; border-bottom:1px solid #374151; padding-bottom:8px;">👤 Sender Information</h3>
                  <p style="margin:6px 0; font-size:15px; color:#e5e7eb;"><strong>Name:</strong> ${name.trim()}</p>
                  <p style="margin:6px 0; font-size:15px; color:#e5e7eb;"><strong>Email:</strong> <a href="mailto:${email.trim()}" style="color:#60a5fa; text-decoration:underline;">${email.trim()}</a></p>
                  <p style="margin:6px 0; font-size:13px; color:#9ca3af;"><strong>Received At:</strong> ${new Date().toLocaleString()}</p>
                </div>

                <!-- Message Box -->
                <div style="background-color:#141d2b; border-left:4px solid #6366f1; padding:20px; border-radius:6px; margin-bottom:25px;">
                  <h4 style="margin:0 0 10px 0; color:#a5b4fc; font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">💬 Message Body</h4>
                  <div style="font-size:15px; color:#e2e8f0; line-height:1.8; whitespace:pre-wrap;">${message.trim().replace(/\n/g, '<br>')}</div>
                </div>

                <div style="background:rgba(99, 102, 241, 0.1); border:1px solid rgba(99, 102, 241, 0.2); border-radius:8px; padding:15px; text-align:center;">
                  <p style="margin:0 0 10px 0; font-size:14px; color:#c7d2fe;">To reply directly to ${name.trim()}, click the response link below:</p>
                  <a href="mailto:${email.trim()}?subject=Re:%20Portfolio%20Inquiry" style="display:inline-block; background-color:#6366f1; color:#ffffff; padding:10px 22px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:14px;">Reply via Email ✉️</a>
                </div>
              </div>

              <!-- Footer -->
              <div style="background-color:#0b111e; padding:18px 30px; text-align:center; border-top:1px solid #1f2937;">
                <p style="font-size:12px; color:#64748b; margin:0;">Automated System Dispatch • Portfolio Interactive Platform</p>
              </div>
            </div>
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

      // Check if slot overlaps with any busy block (using minute precision)
      let busyReasons = [];
      const slotStartMin = slotHour * 60;
      const slotEndMin = (slotHour + 1) * 60;

      for (const b of busyBlocks) {
        const [bStartH, bStartM] = b.start_time.split(':').map(n => parseInt(n, 10));
        const [bEndH, bEndM] = b.end_time.split(':').map(n => parseInt(n, 10));
        const bStartTotal = bStartH * 60 + (bStartM || 0);
        const bEndTotal = bEndH * 60 + (bEndM || 0);

        // Check if [slotStartMin, slotEndMin) overlaps with [bStartTotal, bEndTotal)
        if (slotStartMin < bEndTotal && slotEndMin > bStartTotal) {
          busyReasons.push(b.title);
        }
      }
      const busyReason = busyReasons.length > 0 ? busyReasons.join(' & ') : null;

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
    const confirmToken = crypto.randomBytes(24).toString('hex');
    const meetingLocation = location_type || 'IRL Meeting (School / Library / Coffee Shop)';
    const guestTz = guest_timezone || 'EST';

    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO meetings (name, email, role, meeting_date, time_slot, topic, location_type, guest_timezone, cancel_token, confirm_token, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending') RETURNING *`,
      [name.trim(), email.trim(), role || 'Visitor', meeting_date, time_slot, topic.trim(), meetingLocation, guestTz, cancelToken, confirmToken]
    );
    const meeting = rows[0];

    // Fetch site config for custom templates, notification email, discord webhook
    const { rows: configRows } = await safeQuery(
      req.app.locals.pool,
      `SELECT name, notification_email, discord_webhook_url,
              meeting_email_subject, meeting_email_template
       FROM site_config LIMIT 1`
    );
    const config = configRows[0] || {};
    const notifyEmail = config.notification_email || 'jordan.lmmsfbla@outlook.com';

    // Format readable time display
    const hour = parseInt(time_slot.split(':')[0], 10);
    const timeDisplay = new Date(2000, 0, 1, hour, 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const protocol = req.protocol || 'https';
    const host = req.get('host') || 'localhost:3000';
    const confirmUrl = `${protocol}://${host}/api/meetings/confirm/${confirmToken}`;
    const cancelUrl = `${protocol}://${host}/api/meetings/cancel/${cancelToken}`;
    const studentName = config.name || 'Jordan';

    // Send email notification to student (admin) with Action Links
    sendEmail({
      to: notifyEmail,
      subject: `📅 New In-Person Meeting Request from ${name.trim()} (${role || 'Visitor'})`,
      html: `
        <div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #1f2937; color:#e5e7eb;">
            
            <!-- Banner Header -->
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center;">
              <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800; letter-spacing:-0.5px;">
                📍 New Meeting Booking Requested
              </h1>
              <p style="margin:6px 0 0 0; color:rgba(255,255,255,0.95); font-size:14px;">Action Required • Approve or Decline Below</p>
            </div>

            <!-- Content -->
            <div style="padding:35px 30px;">
              <p style="margin:0 0 16px 0; font-size:15px; color:#cbd5e1; line-height:1.7;">
                Hello <strong>${studentName}</strong>, a visitor on your interactive portfolio website has submitted a new in-person meeting request. Review their contact information, proposed date, time, location, and topic agenda below.
              </p>

              <!-- Details Card -->
              <div style="background-color:#1f2937; border:1px solid #374151; border-radius:10px; padding:22px; margin-bottom:25px;">
                <h3 style="margin:0 0 14px 0; color:#fbbf24; font-size:15px; font-weight:700; border-bottom:1px solid #374151; padding-bottom:8px;">📌 Booking Details Summary</h3>
                <table style="width:100%; border-collapse:collapse; font-size:15px; color:#e5e7eb;">
                  <tr>
                    <td style="padding:8px 0; font-weight:bold; color:#9ca3af; width:120px;">👤 Visitor:</td>
                    <td style="padding:8px 0; font-weight:600; color:#ffffff;">${name.trim()} (${role || 'Visitor'})</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0; font-weight:bold; color:#9ca3af;">📧 Email:</td>
                    <td style="padding:8px 0;"><a href="mailto:${email.trim()}" style="color:#60a5fa;">${email.trim()}</a></td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0; font-weight:bold; color:#9ca3af;">📅 Date & Time:</td>
                    <td style="padding:8px 0; font-weight:600; color:#ffffff;">${meeting_date} @ ${timeDisplay} (${guestTz})</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0; font-weight:bold; color:#9ca3af;">📍 Location:</td>
                    <td style="padding:8px 0; color:#6f9bd1;">📍 ${meetingLocation}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0; font-weight:bold; color:#9ca3af;">💬 Discussion Topic:</td>
                    <td style="padding:8px 0; color:#e5e7eb;">${topic.trim()}</td>
                  </tr>
                </table>
              </div>

              <!-- Quick Action Card -->
              <div style="background-color:#141d2b; border:1px solid #2d3748; border-radius:10px; padding:20px; text-align:center; margin-bottom:15px;">
                <p style="margin:0 0 16px 0; font-size:15px; font-weight:700; color:#ffffff;">Select an Action to Instantly Respond:</p>
                <a href="${confirmUrl}" style="display:inline-block; padding:12px 28px; margin-right:12px; background-color:#22c55e; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:bold; font-size:14px; box-shadow:0 4px 12px rgba(34,197,94,0.3);">✓ Accept & Confirm Meeting</a>
                <a href="${cancelUrl}" style="display:inline-block; padding:12px 28px; background-color:#ef4444; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:bold; font-size:14px; box-shadow:0 4px 12px rgba(239,68,68,0.3);">✕ Decline Request</a>
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color:#0b111e; padding:18px 30px; text-align:center; border-top:1px solid #1f2937;">
              <p style="font-size:12px; color:#64748b; margin:0;">Automated System Dispatch • Interactive Portfolio Meeting Manager</p>
            </div>

          </div>
        </div>
      `
    }).catch(e => console.error('Meeting email error:', e.message));

    // Determine custom email subject & template or default for initial guest acknowledgement
    let customSubject = (config.meeting_email_subject || '⏳ Meeting Requested: {{meeting_date}} @ {{time_slot}} with {{student_name}}')
      .replace(/\{\{name\}\}/g, name.trim())
      .replace(/\{\{meeting_date\}\}/g, meeting_date)
      .replace(/\{\{time_slot\}\}/g, timeDisplay)
      .replace(/\{\{student_name\}\}/g, studentName);

    let customHtml = `
      <div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #1f2937; color:#e5e7eb;">
          
          <!-- Banner Header -->
          <div style="background: linear-gradient(135deg, #d8a53e 0%, #b45309 100%); padding: 30px; text-align: center;">
            <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800; letter-spacing:-0.5px;">
              ⏳ Meeting Request Received!
            </h1>
            <p style="margin:6px 0 0 0; color:rgba(255,255,255,0.95); font-size:14px;">Your reservation request is currently pending review</p>
          </div>

          <!-- Content -->
          <div style="padding:35px 30px;">
            <p style="margin:0 0 16px 0; font-size:16px; color:#ffffff; font-weight:600;">Hi <strong>${name.trim()}</strong>,</p>
            
            <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:#cbd5e1;">
              Thank you for requesting an in-person meeting with <strong>${studentName}</strong>! Your request has been successfully recorded in our scheduling portal and is currently awaiting confirmation.
            </p>

            <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:#cbd5e1;">
              Below is a summary of the reservation details submitted for your meeting. You will receive an immediate follow-up confirmation email as soon as your requested time slot is approved.
            </p>

            <!-- Details Card -->
            <div style="background-color:#1f2937; border:1px solid #374151; border-radius:10px; padding:22px; margin-bottom:25px;">
              <h3 style="margin:0 0 14px 0; color:#fbbf24; font-size:15px; font-weight:700; border-bottom:1px solid #374151; padding-bottom:8px;">📍 Pending Request Overview</h3>
              <table style="width:100%; border-collapse:collapse; font-size:15px; color:#e5e7eb;">
                <tr>
                  <td style="padding:8px 0; font-weight:bold; color:#9ca3af; width:120px;">📅 Date:</td>
                  <td style="padding:8px 0; font-weight:600; color:#ffffff;">${meeting_date}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0; font-weight:bold; color:#9ca3af;">⏰ Time Slot:</td>
                  <td style="padding:8px 0; font-weight:600; color:#ffffff;">${timeDisplay} (${guestTz})</td>
                </tr>
                <tr>
                  <td style="padding:8px 0; font-weight:bold; color:#9ca3af;">📍 Location:</td>
                  <td style="padding:8px 0; color:#6f9bd1;">📍 ${meetingLocation}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0; font-weight:bold; color:#9ca3af;">💬 Topic:</td>
                  <td style="padding:8px 0; color:#e5e7eb;">${topic.trim()}</td>
                </tr>
              </table>
            </div>

            <p style="margin:0 0 16px 0; font-size:14px; color:#cbd5e1;">
              If your plans change before confirmation or if you need to withdraw this request, you may cancel it at any time using the link below:
            </p>

            <div>
              <a href="${cancelUrl}" style="display:inline-block; background-color:#ef4444; color:#ffffff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:14px;">Cancel Pending Request</a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color:#0b111e; padding:18px 30px; text-align:center; border-top:1px solid #1f2937;">
            <p style="font-size:12px; color:#64748b; margin:0;">Sent via ${studentName}'s Interactive Scheduling System</p>
          </div>

        </div>
      </div>
    `;

    // Send acknowledgement email to guest
    sendEmail({
      to: email.trim(),
      subject: customSubject,
      html: customHtml
    }).catch(e => console.error('Guest confirmation email error:', e.message));

    // Send Discord webhook notification if configured
    if (config.discord_webhook_url) {
      fetch(config.discord_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '📅 New Portfolio Meeting Requested!',
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

    res.json({ success: true, message: `Meeting request submitted for ${meeting_date} at ${timeDisplay}! An update will be sent to ${email.trim()}.`, meeting, cancelUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET/POST Confirm Meeting via Admin Token ────────────────────────
router.all('/meetings/confirm/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM meetings WHERE confirm_token = $1 LIMIT 1',
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).send('<h2 style="font-family:sans-serif;color:#e11d48;text-align:center;margin-top:50px;">Invalid or Expired Confirmation Link</h2>');
    }

    const meeting = rows[0];

    if (meeting.status === 'confirmed') {
      return res.send(`
        <div style="font-family:sans-serif;max-width:500px;margin:60px auto;padding:30px;background:#0f172a;color:#f8fafc;border-radius:12px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
          <h2 style="color:#22c55e;">Already Confirmed!</h2>
          <p>This meeting with <strong>${meeting.name}</strong> on <strong>${meeting.meeting_date} at ${meeting.time_slot}</strong> was already accepted.</p>
          <a href="/" style="display:inline-block;margin-top:15px;padding:10px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;">Return to Portfolio</a>
        </div>
      `);
    }

    await req.app.locals.pool.query(
      'UPDATE meetings SET status = $1 WHERE confirm_token = $2',
      ['confirmed', token]
    );

    // Format readable time display
    const hour = parseInt(meeting.time_slot.split(':')[0], 10);
    const timeDisplay = new Date(2000, 0, 1, hour, 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const protocol = req.protocol || 'https';
    const host = req.get('host') || 'localhost:3000';
    const cancelUrl = `${protocol}://${host}/api/meetings/cancel/${meeting.cancel_token}`;

    // Fetch site config for custom email template
    const { rows: configRows } = await safeQuery(
      req.app.locals.pool,
      `SELECT name, meeting_email_subject, meeting_email_template FROM site_config LIMIT 1`
    );
    const config = configRows[0] || {};
    const studentName = config.name || 'Jordan';

    let guestHtml = config.meeting_email_template;
    if (guestHtml && guestHtml.trim()) {
      guestHtml = guestHtml
        .replace(/\{\{name\}\}/g, meeting.name)
        .replace(/\{\{student_name\}\}/g, studentName)
        .replace(/\{\{meeting_date\}\}/g, meeting.meeting_date)
        .replace(/\{\{time_slot\}\}/g, `${timeDisplay} (${meeting.guest_timezone || 'EST'})`)
        .replace(/\{\{location\}\}/g, meeting.location_type || 'IRL Meeting')
        .replace(/\{\{topic\}\}/g, meeting.topic)
        .replace(/\{\{cancel_url\}\}/g, cancelUrl);
    } else {
      guestHtml = `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#101726;color:#e2e8f0;padding:24px;border-radius:12px;">
          <h2 style="color:#22c55e;margin-top:0;">✓ Meeting Confirmed!</h2>
          <p>Hi <strong>${meeting.name}</strong>,</p>
          <p>Your meeting request has been officially accepted and scheduled!</p>
          <div style="background:#1a2336;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #2d3748;">
            <p style="margin:4px 0;"><strong>Date:</strong> ${meeting.meeting_date}</p>
            <p style="margin:4px 0;"><strong>Time:</strong> ${timeDisplay} (${meeting.guest_timezone || 'EST'})</p>
            <p style="margin:4px 0;"><strong>Location:</strong> 📍 ${meeting.location_type || 'IRL Meeting'}</p>
            <p style="margin:4px 0;"><strong>Topic:</strong> ${meeting.topic}</p>
          </div>
          <p style="font-size:0.9rem;color:#cbd5e1;">Need to cancel or reschedule? Click below:</p>
          <p><a href="${cancelUrl}" style="display:inline-block;padding:8px 16px;background:#ef4444;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:0.85rem;">Cancel / Reschedule Meeting</a></p>
        </div>
      `;
    }

    // Send confirmation email to guest
    sendEmail({
      to: meeting.email,
      subject: `✓ Meeting Confirmed: ${meeting.meeting_date} @ ${timeDisplay}`,
      html: guestHtml
    }).catch(e => console.error('Guest confirmation update email error:', e.message));

    if (router.broadcastChange) router.broadcastChange('update');

    return res.send(`
      <div style="font-family:sans-serif;max-width:500px;margin:60px auto;padding:30px;background:#0f172a;color:#f8fafc;border-radius:12px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <h2 style="color:#22c55e;">Meeting Accepted & Confirmed!</h2>
        <p>You have accepted the meeting with <strong>${meeting.name}</strong> on <strong>${meeting.meeting_date} at ${timeDisplay}</strong>.</p>
        <p style="color:#94a3b8;font-size:0.9rem;">A confirmation notification has been emailed to ${meeting.email}.</p>
        <a href="/" style="display:inline-block;margin-top:15px;padding:10px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;">Return to Portfolio</a>
      </div>
    `);
  } catch (err) {
    res.status(500).send('Error processing confirmation: ' + err.message);
  }
});

// ── GET/POST Cancel Meeting via Guest/Admin Token ────────────────────────
router.all('/meetings/cancel/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM meetings WHERE cancel_token = $1 LIMIT 1',
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).send('<h2 style="font-family:sans-serif;color:#e11d48;text-align:center;margin-top:50px;">Invalid or Expired Link</h2>');
    }

    const meeting = rows[0];

    if (req.method === 'POST' || req.query.confirm === 'true') {
      await req.app.locals.pool.query(
        'UPDATE meetings SET status = $1 WHERE cancel_token = $2',
        ['cancelled', token]
      );

      // Send cancellation notice to guest if cancelled by admin
      sendEmail({
        to: meeting.email,
        subject: `✕ Meeting Cancelled: ${meeting.meeting_date} @ ${meeting.time_slot}`,
        html: `
          <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#101726;color:#e2e8f0;padding:24px;border-radius:12px;">
            <h2 style="color:#ef4444;margin-top:0;">✕ Meeting Status Update</h2>
            <p>Hi <strong>${meeting.name}</strong>,</p>
            <p>The meeting scheduled for <strong>${meeting.meeting_date} at ${meeting.time_slot}</strong> has been cancelled or declined.</p>
          </div>
        `
      }).catch(e => console.error('Cancellation email error:', e.message));

      if (router.broadcastChange) router.broadcastChange('update');

      return res.send(`
        <div style="font-family:sans-serif;max-width:500px;margin:60px auto;padding:30px;background:#0f172a;color:#f8fafc;border-radius:12px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
          <h2 style="color:#ef4444;">Meeting Cancelled / Declined</h2>
          <p>The meeting on <strong>${meeting.meeting_date} at ${meeting.time_slot}</strong> has been cancelled.</p>
          <a href="/" style="display:inline-block;margin-top:15px;padding:10px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;">Return to Portfolio</a>
        </div>
      `);
    }

    res.send(`
      <div style="font-family:sans-serif;max-width:500px;margin:60px auto;padding:30px;background:#0f172a;color:#f8fafc;border-radius:12px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
        <h2 style="color:#f59e0b;">Cancel / Decline Meeting?</h2>
        <p>Are you sure you want to cancel the meeting with <strong>${meeting.name}</strong> on <strong>${meeting.meeting_date}</strong> at <strong>${meeting.time_slot}</strong>?</p>
        <form method="POST">
          <button type="submit" style="padding:10px 24px;background:#ef4444;color:#fff;border:none;border-radius:6px;font-size:1rem;cursor:pointer;font-weight:600;">Yes, Cancel / Decline Meeting</button>
        </form>
        <br>
        <a href="/" style="color:#94a3b8;text-decoration:underline;">Return to Main Site</a>
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


