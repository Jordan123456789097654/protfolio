require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { Pool } = require('pg');
const { ensureBucket } = require('./lib/supabaseStorage');

const app = express();
const port = process.env.PORT || 3000;

// Database connection pool with automatic pooler & direct fallback
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// Force IPv4 lookup function for pg pool connection socket
function ipv4Lookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { family: 4, all: false }, callback);
}

const primaryUrl = (process.env.DATABASE_URL || 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:6543/postgres').trim();
const fallbackUrl = 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:5432/postgres';

function createPool(url) {
  const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, '');
  return new Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
    lookup: ipv4Lookup,
    max: 5, // Keep connection count well under Supabase 15 client limit
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    maxUses: 75 // Close and recycle socket after 75 queries to prevent session accumulation
  });
}

let pool = createPool(primaryUrl);

// Verify DB connection on startup, fallback to direct hostname if pooler fails
pool.query('SELECT NOW()')
  .then(() => console.log('✓ Connected to database via primary URL'))
  .catch(err => {
    console.warn('⚠️ Primary DB connection failed:', err.message, '--> Trying fallback connection...');
    pool = createPool(fallbackUrl);
    app.locals.pool = pool;
    pool.query('SELECT NOW()')
      .then(() => console.log('✓ Connected to database via fallback URL'))
      .catch(fallbackErr => console.error('✗ All database connections failed:', fallbackErr.message));
  });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Security Headers ─────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Simple in-memory rate limiter (no npm needed) ─────────────────
const rateLimitMap = new Map();
function rateLimit(windowMs, max) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const record = rateLimitMap.get(key) || { count: 0, start: now };
    if (now - record.start > windowMs) {
      record.count = 0;
      record.start = now;
    }
    record.count++;
    rateLimitMap.set(key, record);
    if (record.count > max) {
      return res.status(429).json({ error: 'Too many requests, please slow down.' });
    }
    next();
  };
}
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Make pool available to route handlers
app.locals.pool = pool;

// Best-effort: create the Supabase Storage bucket for image uploads if it
// doesn't already exist. Safe to skip if Supabase Storage isn't configured.
ensureBucket();

// Mount routes — more specific paths first so they take priority over '/admin'
const apiRouter = require('./routes/api');
app.use('/admin/spotify', require('./routes/spotify'));
app.use('/api', apiRouter);

// Apply rate limit to public form submission endpoints
app.use('/api/contact', rateLimit(60000, 5));
app.use('/api/recommendations/submit', rateLimit(60000, 3));

// Middleware to trigger real-time broadcast to connected browsers on admin data mutations
app.use('/admin', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (apiRouter.broadcastChange) apiRouter.broadcastChange('update');
      }
      return originalJson(body);
    };
  }
  next();
}, require('./routes/admin'));

// Admin HTML navigation fallback for any /admin/* browser requests
app.get(['/admin', '/admin/*'], (req, res, next) => {
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }
  next();
});

// Fallback — serve index.html for any unmatched public route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(port, () => {
  console.log(`\n  ✦ Portfolio running at http://localhost:${port}`);
  console.log(`  ✦ Admin panel running at http://localhost:${port}/admin/\n`);

  // Start background meeting reminder checker (runs every 15 minutes)
  const { sendEmail } = require('./lib/email');
  setInterval(async () => {
    try {
      const now = new Date();
      const { rows } = await pool.query(
        `SELECT * FROM meetings WHERE status = 'confirmed' AND (reminder_sent_24h = false OR reminder_sent_1h = false)`
      );

      for (const m of rows) {
        if (!m.meeting_date || !m.time_slot) continue;
        const hour = parseInt(m.time_slot.split(':')[0], 10);
        const meetingDateTime = new Date(`${m.meeting_date}T${String(hour).padStart(2, '0')}:00:00`);
        const diffMs = meetingDateTime.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        const timeDisplay = new Date(2000, 0, 1, hour, 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const locationStr = m.location_type || 'IRL Meeting (School / Library / Coffee Shop)';

        // 24-Hour Reminder (between 23 and 25 hours out)
        if (!m.reminder_sent_24h && diffHours > 0 && diffHours <= 25 && diffHours >= 23) {
          await sendEmail({
            to: m.email,
            subject: `⏰ Reminder: Tomorrow In-Person Meeting at ${timeDisplay} with Jordan`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#101726;color:#e2e8f0;padding:24px;border-radius:12px;">
                <h2 style="color:#d8a53e;">⏰ Meeting Reminder (Tomorrow)</h2>
                <p>Hi <strong>${m.name}</strong>,</p>
                <p>This is a quick reminder about your scheduled in-person meeting tomorrow!</p>
                <div style="background:#1a2336;padding:14px;border-radius:8px;margin:15px 0;">
                  <p style="margin:4px 0;"><strong>Date:</strong> ${m.meeting_date}</p>
                  <p style="margin:4px 0;"><strong>Time:</strong> ${timeDisplay} (${m.guest_timezone || 'EST'})</p>
                  <p style="margin:4px 0;"><strong>Location:</strong> 📍 ${locationStr}</p>
                </div>
              </div>
            `
          }).catch(() => {});
          await pool.query('UPDATE meetings SET reminder_sent_24h = true WHERE id = $1', [m.id]);
        }

        // 1-Hour Reminder (between 0.5 and 1.5 hours out)
        if (!m.reminder_sent_1h && diffHours > 0 && diffHours <= 1.5 && diffHours >= 0.5) {
          await sendEmail({
            to: m.email,
            subject: `⏰ Reminder: Meeting in 1 Hour at ${timeDisplay} with Jordan`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#101726;color:#e2e8f0;padding:24px;border-radius:12px;">
                <h2 style="color:#d8a53e;">⏰ Meeting Starting Soon!</h2>
                <p>Hi <strong>${m.name}</strong>,</p>
                <p>Your meeting with Jordan is starting in about 1 hour.</p>
                <div style="background:#1a2336;padding:14px;border-radius:8px;margin:15px 0;">
                  <p style="margin:4px 0;"><strong>Time:</strong> ${timeDisplay} (${m.guest_timezone || 'EST'})</p>
                  <p style="margin:4px 0;"><strong>Location:</strong> 📍 ${locationStr}</p>
                </div>
              </div>
            `
          }).catch(() => {});
          await pool.query('UPDATE meetings SET reminder_sent_1h = true WHERE id = $1', [m.id]);
        }
      }
    } catch (err) {
      console.error('Reminder check error:', err.message);
    }
  }, 15 * 60 * 1000);
});
