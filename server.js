require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const { Pool } = require('pg');
const { ensureBucket } = require('./lib/supabaseStorage');

const app = express();
const port = process.env.PORT || 3000;

// Database connection pool — strip sslmode param to avoid self-signed cert issues
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const dbUrl = process.env.DATABASE_URL || '';
const connStr = dbUrl.replace(/[?&]sslmode=[^&]*/g, '');
const pool = new Pool({
  connectionString: connStr,
  ssl: dbUrl ? { rejectUnauthorized: false } : false
});

// Verify DB connection on startup
pool.query('SELECT NOW()')
  .then(() => console.log('✓ Connected to database'))
  .catch(err => console.error('✗ Database connection failed:', err.message));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
app.use('/admin/spotify', require('./routes/spotify'));
app.use('/api', require('./routes/api'));
app.use('/admin', require('./routes/admin'));

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
});
