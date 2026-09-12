// Database initializer — runs schema.sql against the Supabase database
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function initDB() {
  const dns = require('dns');
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }

  function ipv4Lookup(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    dns.lookup(hostname, { family: 4, all: false }, callback);
  }

  const primaryUrl = (process.env.DATABASE_URL || 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:5432/postgres').trim();
  const fallbackUrl = 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

  async function tryConnect(url) {
    const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, '');
    const pool = new Pool({
      connectionString: cleanUrl,
      ssl: { rejectUnauthorized: false },
      lookup: ipv4Lookup,
      connectionTimeoutMillis: 10000
    });
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    await pool.end();
  }

  try {
    console.log('Connecting to database via primary URL...');
    await tryConnect(primaryUrl);
    console.log('✓ Database schema initialized successfully!');
  } catch (err) {
    console.warn('⚠️ Primary initialization failed:', err.message, '--> Retrying with direct fallback URL...');
    try {
      await tryConnect(fallbackUrl);
      console.log('✓ Database schema initialized via fallback URL!');
    } catch (fallbackErr) {
      console.error('✗ Failed to initialize database:', fallbackErr.message);
      process.exit(1);
    }
  }
}

initDB();
