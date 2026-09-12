// Minimal Supabase Storage client built on the built-in fetch API, so no
// @supabase/supabase-js dependency is required.
//
// Required env vars:
//   SUPABASE_URL               e.g. https://xxxxxxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  service_role key (Settings -> API in Supabase)
// Optional:
//   SUPABASE_BUCKET            defaults to "portfolio-uploads"

const BUCKET = process.env.SUPABASE_BUCKET || 'portfolio-uploads';

function supabaseConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function baseUrl() {
  return process.env.SUPABASE_URL.replace(/\/$/, '');
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    ...extra
  };
}

// Best-effort bucket creation on startup. Safe to call repeatedly — if the
// bucket already exists Supabase returns an error we simply ignore.
async function ensureBucket() {
  if (!supabaseConfigured()) return;
  try {
    await fetch(`${baseUrl()}/storage/v1/bucket`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true })
    });
  } catch (err) {
    // Network hiccup or bucket already exists — non-fatal either way.
    console.warn('Supabase bucket check skipped:', err.message);
  }
}

function safeExtension(originalName) {
  const ext = (originalName || '').split('.').pop();
  const cleaned = (ext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned || 'jpg';
}

// Uploads a Buffer to Supabase Storage and returns its public URL.
async function uploadImage(buffer, originalName, mimetype) {
  if (!supabaseConfigured()) {
    throw new Error(
      'Image uploads are not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env'
    );
  }

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExtension(originalName)}`;

  const res = await fetch(`${baseUrl()}/storage/v1/object/${BUCKET}/${filename}`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': mimetype || 'application/octet-stream',
      'x-upsert': 'true'
    }),
    body: buffer
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase upload failed (${res.status}): ${text || res.statusText}`);
  }

  return `${baseUrl()}/storage/v1/object/public/${BUCKET}/${filename}`;
}

module.exports = { uploadImage, ensureBucket, supabaseConfigured, BUCKET };
