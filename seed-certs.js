require('dotenv').config();
const { Pool } = require('pg');

async function seed() {
  const connStr = process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, '');
  const pool = new Pool({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const check = await pool.query('SELECT COUNT(*) FROM certifications');
    if (parseInt(check.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO certifications (title, issuer, issue_date, credential_id, credential_url, category, description, sort_order) 
        VALUES 
          ('AWS Certified Cloud Practitioner', 'Amazon Web Services', 'May 2024', 'AWS-8392017', 'https://aws.amazon.com/certification/', 'Cloud & DevOps', 'Validated foundational understanding of AWS Cloud concepts, security, architecture, and pricing.', 1),
          ('AP Computer Science A (Score: 5)', 'College Board', 'June 2024', 'AP-2024-9182', '', 'Academics', 'Mastery of Java programming fundamentals, object-oriented design, algorithms, and data structures.', 2),
          ('Meta Front-End Developer Specialization', 'Coursera / Meta', 'August 2024', 'COURSERA-META-7162', 'https://coursera.org', 'Web Development', 'Comprehensive training in modern React, JavaScript (ES6+), HTML5/CSS3, and responsive UI design.', 3);
      `);
      console.log('✓ Seeded 3 sample certifications!');
    } else {
      console.log('Certifications table already has entries.');
    }
  } catch (err) {
    console.error('Error seeding certifications:', err);
  } finally {
    await pool.end();
  }
}

seed();
