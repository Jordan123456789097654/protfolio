const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const requireAuth = require('../lib/authMiddleware');
const { hashPassword, verifyPassword, isHashed } = require('../lib/auth');
const { uploadImage, listMedia, deleteMedia } = require('../lib/supabaseStorage');

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

// HTML page routing middleware — serve admin.html on browser navigation
router.get('*', (req, res, next) => {
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    return res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
  }
  next();
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

router.post('/messages/:id/reply', async (req, res) => {
  try {
    const { reply_subject, reply_text } = req.body;
    if (!reply_text) {
      return res.status(400).json({ error: 'Reply text is required.' });
    }

    const { rows: msgRows } = await req.app.locals.pool.query(
      'SELECT * FROM contact_messages WHERE id = $1 LIMIT 1',
      [req.params.id]
    );

    if (msgRows.length === 0) {
      return res.status(404).json({ error: 'Message not found.' });
    }

    const msg = msgRows[0];
    const { rows: configRows } = await req.app.locals.pool.query(
      'SELECT name, resend_api_key FROM site_config LIMIT 1'
    );
    const studentName = configRows[0]?.name || 'Jordan';
    const apiKey = configRows[0]?.resend_api_key || process.env.RESEND_API_KEY || '';

    const subject = reply_subject || `Re: Portfolio Contact Message from ${msg.name}`;

    let emailSent = false;
    let emailError = null;

    if (apiKey) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            from: `${studentName} <onboarding@resend.dev>`,
            to: [msg.email.trim()],
            subject: subject,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h2 style="color: #6c63ff; margin-top: 0;">Reply from ${studentName}</h2>
                <p>Hi ${msg.name},</p>
                <div style="background: #ffffff; padding: 18px; border-left: 4px solid #6c63ff; border-radius: 6px; margin: 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
                  ${reply_text.trim().replace(/\n/g, '<br>')}
                </div>
                <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 24px 0;">
                <p style="font-size: 12px; color: #64748b;"><strong>Original Message from you (${msg.email}):</strong></p>
                <blockquote style="margin: 0; padding: 10px 14px; background: #f1f5f9; border-radius: 6px; font-size: 13px; color: #475569;">${msg.message.replace(/\n/g, '<br>')}</blockquote>
              </div>
            `
          })
        });
        const resData = await emailRes.json();
        if (emailRes.ok) {
          emailSent = true;
        } else {
          emailError = resData.message || JSON.stringify(resData);
        }
      } catch (err) {
        emailError = err.message;
      }
    }

    await req.app.locals.pool.query(
      `UPDATE contact_messages SET status = 'replied', reply_text = $1, replied_at = NOW() WHERE id = $2`,
      [reply_text.trim(), req.params.id]
    );

    res.json({
      success: true,
      message: emailSent
        ? `Reply email sent successfully to ${msg.email}!`
        : `Reply saved in database! (Resend Note: ${emailError || 'Check API key'})`,
      emailSent,
      emailError
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  INTEGRATIONS SETTINGS (Discord Webhook & Kyro AI)
// ══════════════════════════════════════════════════════════════════
router.get('/settings/integrations', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT discord_webhook_url, kyro_api_key, resend_api_key, notification_email FROM site_config LIMIT 1'
    );
    res.json(rows[0] || {
      discord_webhook_url: 'https://discord.com/api/webhooks/1543661253698781335/P65nZ2XKxeWxDP4fiNUMLVRysGU0tt-iOFqihSd2rZUC16yTvTkqdp6DllFn4Q0nB5OB',
      kyro_api_key: 'kyro_sk_live_7H64A9P3jEmDr7RRiLOasMF7SjDSLYPB',
      resend_api_key: '',
      notification_email: 'jordan.lmmsfbla@outlook.com'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings/integrations', async (req, res) => {
  try {
    const { discord_webhook_url, kyro_api_key, resend_api_key, notification_email } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE site_config SET discord_webhook_url=$1, kyro_api_key=$2, resend_api_key=$3, notification_email=$4
       WHERE id=(SELECT id FROM site_config LIMIT 1) RETURNING discord_webhook_url, kyro_api_key, resend_api_key, notification_email`,
      [discord_webhook_url || '', kyro_api_key || '', resend_api_key || '', notification_email || '']
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES & SUBJECTS SETTINGS
// ══════════════════════════════════════════════════════════════════
const DEFAULT_CONTACT_TEMPLATE = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
  <h2 style="color: #6c63ff; margin-top: 0;">📬 New Portfolio Contact Message</h2>
  <p><strong>From:</strong> {{name}} (<a href="mailto:{{email}}" style="color: #6c63ff;">{{email}}</a>)</p>
  <p><strong>Date:</strong> {{date}}</p>
  <p><strong>Message:</strong></p>
  <blockquote style="background: #ffffff; padding: 16px; border-left: 4px solid #6c63ff; border-radius: 6px; margin: 15px 0; color: #334155; line-height: 1.6;">{{message}}</blockquote>
  <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;">
  <p style="font-size: 12px; color: #94a3b8; text-align: center;">Sent from {{student_name}}'s Portfolio System ({{site_title}})</p>
</div>`;

const DEFAULT_REPLY_TEMPLATE = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
  <h2 style="color: #6c63ff; margin-top: 0;">Reply from {{student_name}}</h2>
  <p>Hi {{name}},</p>
  <div style="background: #ffffff; padding: 18px; border-left: 4px solid #6c63ff; border-radius: 6px; margin: 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
    {{reply_text}}
  </div>
  <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 24px 0;">
  <p style="font-size: 12px; color: #64748b;"><strong>Original Message from you ({{email}}) on {{date}}:</strong></p>
  <blockquote style="margin: 0; padding: 10px 14px; background: #f1f5f9; border-radius: 6px; font-size: 13px; color: #475569;">{{original_message}}</blockquote>
</div>`;

const DEFAULT_REC_TEMPLATE = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
  <h2 style="color: #6c63ff; margin-top: 0;">Recommendation Request from {{student_name}}</h2>
  <p>Dear {{teacher_name}},</p>
  <p>I hope this message finds you well! I am putting together my academic & activity portfolio and would be deeply honored if you could write a brief letter or endorsement for me regarding <strong>{{course_or_context}}</strong>.</p>
  <p>I have set up a secure, easy-to-use form where you can paste a short quote excerpt and optionally upload a PDF copy of your recommendation letter.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{form_url}}" style="background: linear-gradient(135deg, #6c63ff, #00d4ff); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 14px rgba(108, 99, 255, 0.4);">Submit Recommendation for {{student_name}}</a>
  </div>
  <p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your browser: <br><a href="{{form_url}}" style="color: #6c63ff;">{{form_url}}</a></p>
  <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 24px 0;">
  <p style="font-size: 12px; color: #94a3b8; text-align: center;">Sent via {{student_name}}'s Portfolio System</p>
</div>`;

router.get('/settings/email-templates', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      `SELECT contact_email_subject, contact_email_template, 
              reply_email_subject, reply_email_template, 
              recommendation_email_subject, recommendation_email_template 
       FROM site_config LIMIT 1`
    );
    const cfg = rows[0] || {};
    res.json({
      contact_email_subject: cfg.contact_email_subject || '📬 New Portfolio Message from {{name}}',
      contact_email_template: cfg.contact_email_template || DEFAULT_CONTACT_TEMPLATE,
      reply_email_subject: cfg.reply_email_subject || 'Re: Portfolio Contact Message from {{name}}',
      reply_email_template: cfg.reply_email_template || DEFAULT_REPLY_TEMPLATE,
      recommendation_email_subject: cfg.recommendation_email_subject || 'Letter of Recommendation Request for {{student_name}}',
      recommendation_email_template: cfg.recommendation_email_template || DEFAULT_REC_TEMPLATE
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings/email-templates', async (req, res) => {
  try {
    const {
      contact_email_subject,
      contact_email_template,
      reply_email_subject,
      reply_email_template,
      recommendation_email_subject,
      recommendation_email_template
    } = req.body;

    const { rows } = await req.app.locals.pool.query(
      `UPDATE site_config SET 
         contact_email_subject = $1,
         contact_email_template = $2,
         reply_email_subject = $3,
         reply_email_template = $4,
         recommendation_email_subject = $5,
         recommendation_email_template = $6
       WHERE id = (SELECT id FROM site_config LIMIT 1)
       RETURNING contact_email_subject, contact_email_template, reply_email_subject, reply_email_template, recommendation_email_subject, recommendation_email_template`,
      [
        contact_email_subject || '📬 New Portfolio Message from {{name}}',
        contact_email_template || '',
        reply_email_subject || 'Re: Portfolio Contact Message from {{name}}',
        reply_email_template || '',
        recommendation_email_subject || 'Letter of Recommendation Request for {{student_name}}',
        recommendation_email_template || ''
      ]
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  SECTIONS MANAGER (Order & Visibility)
// ══════════════════════════════════════════════════════════════════
router.get('/sections', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM sections ORDER BY sort_order ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/sections/reorder', async (req, res) => {
  try {
    const { sections } = req.body;
    if (!Array.isArray(sections)) {
      return res.status(400).json({ error: 'sections array is required.' });
    }
    const pool = req.app.locals.pool;
    for (const sec of sections) {
      await pool.query(
        `UPDATE sections SET sort_order=$1, is_visible=$2, title=$3 WHERE section_id=$4`,
        [parseInt(sec.sort_order, 10) || 0, !!sec.is_visible, sec.title || sec.section_id, sec.section_id]
      );
    }
    const { rows } = await pool.query('SELECT * FROM sections ORDER BY sort_order ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  KYRO AI STUDIO PROXY
// ══════════════════════════════════════════════════════════════════
function cleanAIOutput(text) {
  if (!text) return '';
  let cleaned = String(text);

  // 1. Strip explicit <think>...</think> reasoning blocks
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 2. Strip unclosed <think> blocks if response truncated
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, '');

  // 3. Strip "Here's a thinking process:" or "Here is a thinking process:" preamble blocks
  cleaned = cleaned.replace(/^(Here'?s?\s+a?\s*thinking\s+process[\s\S]*?\n\n|\*\*Here'?s?\s+a?\s*thinking\s+process[\s\S]*?\n\n)/gi, '');
  cleaned = cleaned.replace(/^(Thinking\s+process:[\s\S]*?\n\n)/gi, '');

  // 4. Strip markdown code fences if wrapping the output (e.g. ```html ... ``` or ``` ...)
  cleaned = cleaned.replace(/^```[a-z]*\n?/gi, '').replace(/\n?```$/gi, '');

  return cleaned.trim();
}

router.post('/ai/generate', async (req, res) => {
  try {
    const { prompt, systemPrompt, model } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const { rows } = await req.app.locals.pool.query('SELECT kyro_api_key FROM site_config LIMIT 1');
    const apiKey = rows[0]?.kyro_api_key || process.env.KYRO_API_KEY || 'kyro_sk_live_7H64A9P3jEmDr7RRiLOasMF7SjDSLYPB';
    const baseUrl = 'https://kyro-api-auou.onrender.com/v1';

    const aiRes = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'kyro-coder-pro',
        messages: [
          {
            role: 'system',
            content: (systemPrompt || 'You are an elite portfolio copywriter, resume strategist, and software developer copilot.') + ' ABSOLUTELY DO NOT output any thinking steps, mental notes, reasoning logs, "Here is a thinking process", or <think> tags. Start your response IMMEDIATELY with the final requested content.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      return res.status(aiRes.status).json({ error: `Kyro AI API error (${aiRes.status}): ${errText || aiRes.statusText}` });
    }

    const data = await aiRes.json();
    const rawText = data?.choices?.[0]?.message?.content || 'No response generated.';
    const outputText = cleanAIOutput(rawText);
    res.json({ success: true, text: outputText, model: data.model || model });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics Overview ──────────────────────────────────────────
router.get('/analytics', async (req, res) => {
  try {
    const pool = req.app.locals.pool;
    const viewsRes = await pool.query("SELECT COUNT(*) FROM analytics_events WHERE event_type='page_view'");
    const clicksRes = await pool.query("SELECT COUNT(*) FROM analytics_events WHERE event_type='project_click'");
    const downloadsRes = await pool.query("SELECT COUNT(*) FROM analytics_events WHERE event_type='resume_download'");
    const msgsRes = await pool.query("SELECT COUNT(*) FROM contact_messages");
    const recsRes = await pool.query("SELECT COUNT(*) FROM recommendation_requests");

    res.json({
      total_page_views: parseInt(viewsRes.rows[0]?.count || 0, 10),
      total_project_clicks: parseInt(clicksRes.rows[0]?.count || 0, 10),
      total_resume_downloads: parseInt(downloadsRes.rows[0]?.count || 0, 10),
      total_messages: parseInt(msgsRes.rows[0]?.count || 0, 10),
      total_recommendation_requests: parseInt(recsRes.rows[0]?.count || 0, 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Email Templates Settings ────────────────────────────────────
router.get('/settings/email-templates', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      `SELECT contact_email_subject, contact_email_template, recommendation_email_subject, recommendation_email_template FROM site_config LIMIT 1`
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings/email-templates', async (req, res) => {
  try {
    const { contact_email_subject, contact_email_template, recommendation_email_subject, recommendation_email_template } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE site_config SET contact_email_subject=$1, contact_email_template=$2, recommendation_email_subject=$3, recommendation_email_template=$4
       WHERE id=(SELECT id FROM site_config LIMIT 1) RETURNING contact_email_subject, contact_email_template, recommendation_email_subject, recommendation_email_template`,
      [contact_email_subject || '', contact_email_template || '', recommendation_email_subject || '', recommendation_email_template || '']
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  MEDIA GALLERY MANAGEMENT
// ══════════════════════════════════════════════════════════════════
router.get('/media', async (req, res) => {
  try {
    const mediaFiles = await listMedia();
    res.json(mediaFiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/media/:filename', async (req, res) => {
  try {
    const success = await deleteMedia(req.params.filename);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  RECOMMENDATIONS & LETTERS
// ══════════════════════════════════════════════════════════════════
router.get('/recommendations', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM recommendations ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/recommendations', async (req, res) => {
  try {
    const { recommender_name, recommender_title, school_or_org, quote_excerpt, letter_pdf_url, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO recommendations (recommender_name, recommender_title, school_or_org, quote_excerpt, letter_pdf_url, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [recommender_name, recommender_title || '', school_or_org || '', quote_excerpt, letter_pdf_url || '', sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/recommendations/:id', async (req, res) => {
  try {
    const { recommender_name, recommender_title, school_or_org, quote_excerpt, letter_pdf_url, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE recommendations SET recommender_name=$1, recommender_title=$2, school_or_org=$3, quote_excerpt=$4, letter_pdf_url=$5, sort_order=$6
       WHERE id=$7 RETURNING *`,
      [recommender_name, recommender_title || '', school_or_org || '', quote_excerpt, letter_pdf_url || '', sort_order || 0, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/recommendations/:id/publish', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'UPDATE recommendations SET is_published=$1 WHERE id=$2 RETURNING *',
      [!!req.body.is_published, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/recommendations/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM recommendations WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/recommendations/requests', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM recommendation_requests ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/recommendations/request', async (req, res) => {
  try {
    const { teacher_name, teacher_email, course_or_context } = req.body;
    if (!teacher_name || !teacher_email) {
      return res.status(400).json({ error: 'Teacher name and email are required.' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO recommendation_requests (teacher_name, teacher_email, course_or_context, token, status)
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [teacher_name.trim(), teacher_email.trim(), course_or_context || '', token]
    );

    const { rows: configRows } = await req.app.locals.pool.query(
      'SELECT name, resend_api_key FROM site_config LIMIT 1'
    );
    const studentName = configRows[0]?.name || 'Jordan';
    const apiKey = configRows[0]?.resend_api_key || process.env.RESEND_API_KEY || '';
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';
    const formUrl = `${protocol}://${host}/recommend-teacher.html?token=${token}`;

    let emailSent = false;
    let emailError = null;

    if (apiKey) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            from: `${studentName} via Portfolio <onboarding@resend.dev>`,
            to: [teacher_email.trim()],
            subject: `Letter of Recommendation Request for ${studentName}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1e293b; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h2 style="color: #6c63ff; margin-top: 0;">Recommendation Request from ${studentName}</h2>
                <p>Dear ${teacher_name.trim()},</p>
                <p>I hope this message finds you well! I am putting together my academic & activity portfolio and would be deeply honored if you could write a brief letter or endorsement for me${course_or_context ? ` regarding <strong>${course_or_context}</strong>` : ''}.</p>
                <p>I have set up a secure, easy-to-use form where you can paste a short quote excerpt and optionally upload a PDF copy of your recommendation letter.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${formUrl}" style="background: linear-gradient(135deg, #6c63ff, #00d4ff); color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 14px rgba(108, 99, 255, 0.4);">Submit Recommendation for ${studentName}</a>
                </div>
                <p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your browser: <br><a href="${formUrl}" style="color: #6c63ff;">${formUrl}</a></p>
                <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 24px 0;">
                <p style="font-size: 12px; color: #94a3b8; text-align: center;">Sent via ${studentName}'s Portfolio System</p>
              </div>
            `
          })
        });
        const resData = await emailRes.json();
        if (emailRes.ok) {
          emailSent = true;
        } else {
          emailError = resData.message || JSON.stringify(resData);
        }
      } catch (err) {
        emailError = err.message;
      }
    }

    res.json({
      success: true,
      message: emailSent ? `Recommendation request email sent to ${teacher_email}!` : 'Request created, but email could not be sent automatically. You can copy the link below.',
      request: rows[0],
      formUrl,
      emailSent,
      emailError
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  FAQ (FREQUENTLY ASKED QUESTIONS)
// ══════════════════════════════════════════════════════════════════
router.get('/faqs', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM faqs ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/faqs', async (req, res) => {
  try {
    const { question, answer, category, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO faqs (question, answer, category, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [question, answer, category || 'General', sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/faqs/:id', async (req, res) => {
  try {
    const { question, answer, category, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE faqs SET question=$1, answer=$2, category=$3, sort_order=$4
       WHERE id=$5 RETURNING *`,
      [question, answer, category || 'General', sort_order || 0, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/faqs/:id/publish', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'UPDATE faqs SET is_published=$1 WHERE id=$2 RETURNING *',
      [!!req.body.is_published, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/faqs/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM faqs WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  CERTIFICATIONS & BADGES SHELF
// ══════════════════════════════════════════════════════════════════
router.get('/certifications', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM certifications ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/certifications', async (req, res) => {
  try {
    const { title, issuer, issue_date, credential_id, credential_url, badge_image_url, category, description, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO certifications (title, issuer, issue_date, credential_id, credential_url, badge_image_url, category, description, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [title, issuer, issue_date || '', credential_id || '', credential_url || '', badge_image_url || '', category || 'Certification', description || '', sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/certifications/:id', async (req, res) => {
  try {
    const { title, issuer, issue_date, credential_id, credential_url, badge_image_url, category, description, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE certifications SET title=$1, issuer=$2, issue_date=$3, credential_id=$4, credential_url=$5, badge_image_url=$6, category=$7, description=$8, sort_order=$9
       WHERE id=$10 RETURNING *`,
      [title, issuer, issue_date || '', credential_id || '', credential_url || '', badge_image_url || '', category || 'Certification', description || '', sort_order || 0, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/certifications/:id/publish', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'UPDATE certifications SET is_published=$1 WHERE id=$2 RETURNING *',
      [!!req.body.is_published, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/certifications/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM certifications WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


