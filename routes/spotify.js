const router = require('express').Router();
const crypto = require('crypto');
const requireAuth = require('../lib/authMiddleware');
const {
  spotifyConfigured,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  saveTokens,
  clearTokens,
  hasTokens
} = require('../lib/spotify');

router.use(requireAuth);

function getRedirectUri(req) {
  return process.env.SPOTIFY_REDIRECT_URI || `${req.protocol}://${req.get('host')}/admin/spotify/callback`;
}

// ── Kick off the OAuth flow ─────────────────────────────────────────
router.get('/login', (req, res) => {
  if (!spotifyConfigured()) {
    return res.status(500).send('Spotify is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.spotifyState = state;
  res.redirect(buildAuthorizeUrl(getRedirectUri(req), state));
});

// ── OAuth callback ───────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code || !state || state !== req.session.spotifyState) {
    return res.redirect('/admin.html?spotify=error');
  }
  delete req.session.spotifyState;

  try {
    const tokens = await exchangeCodeForTokens(code, getRedirectUri(req));
    await saveTokens(req.app.locals.pool, tokens);
    res.redirect('/admin.html?spotify=connected');
  } catch (err) {
    console.error('Spotify auth error:', err.message);
    res.redirect('/admin.html?spotify=error');
  }
});

// ── Connection status ────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const connected = await hasTokens(req.app.locals.pool);
    res.json({ connected, configured: spotifyConfigured() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Disconnect ───────────────────────────────────────────────────────
router.post('/disconnect', async (req, res) => {
  try {
    await clearTokens(req.app.locals.pool);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
