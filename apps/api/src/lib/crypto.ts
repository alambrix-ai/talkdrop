import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function randomCode(length = 6): string {
  const max = 10 ** length;
  const n = randomBytes(4).readUInt32BE(0) % max;
  return n.toString().padStart(length, '0');
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) return '***';
  return `${phone.slice(0, 3)}••••${phone.slice(-2)}`;
}

/** AES-256-GCM with key derived from FIELD_ENCRYPTION_KEY */
export function encryptField(plaintext: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64').subarray(0, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptField(payload: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64').subarray(0, 32);
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function encryptBuffer(data: Buffer, keyB64: string): Buffer {
  const key = Buffer.from(keyB64, 'base64').subarray(0, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
