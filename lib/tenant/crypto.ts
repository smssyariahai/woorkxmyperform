// AES-256-GCM encryption for tenant database credentials.
// Used to encrypt the tenant DB role password before storing it as
// TenantDatabaseRegistry.secretReference. Plaintext passwords are NEVER
// stored in the master database.
//
// Key: MASTER_ENCRYPTION_KEY env var — 32 bytes, hex-encoded (64 chars).
//
// Format: base64( iv (12 bytes) || authTag (16 bytes) || ciphertext )
// The IV is random per encryption, so encrypting the same plaintext twice
// yields different output. Decryption verifies the auth tag — a tampered
// value fails instead of silently decrypting.
//
// Never log plaintext secrets or ciphertext.
import * as crypto from 'crypto';
import { requireEnv } from './env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = requireEnv('MASTER_ENCRYPTION_KEY');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('MASTER_ENCRYPTION_KEY must be 32 bytes hex (64 hex chars)');
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptSecret(ciphertext: string): string {
  const data = Buffer.from(ciphertext, 'base64');
  if (data.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted secret');
  }
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
