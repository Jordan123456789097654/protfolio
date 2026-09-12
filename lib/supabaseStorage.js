// Minimal Supabase Storage client built on the built-in fetch API, so no
// @supabase/supabase-js dependency is required.
//
// Required env vars:
//   SUPABASE_URL               e.g. https://xxxxxxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  service_role key (Settings -> API in Supabase)
// Optional:
//   SUPABASE_BUCKET            defaults to "portfolio-uploads"

const fs = require('fs');
const path = require('path');

const BUCKET = process.env.SUPABASE_BUCKET || 'portfolio-uploads';
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

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

async function ensureBucket() {
  if (!supabaseConfigured()) {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    return;
  }
  try {
    await fetch(`${baseUrl()}/storage/v1/bucket`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true })
    });
  } catch (err) {
    console.warn('Supabase bucket check skipped:', err.message);
  }
}

function safeExtension(originalName) {
  const ext = (originalName || '').split('.').pop();
  const cleaned = (ext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned || 'jpg';
}

// Uploads a Buffer to Supabase Storage (or local /public/uploads fallback)
async function uploadImage(buffer, originalName, mimetype) {
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExtension(originalName)}`;

  if (!supabaseConfigured()) {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    const filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/${filename}`;
  }

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

// List all media files from local uploads or Supabase
async function listMedia() {
  const files = [];
  if (fs.existsSync(UPLOADS_DIR)) {
    const localFiles = fs.readdirSync(UPLOADS_DIR);
    for (const file of localFiles) {
      const stats = fs.statSync(path.join(UPLOADS_DIR, file));
      files.push({
        filename: file,
        url: `/uploads/${file}`,
        size: stats.size,
        createdAt: stats.birthtime || stats.mtime
      });
    }
  }
  return files;
}

// Delete media file from local uploads
async function deleteMedia(filename) {
  const cleanName = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, cleanName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

module.exports = { uploadImage, ensureBucket, supabaseConfigured, listMedia, deleteMedia, BUCKET };

