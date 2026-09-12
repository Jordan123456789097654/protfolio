// Password hashing helpers for the admin account.
// Uses Node's built-in crypto (scrypt) so no extra dependency is required.
const crypto = require('crypto');

const PREFIX = 'scrypt';
const KEY_LEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString('hex');
  return `${PREFIX}$${salt}$${hash}`;
}

// Verifies a plaintext password against a stored value. Supports both the
// new "scrypt$<salt>$<hash>" format and the legacy plaintext default that
// ships in schema.sql, so existing installs keep working until they log in
// once (at which point admin.js transparently upgrades the stored value).
function verifyPassword(password, stored) {
  if (!password || !stored) return false;

  if (stored.startsWith(`${PREFIX}$`)) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, hashHex] = parts;
    const storedHash = Buffer.from(hashHex, 'hex');
    const testHash = crypto.scryptSync(password, salt, KEY_LEN);
    if (storedHash.length !== testHash.length) return false;
    return crypto.timingSafeEqual(storedHash, testHash);
  }

  // Legacy plaintext comparison
  return password === stored;
}

function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith(`${PREFIX}$`);
}

module.exports = { hashPassword, verifyPassword, isHashed };
