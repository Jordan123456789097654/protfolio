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

const { safeQuery } = require('../lib/dbAdapter');
const { sendEmail } = require('../lib/email');

// ── Login ────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const { rows } = await safeQuery(req.app.locals.pool, 'SELECT id, admin_password FROM site_config LIMIT 1');
    const config = rows[0] || { id: 1, admin_password: 'SERVICE' };

    if (!config || !verifyPassword(password, config.admin_password)) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    if (req.app.locals.pool && !isHashed(config.admin_password)) {
      await safeQuery(req.app.locals.pool, 'UPDATE site_config SET admin_password=$1 WHERE id=$2', [
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

    const emailHtml = `
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
    `;

    const emailResult = await sendEmail({
      to: msg.email.trim(),
      subject: subject,
      html: emailHtml
    });

    await req.app.locals.pool.query(
      `UPDATE contact_messages SET status = 'replied', reply_text = $1, replied_at = NOW() WHERE id = $2`,
      [reply_text.trim(), req.params.id]
    );

    const emailSent = emailResult.success;
    const emailError = emailResult.error || null;

    res.json({
      success: true,
      message: emailSent
        ? `Reply email sent successfully to ${msg.email}!`
        : `Reply saved in database! (${emailError || 'Check email configuration'})`,
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
      `SELECT contact_email_subject, contact_email_template, reply_email_subject, reply_email_template, recommendation_email_subject, recommendation_email_template, recommendation_teacher_email_subject, recommendation_teacher_email_template, recommendation_mentor_email_subject, recommendation_mentor_email_template FROM site_config LIMIT 1`
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings/email-templates', async (req, res) => {
  try {
    const { 
      contact_email_subject, contact_email_template, 
      reply_email_subject, reply_email_template, 
      recommendation_teacher_email_subject, recommendation_teacher_email_template, 
      recommendation_mentor_email_subject, recommendation_mentor_email_template 
    } = req.body;

    const { rows } = await req.app.locals.pool.query(
      `UPDATE site_config SET 
        contact_email_subject=$1, contact_email_template=$2, 
        reply_email_subject=$3, reply_email_template=$4, 
        recommendation_teacher_email_subject=$5, recommendation_teacher_email_template=$6, 
        recommendation_mentor_email_subject=$7, recommendation_mentor_email_template=$8
       WHERE id=(SELECT id FROM site_config LIMIT 1) RETURNING *`,
      [
        contact_email_subject || '', contact_email_template || '',
        reply_email_subject || '', reply_email_template || '',
        recommendation_teacher_email_subject || '', recommendation_teacher_email_template || '',
        recommendation_mentor_email_subject || '', recommendation_mentor_email_template || ''
      ]
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
    const { teacher_name, teacher_email, course_or_context, recipient_type } = req.body;
    if (!teacher_name || !teacher_email) {
      return res.status(400).json({ error: 'Recommender name and email are required.' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO recommendation_requests (teacher_name, teacher_email, course_or_context, recipient_type, token, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [teacher_name.trim(), teacher_email.trim(), course_or_context || '', recipient_type || 'teacher', token]
    );

    const { rows: configRows } = await req.app.locals.pool.query(
      'SELECT name, resend_api_key, recommendation_teacher_email_subject, recommendation_teacher_email_template, recommendation_mentor_email_subject, recommendation_mentor_email_template FROM site_config LIMIT 1'
    );
    const config = configRows[0] || {};
    const studentName = config.name || 'Jordan';
    const apiKey = config.resend_api_key || process.env.RESEND_API_KEY || '';
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol || 'http';
    const formUrl = `${protocol}://${host}/recommend-teacher.html?token=${token}`;

    const isMentor = recipient_type === 'mentor';
    
    // Choose custom template or fallback
    let subject = isMentor 
      ? (config.recommendation_mentor_email_subject || `Mentor & Advisor Endorsement Request for ${studentName}`)
      : (config.recommendation_teacher_email_subject || `Academic Recommendation Request for ${studentName}`);
    
    subject = subject.replace(/\{\{student_name\}\}/g, studentName).replace(/\{\{teacher_name\}\}/g, teacher_name.trim());

    let htmlBody = isMentor ? config.recommendation_mentor_email_template : config.recommendation_teacher_email_template;

    if (htmlBody && htmlBody.trim()) {
      htmlBody = htmlBody
        .replace(/\{\{teacher_name\}\}/g, teacher_name.trim())
        .replace(/\{\{student_name\}\}/g, studentName)
        .replace(/\{\{course_or_context\}\}/g, course_or_context || 'Mentorship / Guidance')
        .replace(/\{\{form_url\}\}/g, formUrl)
        .replace(/\{\{site_title\}\}/g, `${studentName}'s Portfolio`);
    } else {
      // Default high-end templates
      if (isMentor) {
        htmlBody = `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body style="margin: 0; padding: 0; background-color: #090d16; font-family: 'Segoe UI', Arial, sans-serif; color: #e2e8f0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #090d16; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #131b2e; border-radius: 16px; border: 1px solid rgba(46, 213, 115, 0.25); overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
                    <tr>
                      <td style="background: linear-gradient(135deg, #10b981 0%, #00d4ff 100%); padding: 32px 30px; text-align: center;">
                        <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">🌿 Mentor & Advisor Endorsement</h1>
                        <p style="color: rgba(255,255,255,0.92); font-size: 14px; margin: 6px 0 0 0;">Personal Guidance & Growth Request from ${studentName}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 32px 30px;">
                        <p style="font-size: 16px; color: #ffffff; font-weight: 600; margin-top: 0;">Hello ${teacher_name.trim()},</p>
                        <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">I hope you're having a great week! Your mentorship, guidance, and support have been immensely valuable to my personal development and career trajectory.</p>
                        <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">As I build out my official portfolio, I would be deeply honored if you could share a short endorsement, key takeaway, or recommendation quote regarding our work together.</p>
                        ${course_or_context ? `
                        <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; padding: 14px 18px; margin: 20px 0;">
                          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #10b981; letter-spacing: 1px; display: block; margin-bottom: 4px;">Focus Area / Mentorship Context</span>
                          <span style="font-size: 14px; color: #ffffff; font-weight: 600;">${course_or_context}</span>
                        </div>
                        ` : ''}
                        <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">You can submit a 1-minute quote or optional document using this dedicated portal:</p>
                        <div style="text-align: center; margin: 32px 0 20px 0;">
                          <a href="${formUrl}" style="background: linear-gradient(135deg, #10b981, #00d4ff); color: #ffffff; text-decoration: none; padding: 15px 32px; border-radius: 99px; font-size: 15px; font-weight: 700; display: inline-block; box-shadow: 0 8px 25px rgba(16, 185, 129, 0.4);">Open Mentor Portal ↗</a>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background: #0b111e; padding: 20px 30px; text-align: center; border-top: 1px solid rgba(255,255,255,0.06);">
                        <p style="font-size: 12px; color: #64748b; margin: 0;">Sent with gratitude via ${studentName}'s Interactive Portfolio</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;
      } else {
        htmlBody = `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: 'Segoe UI', Arial, sans-serif; color: #e2e8f0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0b0f19; padding: 40px 10px;">
              <tr>
                <td align="center">
                  <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background: #141b2d; border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                    <tr>
                      <td style="background: linear-gradient(135deg, #6c63ff 0%, #00d4ff 100%); padding: 32px 30px; text-align: center;">
                        <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">👨‍🏫 Academic Recommendation Request</h1>
                        <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 6px 0 0 0;">From ${studentName}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 32px 30px;">
                        <p style="font-size: 16px; color: #ffffff; font-weight: 600; margin-top: 0;">Hello ${teacher_name.trim()},</p>
                        <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">I hope you are having a wonderful week! As I prepare my academic & activity portfolio, I would be truly grateful for a brief recommendation endorsement or letter from you.</p>
                        ${course_or_context ? `
                        <div style="background: rgba(108, 99, 255, 0.12); border: 1px solid rgba(108, 99, 255, 0.3); border-radius: 10px; padding: 14px 18px; margin: 20px 0;">
                          <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #00d4ff; letter-spacing: 1px; display: block; margin-bottom: 4px;">Subject / Academic Context</span>
                          <span style="font-size: 14px; color: #ffffff; font-weight: 600;">${course_or_context}</span>
                        </div>
                        ` : ''}
                        <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">I have set up a quick 1-minute form where you can type a short endorsement excerpt, and optionally attach a PDF letter if you have one.</p>
                        <div style="text-align: center; margin: 32px 0 20px 0;">
                          <a href="${formUrl}" style="background: linear-gradient(135deg, #6c63ff, #00d4ff); color: #ffffff; text-decoration: none; padding: 15px 32px; border-radius: 99px; font-size: 15px; font-weight: 700; display: inline-block; box-shadow: 0 8px 25px rgba(108, 99, 255, 0.4);">Open Recommendation Form ↗</a>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background: #0f1523; padding: 20px 30px; text-align: center; border-top: 1px solid rgba(255,255,255,0.06);">
                        <p style="font-size: 12px; color: #64748b; margin: 0;">Sent via ${studentName}'s Interactive Portfolio System</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `;
      }
    }

    // Append 1x1 transparent email read receipt tracking pixel
    const trackingPixelUrl = `${protocol}://${host}/api/recommendations/track/open/${token}`;
    htmlBody += `<img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display:none !important; width:1px; height:1px; opacity:0; visibility:hidden;" />`;


    let emailSent = false;
    let emailError = null;

    const emailResult = await sendEmail({
      to: teacher_email.trim(),
      subject: subject,
      html: htmlBody
    });


    if (emailResult.success) {
      emailSent = true;
    } else {
      emailError = emailResult.error;
    }

    let msg = `Recommendation request created for ${teacher_name}!`;
    if (emailSent) {
      msg = `✅ Request email sent to ${teacher_email}!`;
    } else if (emailError) {
      msg = `⚠️ Request saved, but email could not be delivered directly: ${emailError}`;
    }

    res.json({
      success: true,
      message: msg,
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
    const { title, issuer, issue_date, expiration_date, is_expired, credential_id, credential_url, badge_image_url, category, description, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO certifications (title, issuer, issue_date, expiration_date, is_expired, credential_id, credential_url, badge_image_url, category, description, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [title, issuer, issue_date || '', expiration_date || '', !!is_expired, credential_id || '', credential_url || '', badge_image_url || '', category || 'Certification', description || '', sort_order || 0]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/certifications/:id', async (req, res) => {
  try {
    const { title, issuer, issue_date, expiration_date, is_expired, credential_id, credential_url, badge_image_url, category, description, sort_order } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE certifications SET title=$1, issuer=$2, issue_date=$3, expiration_date=$4, is_expired=$5, credential_id=$6, credential_url=$7, badge_image_url=$8, category=$9, description=$10, sort_order=$11
       WHERE id=$12 RETURNING *`,
      [title, issuer, issue_date || '', expiration_date || '', !!is_expired, credential_id || '', credential_url || '', badge_image_url || '', category || 'Certification', description || '', sort_order || 0, req.params.id]
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

// ══════════════════════════════════════════════════════════════════
//  COUNTDOWN TIMER & SEASONAL THEME SETTINGS
// ══════════════════════════════════════════════════════════════════
router.put('/countdown', async (req, res) => {
  try {
    const { countdown_title, countdown_target_date, countdown_enabled } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE site_config SET countdown_title=$1, countdown_target_date=$2, countdown_enabled=$3
       WHERE id=(SELECT id FROM site_config LIMIT 1) 
       RETURNING countdown_title, countdown_target_date, countdown_enabled`,
      [countdown_title || 'FBLA State Leadership Conference', countdown_target_date || new Date().toISOString(), !!countdown_enabled]
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/theme/seasonal', async (req, res) => {
  try {
    const { seasonal_theme } = req.body; // 'auto', 'halloween', 'winter', 'spring', 'summer', 'standard'
    const { rows } = await req.app.locals.pool.query(
      `UPDATE site_config SET seasonal_theme=$1 WHERE id=(SELECT id FROM site_config LIMIT 1) RETURNING seasonal_theme`,
      [seasonal_theme || 'auto']
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET & PUT Integrations Settings ─────────────────────────────────
router.get('/settings/integrations', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      `SELECT discord_webhook_url, kyro_api_key, resend_api_key, notification_email,
              twilio_account_sid, twilio_auth_token, twilio_phone_number, admin_phone_number, twilio_sms_enabled
       FROM site_config LIMIT 1`
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings/integrations', async (req, res) => {
  try {
    const {
      discord_webhook_url, kyro_api_key, resend_api_key, notification_email,
      twilio_account_sid, twilio_auth_token, twilio_phone_number, admin_phone_number, twilio_sms_enabled
    } = req.body;

    const { rows } = await req.app.locals.pool.query(
      `UPDATE site_config SET
        discord_webhook_url=$1, kyro_api_key=$2, resend_api_key=$3, notification_email=$4,
        twilio_account_sid=$5, twilio_auth_token=$6, twilio_phone_number=$7, admin_phone_number=$8, twilio_sms_enabled=$9
       WHERE id=(SELECT id FROM site_config LIMIT 1)
       RETURNING *`,
      [
        discord_webhook_url || '', kyro_api_key || '', resend_api_key || '', notification_email || '',
        twilio_account_sid || '', twilio_auth_token || '', twilio_phone_number || '', admin_phone_number || '', !!twilio_sms_enabled
      ]
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  MEETING SCHEDULER & BUSY SCHEDULE MANAGER
// ══════════════════════════════════════════════════════════════════
router.get('/meetings/settings', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT meeting_enabled, meeting_locations, meeting_start_time, meeting_end_time, meeting_notice_days FROM site_config LIMIT 1'
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/meetings/settings', async (req, res) => {
  try {
    const { meeting_enabled, meeting_locations, meeting_start_time, meeting_end_time, meeting_notice_days } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE site_config SET 
        meeting_enabled=$1, 
        meeting_locations=$2, 
        meeting_start_time=$3, 
        meeting_end_time=$4, 
        meeting_notice_days=$5 
       WHERE id=(SELECT id FROM site_config LIMIT 1) 
       RETURNING meeting_enabled, meeting_locations, meeting_start_time, meeting_end_time, meeting_notice_days`,
      [!!meeting_enabled, meeting_locations || '', meeting_start_time || '09:00', meeting_end_time || '17:00', parseInt(meeting_notice_days || 0, 10)]
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/meetings', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM meetings ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/meetings/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const { sendEmail } = require('../lib/email');

    let query = 'UPDATE meetings SET status=COALESCE($1, status)';
    const params = [status];

    if (notes !== undefined) {
      query += ', notes=$2 WHERE id=$3 RETURNING *';
      params.push(notes, req.params.id);
    } else {
      query += ' WHERE id=$2 RETURNING *';
      params.push(req.params.id);
    }

    const { rows } = await req.app.locals.pool.query(query, params);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const meeting = rows[0];

    // Trigger guest email notification on status update
    if (meeting.email && (status === 'confirmed' || status === 'cancelled' || status === 'declined')) {
      const hour = parseInt(meeting.time_slot.split(':')[0], 10);
      const timeDisplay = isNaN(hour) ? meeting.time_slot : new Date(2000, 0, 1, hour, 0).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const protocol = req.protocol || 'https';
      const host = req.get('host') || 'localhost:3000';
      const cancelUrl = `${protocol}://${host}/api/meetings/cancel/${meeting.cancel_token}`;

      if (status === 'confirmed') {
        const { rows: configRows } = await req.app.locals.pool.query('SELECT name, meeting_email_template FROM site_config LIMIT 1');
        const config = configRows[0] || {};
        const studentName = config.name || 'Jordan';

        let guestHtml = config.meeting_email_template;
        if (guestHtml && guestHtml.trim()) {
          guestHtml = guestHtml
            .replace(/\{\{name\}\}/g, meeting.name)
            .replace(/\{\{student_name\}\}/g, studentName)
            .replace(/\{\{meeting_date\}\}/g, meeting.meeting_date)
            .replace(/\{\{time_slot\}\}/g, `${timeDisplay} (${meeting.guest_timezone || 'EST'})`)
            .replace(/\{\{location\}\}/g, meeting.location_type || 'IRL Meeting')
            .replace(/\{\{topic\}\}/g, meeting.topic)
            .replace(/\{\{cancel_url\}\}/g, cancelUrl);
        } else {
          guestHtml = `
            <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#101726;color:#e2e8f0;padding:24px;border-radius:12px;">
              <h2 style="color:#22c55e;margin-top:0;">✓ Meeting Confirmed!</h2>
              <p>Hi <strong>${meeting.name}</strong>,</p>
              <p>Your meeting request has been officially accepted and scheduled!</p>
              <div style="background:#1a2336;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #2d3748;">
                <p style="margin:4px 0;"><strong>Date:</strong> ${meeting.meeting_date}</p>
                <p style="margin:4px 0;"><strong>Time:</strong> ${timeDisplay} (${meeting.guest_timezone || 'EST'})</p>
                <p style="margin:4px 0;"><strong>Location:</strong> 📍 ${meeting.location_type || 'IRL Meeting'}</p>
                <p style="margin:4px 0;"><strong>Topic:</strong> ${meeting.topic}</p>
              </div>
              <p style="font-size:0.9rem;color:#cbd5e1;">Need to cancel or reschedule? Click below:</p>
              <p><a href="${cancelUrl}" style="display:inline-block;padding:8px 16px;background:#ef4444;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:0.85rem;">Cancel / Reschedule Meeting</a></p>
            </div>
          `;
        }

        sendEmail({
          to: meeting.email,
          subject: `✓ Meeting Confirmed: ${meeting.meeting_date} @ ${timeDisplay}`,
          html: guestHtml
        }).catch(e => console.error('Admin update guest email error:', e.message));
      } else if (status === 'cancelled' || status === 'declined') {
        sendEmail({
          to: meeting.email,
          subject: `✕ Meeting Update: ${meeting.meeting_date} @ ${timeDisplay}`,
          html: `
            <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#101726;color:#e2e8f0;padding:24px;border-radius:12px;">
              <h2 style="color:#ef4444;margin-top:0;">✕ Meeting Status Update</h2>
              <p>Hi <strong>${meeting.name}</strong>,</p>
              <p>The meeting requested for <strong>${meeting.meeting_date} at ${timeDisplay}</strong> has been ${status}.</p>
            </div>
          `
        }).catch(e => console.error('Admin update guest cancel email error:', e.message));
      }
    }

    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/meetings/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM meetings WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/busy-schedules', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM busy_schedules ORDER BY id ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/busy-schedules', async (req, res) => {
  try {
    const { title, day_of_week, start_time, end_time, description } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO busy_schedules (title, day_of_week, start_time, end_time, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, day_of_week, start_time, end_time, description || '']
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/busy-schedules/:id', async (req, res) => {
  try {
    const { title, day_of_week, start_time, end_time, description } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE busy_schedules SET title=$1, day_of_week=$2, start_time=$3, end_time=$4, description=$5
       WHERE id=$6 RETURNING *`,
      [title.trim(), day_of_week, start_time, end_time, description || '', req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/busy-schedules/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM busy_schedules WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
//  SCHOOL & PUBLIC CALENDAR EVENTS MANAGER
// ══════════════════════════════════════════════════════════════════
router.get('/events', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM school_events ORDER BY event_date ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/events', async (req, res) => {
  try {
    const { title, event_date, end_date, start_time, end_time, location, category, description, status, host_info, is_recurring, recurrence_rule, is_published } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `INSERT INTO school_events (title, event_date, end_date, start_time, end_time, location, category, description, status, host_info, is_recurring, recurrence_rule, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [title ? title.trim() : 'New Event', event_date || 'Recurring', end_date || '', start_time || '', end_time || '', location || '', category || 'School Event', description || '', status || 'Confirmed', host_info || '', !!is_recurring, recurrence_rule || 'none', is_published !== false]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/events/:id', async (req, res) => {
  try {
    const { title, event_date, end_date, start_time, end_time, location, category, description, status, host_info, is_recurring, recurrence_rule, is_published } = req.body;
    const { rows } = await req.app.locals.pool.query(
      `UPDATE school_events SET title=$1, event_date=$2, end_date=$3, start_time=$4, end_time=$5, location=$6, category=$7, description=$8, status=$9, host_info=$10, is_recurring=$11, recurrence_rule=$12, is_published=$13
       WHERE id=$14 RETURNING *`,
      [title ? title.trim() : 'Event', event_date || 'Recurring', end_date || '', start_time || '', end_time || '', location || '', category || 'School Event', description || '', status || 'Confirmed', host_info || '', !!is_recurring, recurrence_rule || 'none', is_published !== false, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/events/:id', async (req, res) => {
  try {
    await req.app.locals.pool.query('DELETE FROM school_events WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;




