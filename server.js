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

  // Start background meeting worker (reminders, 48h agenda surveys, and post-meeting feedback)
  const { sendEmail } = require('./lib/email');
  setInterval(async () => {
    try {
      const now = new Date();
      const { rows } = await pool.query(
        `SELECT * FROM meetings WHERE status = 'confirmed'`
      );

      for (const m of rows) {
        if (!m.meeting_date || !m.time_slot) continue;
        const hour = parseInt(m.time_slot.split(':')[0], 10);
        const meetingDateTime = new Date(`${m.meeting_date}T${String(hour).padStart(2, '0')}:00:00`);
        const diffMs = meetingDateTime.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        const timeDisplay = isNaN(hour) ? m.time_slot : new Date(2000, 0, 1, hour, 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const locationStr = m.location_type || 'IRL Meeting (School / Library / Coffee Shop)';

        // 1. 48-Hour Pre-Meeting Agenda Survey (between 44 and 52 hours before meeting)
        if (!m.pre_agenda_sent && diffHours > 0 && diffHours <= 52 && diffHours >= 44) {
          await sendEmail({
            to: m.email,
            subject: `📝 Pre-Meeting Prep & Agenda: Upcoming Meeting with Jordan`,
            html: `
              <div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; border:1px solid #1f2937; color:#e5e7eb;">
                  <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center;">
                    <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800;">📝 Meeting Preparation & Agenda Survey</h1>
                    <p style="margin:6px 0 0 0; color:rgba(255,255,255,0.9); font-size:14px;">2 Days Away • ${m.meeting_date} @ ${timeDisplay}</p>
                  </div>
                  <div style="padding:35px 30px;">
                    <p style="margin:0 0 16px 0; font-size:16px; color:#ffffff; font-weight:600;">Hi <strong>${m.name}</strong>,</p>
                    <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:#cbd5e1;">
                      Our upcoming meeting is coming up in 2 days! To ensure our discussion is focused and productive, please take a quick moment to review our scheduled topic:
                    </p>
                    <div style="background-color:#1f2937; border-left:4px solid #3b82f6; padding:18px; border-radius:8px; margin-bottom:24px;">
                      <p style="margin:0 0 6px 0; font-size:13px; text-transform:uppercase; color:#93c5fd; font-weight:700;">Topic Agenda</p>
                      <p style="margin:0; font-size:15px; color:#ffffff;">${m.topic}</p>
                    </div>
                    <p style="margin:0 0 20px 0; font-size:15px; color:#cbd5e1; line-height:1.7;">
                      If you have any updated project links, notes, or questions you would like us to discuss, simply reply directly to this email!
                    </p>
                  </div>
                </div>
              </div>
            `
          }).catch(() => {});
          await pool.query('UPDATE meetings SET pre_agenda_sent = true WHERE id = $1', [m.id]);
        }

        // 2. 24-Hour Reminder (between 23 and 25 hours out)
        if (!m.reminder_sent_24h && diffHours > 0 && diffHours <= 25 && diffHours >= 23) {
          await sendEmail({
            to: m.email,
            subject: `⏰ Reminder: Tomorrow In-Person Meeting at ${timeDisplay} with Jordan`,
            html: `
              <div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; border:1px solid #1f2937; color:#e5e7eb;">
                  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 25px; text-align: center;">
                    <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:800;">⏰ Meeting Reminder (Tomorrow)</h1>
                  </div>
                  <div style="padding:30px;">
                    <p style="margin:0 0 16px 0; font-size:16px;">Hi <strong>${m.name}</strong>,</p>
                    <p style="margin:0 0 20px 0; font-size:15px; color:#cbd5e1;">This is a quick reminder about your scheduled in-person meeting tomorrow!</p>
                    <div style="background-color:#1f2937; border:1px solid #374151; border-radius:10px; padding:20px;">
                      <p style="margin:4px 0;"><strong>Date:</strong> ${m.meeting_date}</p>
                      <p style="margin:4px 0;"><strong>Time:</strong> ${timeDisplay} (${m.guest_timezone || 'EST'})</p>
                      <p style="margin:4px 0;"><strong>Location:</strong> 📍 ${locationStr}</p>
                    </div>
                  </div>
                </div>
              </div>
            `
          }).catch(() => {});
          await pool.query('UPDATE meetings SET reminder_sent_24h = true WHERE id = $1', [m.id]);
        }

        // 3. 1-Hour Reminder (between 0.5 and 1.5 hours out)
        if (!m.reminder_sent_1h && diffHours > 0 && diffHours <= 1.5 && diffHours >= 0.5) {
          await sendEmail({
            to: m.email,
            subject: `⏰ Reminder: Meeting in 1 Hour at ${timeDisplay} with Jordan`,
            html: `
              <div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; border:1px solid #1f2937; color:#e5e7eb;">
                  <div style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); padding: 25px; text-align: center;">
                    <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:800;">⏰ Meeting Starting Soon!</h1>
                  </div>
                  <div style="padding:30px;">
                    <p style="margin:0 0 16px 0; font-size:16px;">Hi <strong>${m.name}</strong>,</p>
                    <p style="margin:0 0 20px 0; font-size:15px; color:#cbd5e1;">Your meeting with Jordan is starting in about 1 hour.</p>
                    <div style="background-color:#1f2937; border:1px solid #374151; border-radius:10px; padding:20px;">
                      <p style="margin:4px 0;"><strong>Time:</strong> ${timeDisplay} (${m.guest_timezone || 'EST'})</p>
                      <p style="margin:4px 0;"><strong>Location:</strong> 📍 ${locationStr}</p>
                    </div>
                  </div>
                </div>
              </div>
            `
          }).catch(() => {});
          await pool.query('UPDATE meetings SET reminder_sent_1h = true WHERE id = $1', [m.id]);
        }

        // 4. Post-Meeting Thank You & Feedback Request (1 to 24 hours AFTER meeting ended)
        if (!m.post_feedback_sent && diffHours <= -1 && diffHours >= -24) {
          await sendEmail({
            to: m.email,
            subject: `🌟 Thanks for meeting today! How was your experience?`,
            html: `
              <div style="background-color:#090d16; padding:40px 20px; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                <div style="max-width:650px; margin:0 auto; background-color:#111827; border-radius:12px; overflow:hidden; border:1px solid #1f2937; color:#e5e7eb;">
                  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
                    <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:800;">🌟 Thank You for Connecting Today!</h1>
                    <p style="margin:6px 0 0 0; color:rgba(255,255,255,0.95); font-size:14px;">We hope your meeting with Jordan was valuable!</p>
                  </div>
                  <div style="padding:35px 30px;">
                    <p style="margin:0 0 16px 0; font-size:16px; color:#ffffff; font-weight:600;">Hi <strong>${m.name}</strong>,</p>
                    <p style="margin:0 0 20px 0; font-size:15px; line-height:1.7; color:#cbd5e1;">
                      Thank you for taking the time to meet with Jordan today on <strong>${m.meeting_date}</strong>. It was a pleasure connecting!
                    </p>
                    <p style="margin:0 0 25px 0; font-size:15px; line-height:1.7; color:#cbd5e1;">
                      If you have a free 30 seconds, please let us know how your experience was. Your feedback helps improve future meetings and may optionally be featured as an endorsement on the portfolio!
                    </p>
                    <div style="background-color:#1f2937; border:1px solid #374151; border-radius:10px; padding:24px; text-align:center;">
                      <h4 style="margin:0 0 12px 0; color:#fbbf24; font-size:16px;">Leave Feedback & Rating ⭐</h4>
                      <p style="margin:0 0 16px 0; font-size:14px; color:#9ca3af;">Click below to submit your rating:</p>
                      <a href="http://localhost:3000/?feedbackToken=${m.cancel_token}" style="display:inline-block; background: linear-gradient(135deg, #10b981, #059669); color:#ffffff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:14px;">Leave Quick Feedback ↗</a>
                    </div>
                  </div>
                </div>
              </div>
            `
          }).catch(() => {});
          await pool.query('UPDATE meetings SET post_feedback_sent = true WHERE id = $1', [m.id]);
        }
      }
    } catch (err) {
      console.error('Reminder check error:', err.message);
    }
  }, 15 * 60 * 1000);
});
