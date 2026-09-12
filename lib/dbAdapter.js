const { readData, writeData } = require('./localStore');

async function safeQuery(pool, text, params = []) {
  if (pool) {
    try {
      const res = await pool.query(text, params);
      return res;
    } catch (err) {
      console.warn('PostgreSQL query failed, using local store fallback:', err.message);
    }
  }
  return runLocalQuery(text, params);
}

function runLocalQuery(text, params) {
  const db = readData();
  const lower = text.trim().toLowerCase();

  // Site Config
  if (lower.includes('from site_config')) {
    if (lower.startsWith('update site_config')) {
      // Very basic update simulation if needed
      return { rows: [db.config], rowCount: 1 };
    }
    return { rows: [db.config], rowCount: 1 };
  }

  // Projects
  if (lower.includes('from projects')) {
    return { rows: db.projects, rowCount: db.projects.length };
  }

  // Skills
  if (lower.includes('from skills')) {
    return { rows: db.skills, rowCount: db.skills.length };
  }

  // Experience
  if (lower.includes('from experience')) {
    return { rows: db.experience, rowCount: db.experience.length };
  }

  // Achievements
  if (lower.includes('from achievements')) {
    return { rows: db.achievements, rowCount: db.achievements.length };
  }

  // Gallery
  if (lower.includes('from gallery')) {
    return { rows: db.gallery, rowCount: db.gallery.length };
  }

  // Testimonials
  if (lower.includes('from testimonials')) {
    return { rows: db.testimonials, rowCount: db.testimonials.length };
  }

  // Social Links
  if (lower.includes('from social_links')) {
    return { rows: db.social_links, rowCount: db.social_links.length };
  }

  // Recommendations
  if (lower.includes('from recommendations')) {
    return { rows: db.recommendations, rowCount: db.recommendations.length };
  }

  // FAQs
  if (lower.includes('from faqs')) {
    return { rows: db.faqs, rowCount: db.faqs.length };
  }

  // Certifications
  if (lower.includes('from certifications')) {
    return { rows: db.certifications, rowCount: db.certifications.length };
  }

  // Sections
  if (lower.includes('from sections')) {
    return { rows: db.sections, rowCount: db.sections.length };
  }

  return { rows: [], rowCount: 0 };
}

module.exports = { safeQuery };
