// AES-256-GCM encryption for engine API keys stored in the database.
// The key comes from ENGINE_KEY_SECRET (base64, 32 bytes) and never leaves
// the server, so the ciphertext in Postgres is useless on its own.

import crypto from 'node:crypto';

function secretKey() {
  const raw = process.env.ENGINE_KEY_SECRET;
  if (!raw) throw new Error('ENGINE_KEY_SECRET não configurado no servidor');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ENGINE_KEY_SECRET precisa ter 32 bytes em base64');
  return key;
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(payload) {
  if (!payload) return null;
  const [version, iv, tag, data] = String(payload).split(':');
  if (version !== 'v1') throw new Error('Formato de chave desconhecido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** Last characters of a key, for display ("••••3fA9"). */
export function keyHint(plain) {
  const s = String(plain);
  return s.length <= 4 ? '••••' : `••••${s.slice(-4)}`;
}

export function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

export function newAccessToken() {
  return `ohf_${crypto.randomBytes(32).toString('base64url')}`;
}
