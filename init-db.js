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

  const defaultDbUrl = 'postgresql://postgres:3GMXT0DoRD1CNJ43@db.yawerazplomaixydplyh.supabase.co:5432/postgres';
  const dbUrl = (process.env.DATABASE_URL || defaultDbUrl).trim();
  const connStr = dbUrl.replace(/[?&]sslmode=[^&]*/g, '');
  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    console.log('Connecting to database...');
    await pool.query(schema);
    console.log('✓ Database schema initialized successfully!');
  } catch (err) {
    console.error('✗ Failed to initialize database:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDB();
