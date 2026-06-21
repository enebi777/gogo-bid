import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM at-rest encryption for OAuth tokens and other secrets.
 * Key must be a 32-byte value, base64-encoded, in CREDENTIALS_ENCRYPTION_KEY.
 * Generate with: openssl rand -base64 32
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
    if (!raw) {
      throw new Error('CREDENTIALS_ENCRYPTION_KEY is not set — refusing to start without it.');
    }
    this.key = Buffer.from(raw, 'base64');
    if (this.key.length !== 32) {
      throw new Error('CREDENTIALS_ENCRYPTION_KEY must decode to exactly 32 bytes.');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString('base64');
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
