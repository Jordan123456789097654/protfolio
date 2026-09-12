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

const primaryUrl = (process.env.DATABASE_URL || 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:5432/postgres').trim();
const fallbackUrl = 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

function createPool(url) {
  const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, '');
  return new Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
    lookup: ipv4Lookup,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
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
