// Shared session-auth guard, used by both the admin CRUD routes and the
// Spotify OAuth routes.
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

module.exports = requireAuth;
