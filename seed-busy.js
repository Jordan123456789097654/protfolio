const { Pool } = require('pg');
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

function ipv4Lookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  dns.lookup(hostname, { family: 4, all: false }, callback);
}

const url = (process.env.DATABASE_URL || 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:6543/postgres').trim();
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, lookup: ipv4Lookup });

async function seedSchedules() {
  try {
    // First clear old robotics / FBLA entries to keep schedules clean
    await pool.query("DELETE FROM busy_schedules WHERE title LIKE '%Robotics%' OR title LIKE '%FBLA%'");

    const schedules = [
      { title: 'VEX Robotics Practice & Autonomous Coding', day: 'Tuesday', start: '07:45', end: '08:45', desc: 'Tuesday morning robotics build team' },
      { title: 'VEX Robotics Practice & Autonomous Coding', day: 'Thursday', start: '07:45', end: '08:45', desc: 'Thursday morning robotics build team' },
      { title: 'FBLA Morning Chapter Officer Meeting', day: 'Thursday', start: '08:00', end: '08:30', desc: 'Thursday morning FBLA officer meeting' }
    ];

    for (const s of schedules) {
      await pool.query(
        `INSERT INTO busy_schedules (title, day_of_week, start_time, end_time, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [s.title, s.day, s.start, s.end, s.desc]
      );
      console.log(`✓ Added recurring busy block: ${s.title} on ${s.day} (${s.start} - ${s.end})`);
    }

    console.log('\n🎉 Recurring Robotics & FBLA schedules successfully added to DB!');
  } catch (err) {
    console.error('Error seeding schedules:', err);
  } finally {
    await pool.end();
  }
}

seedSchedules();
