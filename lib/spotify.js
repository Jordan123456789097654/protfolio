// Spotify "Now Playing" integration — Authorization Code flow.
// Required env vars:
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
// Optional:
//   SPOTIFY_REDIRECT_URI  — defaults to <host>/admin/spotify/callback

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state';

function spotifyConfigured() {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

function basicAuthHeader() {
  const creds = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(creds).toString('base64')}`;
}

function buildAuthorizeUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(bodyParams) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader()
    },
    body: bodyParams.toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Spotify token request failed (${res.status})`);
  }
  return data;
}

function exchangeCodeForTokens(code, redirectUri) {
  return tokenRequest(
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  );
}

function refreshTokens(refreshToken) {
  return tokenRequest(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  );
}

async function saveTokens(pool, tokens) {
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
  await pool.query('DELETE FROM spotify_auth');
  await pool.query(
    'INSERT INTO spotify_auth (access_token, refresh_token, expires_at) VALUES ($1, $2, $3)',
    [tokens.access_token, tokens.refresh_token, expiresAt]
  );
}

async function clearTokens(pool) {
  await pool.query('DELETE FROM spotify_auth');
}

async function hasTokens(pool) {
  const { rows } = await pool.query('SELECT id FROM spotify_auth LIMIT 1');
  return rows.length > 0;
}

async function getValidAccessToken(pool) {
  const { rows } = await pool.query('SELECT * FROM spotify_auth ORDER BY id DESC LIMIT 1');
  const row = rows[0];
  if (!row) return null;

  const isExpiring = new Date(row.expires_at).getTime() - 30000 < Date.now();
  if (!isExpiring) return row.access_token;

  const refreshed = await refreshTokens(row.refresh_token);
  const expiresAt = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000);
  // Spotify doesn't always return a new refresh_token — keep the old one if so.
  const newRefreshToken = refreshed.refresh_token || row.refresh_token;
  await pool.query(
    'UPDATE spotify_auth SET access_token=$1, refresh_token=$2, expires_at=$3, updated_at=NOW() WHERE id=$4',
    [refreshed.access_token, newRefreshToken, expiresAt, row.id]
  );
  return refreshed.access_token;
}

// Returns a normalized now-playing payload for the public widget.
async function getNowPlaying(pool) {
  if (!spotifyConfigured()) return { connected: false, isPlaying: false };

  const accessToken = await getValidAccessToken(pool);
  if (!accessToken) return { connected: false, isPlaying: false };

  const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing?additional_types=track', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  // 204 = nothing currently playing
  if (res.status === 204 || !res.ok) {
    return { connected: true, isPlaying: false };
  }

  const data = await res.json().catch(() => null);
  if (!data || !data.item) {
    return { connected: true, isPlaying: false };
  }

  return {
    connected: true,
    isPlaying: !!data.is_playing,
    title: data.item.name,
    artist: (data.item.artists || []).map((a) => a.name).join(', '),
    album: data.item.album ? data.item.album.name : '',
    albumArt: data.item.album?.images?.[0]?.url || '',
    songUrl: data.item.external_urls?.spotify || '',
    previewUrl: data.item.preview_url || '',
    trackId: data.item.id || '',
    progressMs: data.progress_ms || 0,
    durationMs: data.item.duration_ms || 0
  };
}

module.exports = {
  spotifyConfigured,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  saveTokens,
  clearTokens,
  hasTokens,
  getNowPlaying
};
