// Database initializer — runs schema.sql against the Supabase database
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function initDB() {
  const connStr = process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, '');
  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
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
