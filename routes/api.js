const router = require('express').Router();
const { getNowPlaying } = require('../lib/spotify');

// ── GET site config ──────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query('SELECT * FROM site_config LIMIT 1');
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET projects ─────────────────────────────────────────────────
router.get('/projects', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM projects WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET skills ───────────────────────────────────────────────────
router.get('/skills', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM skills WHERE is_published = true ORDER BY category ASC, sort_order ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET experience ───────────────────────────────────────────────
router.get('/experience', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM experience WHERE is_published = true ORDER BY sort_order ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET achievements ──────────────────────────────────────────────
router.get('/achievements', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM achievements WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET gallery photos ───────────────────────────────────────────
router.get('/gallery', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM gallery WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET testimonials ─────────────────────────────────────────────
router.get('/testimonials', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM testimonials WHERE is_published = true ORDER BY sort_order ASC, created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET social links ─────────────────────────────────────────────
router.get('/social', async (req, res) => {
  try {
    const { rows } = await req.app.locals.pool.query(
      'SELECT * FROM social_links WHERE is_published = true ORDER BY sort_order ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET Spotify now-playing ───────────────────────────────────────
router.get('/spotify/now-playing', async (req, res) => {
  try {
    const data = await getNowPlaying(req.app.locals.pool);
    res.json(data);
  } catch (err) {
    // Never break the public site over a Spotify hiccup.
    res.json({ connected: false, isPlaying: false });
  }
});

// ── POST contact message ─────────────────────────────────────────
router.post('/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required.' });
    }
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }
    await req.app.locals.pool.query(
      'INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)',
      [name.trim(), email.trim(), message.trim()]
    );
    res.json({ success: true, message: 'Message sent successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
