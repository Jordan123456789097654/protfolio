const { Pool } = require('pg');
const dns = require('dns');
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');

function ipv4Lookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  dns.lookup(hostname, { family: 4, all: false }, callback);
}

const url = (process.env.DATABASE_URL || 'postgresql://postgres.yawerazplomaixydplyh:Swr0zw7CSc0yaaId@aws-0-us-west-2.pooler.supabase.com:6543/postgres').trim();
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, lookup: ipv4Lookup });

async function seedSchoolEvents() {
  try {
    const events = [
      { title: '🤖 Weekly Robotics Practice (Tue & Thu)', event_date: 'Every Tue & Thu', start: '07:45', end: '08:45', loc: 'Robotics Lab / CAD Studio', cat: 'Robotics', desc: 'Robotics build season team practice & autonomous code testing' },
      { title: '👔 FBLA Officer Meeting (Weekly Thu)', event_date: 'Every Thursday', start: '08:00', end: '08:30', loc: 'FBLA Chapter Room', cat: 'FBLA', desc: 'Weekly chapter leadership & competition planning' }
    ];

    for (const ev of events) {
      await pool.query(
        `INSERT INTO school_events (title, event_date, start_time, end_time, location, category, description, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [ev.title, ev.event_date, ev.start, ev.end, ev.loc, ev.cat, ev.desc]
      );
      console.log(`✓ Added public calendar event: ${ev.title}`);
    }

    console.log('\n🎉 Successfully published Robotics & FBLA recurring events to Public Calendar!');
  } catch (err) {
    console.error('Error inserting school events:', err);
  } finally {
    await pool.end();
  }
}

seedSchoolEvents();
