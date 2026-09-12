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

// ── GET teacher recommendation request token ─────────────────────
router.get('/recommendation-request/:token', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM recommendation_requests WHERE token = $1 LIMIT 1',
      [req.params.token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired recommendation request link.' });
    }
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

// ── POST upload PDF for teacher recommendation ───────────────────
router.post('/recommendation-request/:token/upload-pdf', upload.single('file'), async (req, res) => {
  try {
    const { token } = req.params;
    const { rows } = await req.app.locals.pool.query(
      'SELECT id FROM recommendation_requests WHERE token = $1 LIMIT 1',
      [token]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invalid recommendation token.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    const url = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ error: err.message });
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


