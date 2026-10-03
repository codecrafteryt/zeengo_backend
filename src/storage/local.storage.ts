import { createHash } from 'crypto';
import { mkdir, readFile, unlink, writeFile, access } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { AppError } from '../common/errors/app-error';
import type { DownloadedObject, ObjectStorage, StoredObject } from './storage.types';

export class LocalObjectStorage implements ObjectStorage {
  constructor(private readonly rootDir: string) {}

  private resolveKey(key: string): string {
    const safe = key.replace(/^\/+/, '').replace(/\.\./g, '');
    const full = resolve(join(this.rootDir, safe));
    const root = resolve(this.rootDir);
    if (!full.startsWith(root)) {
      throw AppError.validation('Invalid storage path');
    }
    return full;
  }

  async upload(key: string, body: Buffer, _contentType: string): Promise<StoredObject> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
    return { key, size: body.length };
  }

  async download(key: string): Promise<DownloadedObject> {
    const full = this.resolveKey(key);
    try {
      const buffer = await readFile(full);
      return { key, buffer };
    } catch {
      throw AppError.notFound('DOCUMENT_NOT_FOUND', 'File is not available');
    }
  }

  async delete(key: string): Promise<void> {
    const full = this.resolveKey(key);
    try {
      await unlink(full);
    } catch {
      // already gone
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(_key: string): Promise<string | null> {
    return null;
  }
}

export function contentChecksum(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}
