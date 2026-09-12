const router = require('express').Router();
const multer = require('multer');
const requireAuth = require('../lib/authMiddleware');
const { hashPassword, verifyPassword, isHashed } = require('../lib/auth');
const { uploadImage } = require('../lib/supabaseStorage');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ── Login ────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const { rows } = await req.app.locals.pool.query(
      'SELECT id, admin_password FROM site_config LIMIT 1'
    );
    const config = rows[0];

    if (!config || !verifyPassword(password, config.admin_password)) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Transparently upgrade a legacy plaintext password to a secure hash
    // the first time someone logs in successfully with it.
    if (!isHashed(config.admin_password)) {
      await req.app.locals.pool.query('UPDATE site_config SET admin_password=$1 WHERE id=$2', [
        hashPassword(password),
        config.id
      ]);
    }

    req.session.authenticated = true;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Logout ───────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ── Check auth status ────────────────────────────────────────────
router.get('/check', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

// All routes below require authentication
router.use(requireAuth);

// ══════════════════════════════════════════════════════════════════
//  SITE CONFIG
// ══════════════════════════════════════════════════════════════════
router.get('/config', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      `SELECT id, name, title, tagline, about_bio, about_photo_url, class_year,
              quote_text, quote_author, stat_years_involved, stat_clubs_joined
       FROM site_config LIMIT 1`
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    const {
      name, title, tagline, about_bio, about_photo_url, class_year,
      quote_text, quote_author, stat_years_involved, stat_clubs_joined
    } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE site_config SET name=$1, title=$2, tagline=$3, about_bio=$4, about_photo_url=$5,
       class_year=$6, quote_text=$7, quote_author=$8, stat_years_involved=$9, stat_clubs_joined=$10
       WHERE id=(SELECT id FROM site_config LIMIT 1) RETURNING *`,
      [name, title, tagline, about_bio, about_photo_url || '', class_year || '',
       quote_text || '', quote_author || '',
       parseInt(stat_years_involved, 10) || 0, parseInt(stat_clubs_joined, 10) || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  SETTINGS — password change, image uploads, database backup
// ══════════════════════════════════════════════════════════════════
router.put('/settings/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const { rows } = await req.app.locals.pool.query(
      'SELECT id, admin_password FROM site_config LIMIT 1'
    );
    const config = rows[0];
    if (!config || !verifyPassword(currentPassword, config.admin_password)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    await req.app.locals.pool.query('UPDATE site_config SET admin_password=$1 WHERE id=$2', [
      hashPassword(newPassword),
      config.id
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are allowed.' });
    }
    const url = await uploadImage(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const tables = ['site_config', 'projects', 'skills', 'experience', 'achievements', 'gallery', 'testimonials', 'social_links', 'contact_messages'];
    const backup = { exported_at: new Date().toISOString() };

    for (const table of tables) {
      const { rows } = await pool.query(`SELECT * FROM ${table}`);
      backup[table] = rows;
    }

    // Never include the password hash in an exported backup file.
    if (Array.isArray(backup.site_config)) {
      backup.site_config = backup.site_config.map(({ admin_password, ...rest }) => rest);
    }

    const filename = `portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  PROJECTS
// ══════════════════════════════════════════════════════════════════
router.get('/projects', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM projects ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects', async (req, res) => {
  try {
    const { title, description, image_url, link_url, start_date, end_date, is_current, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO projects (title, description, image_url, link_url, start_date, end_date, is_current, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, description, image_url || '', link_url || '', start_date || '', end_date || '', is_current || false, sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/projects/:id', async (req, res) => {
  try {
    const { title, description, image_url, link_url, start_date, end_date, is_current, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE projects SET title=$1, description=$2, image_url=$3, link_url=$4,
       start_date=$5, end_date=$6, is_current=$7, sort_order=$8 WHERE id=$9 RETURNING *`,
      [title, description, image_url || '', link_url || '', start_date || '', end_date || '', is_current || false, sort_order || 0, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/projects/:id/publish', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'UPDATE projects SET is_published=$1 WHERE id=$2 RETURNING *',
      [!!req.body.is_published, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  SKILLS
// ══════════════════════════════════════════════════════════════════
router.get('/skills', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM skills ORDER BY category ASC, sort_order ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/skills', async (req, res) => {
  try {
    const { name, category, proficiency, sort_order, skill_type } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO skills (name, category, proficiency, sort_order, skill_type)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, category || 'General', proficiency ?? 50, sort_order || 0, skill_type === 'strength' ? 'strength' : 'technical']
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/skills/:id', async (req, res) => {
  try {
    const { name, category, proficiency, sort_order, skill_type } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE skills SET name=$1, category=$2, proficiency=$3, sort_order=$4, skill_type=$5
       WHERE id=$6 RETURNING *`,
      [name, category || 'General', proficiency ?? 50, sort_order || 0, skill_type === 'strength' ? 'strength' : 'technical', req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/skills/:id/publish', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'UPDATE skills SET is_published=$1 WHERE id=$2 RETURNING *',
      [!!req.body.is_published, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/skills/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM skills WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  ACHIEVEMENTS / AWARDS
// ══════════════════════════════════════════════════════════════════
router.get('/achievements', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM achievements ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/achievements', async (req, res) => {
  try {
    const { title, issuer, description, category, date_earned, image_url, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO achievements (title, issuer, description, category, date_earned, image_url, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, issuer || '', description || '', category || 'award', date_earned || '', image_url || '', sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/achievements/:id', async (req, res) => {
  try {
    const { title, issuer, description, category, date_earned, image_url, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE achievements SET title=$1, issuer=$2, description=$3, category=$4,
       date_earned=$5, image_url=$6, sort_order=$7 WHERE id=$8 RETURNING *`,
      [title, issuer || '', description || '', category || 'award', date_earned || '', image_url || '', sort_order || 0, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/achievements/:id/publish', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'UPDATE achievements SET is_published=$1 WHERE id=$2 RETURNING *',
      [!!req.body.is_published, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/achievements/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM achievements WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  GALLERY / PHOTOS
// ══════════════════════════════════════════════════════════════════
router.get('/gallery', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM gallery ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/gallery', async (req, res) => {
  try {
    const { image_url, caption, category, sort_order } = req.body;
    if (!image_url) return res.status(400).json({ error: 'An image is required.' });
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO gallery (image_url, caption, category, sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [image_url, caption || '', category || 'event', sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/gallery/:id', async (req, res) => {
  try {
    const { image_url, caption, category, sort_order } = req.body;
    if (!image_url) return res.status(400).json({ error: 'An image is required.' });
    const { rows } = await req.app.locals.pool.query(
      `UPDATE gallery SET image_url=$1, caption=$2, category=$3, sort_order=$4 WHERE id=$5 RETURNING *`,
      [image_url, caption || '', category || 'event', sort_order || 0, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/gallery/:id/publish', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'UPDATE gallery SET is_published=$1 WHERE id=$2 RETURNING *',
      [!!req.body.is_published, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/gallery/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM gallery WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  TESTIMONIALS
// ══════════════════════════════════════════════════════════════════
router.get('/testimonials', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM testimonials ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/testimonials', async (req, res) => {
  try {
    const { quote, author_name, author_role, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO testimonials (quote, author_name, author_role, sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [quote, author_name, author_role || '', sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/testimonials/:id', async (req, res) => {
  try {
    const { quote, author_name, author_role, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE testimonials SET quote=$1, author_name=$2, author_role=$3, sort_order=$4
       WHERE id=$5 RETURNING *`,
      [quote, author_name, author_role || '', sort_order || 0, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/testimonials/:id/publish', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'UPDATE testimonials SET is_published=$1 WHERE id=$2 RETURNING *',
      [!!req.body.is_published, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/testimonials/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM testimonials WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  EXPERIENCE
// ══════════════════════════════════════════════════════════════════
router.get('/experience', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM experience ORDER BY sort_order ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/experience', async (req, res) => {
  try {
    const { job_title, company, description, start_date, end_date, is_current, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO experience (job_title, company, description, start_date, end_date, is_current, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [job_title, company, description, start_date || '', end_date || '', is_current || false, sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/experience/:id', async (req, res) => {
  try {
    const { job_title, company, description, start_date, end_date, is_current, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE experience SET job_title=$1, company=$2, description=$3,
       start_date=$4, end_date=$5, is_current=$6, sort_order=$7 WHERE id=$8 RETURNING *`,
      [job_title, company, description, start_date || '', end_date || '', is_current || false, sort_order || 0, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/experience/:id/publish', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'UPDATE experience SET is_published=$1 WHERE id=$2 RETURNING *',
      [!!req.body.is_published, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/experience/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM experience WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  SOCIAL LINKS
// ══════════════════════════════════════════════════════════════════
router.get('/social', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM social_links ORDER BY sort_order ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/social', async (req, res) => {
  try {
    const { platform, url, icon, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO social_links (platform, url, icon, sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [platform, url, icon || 'link', sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/social/:id', async (req, res) => {
  try {
    const { platform, url, icon, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE social_links SET platform=$1, url=$2, icon=$3, sort_order=$4
       WHERE id=$5 RETURNING *`,
      [platform, url, icon || 'link', sort_order || 0, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/social/:id/publish', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'UPDATE social_links SET is_published=$1 WHERE id=$2 RETURNING *',
      [!!req.body.is_published, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/social/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM social_links WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  CONTACT MESSAGES
// ══════════════════════════════════════════════════════════════════
router.get('/messages', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM contact_messages ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/messages/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM contact_messages WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
