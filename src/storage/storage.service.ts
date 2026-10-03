import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { LocalObjectStorage } from './local.storage';
import { S3ObjectStorage } from './s3.storage';
import type { DownloadedObject, ObjectStorage, StoredObject } from './storage.types';

@Injectable()
export class StorageService implements ObjectStorage {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: ObjectStorage;
  readonly providerName: 'local' | 's3';

  constructor(private readonly config: ConfigService) {
    const requested = (this.config.get<string>('STORAGE_PROVIDER') || 'local')
      .trim()
      .toLowerCase();
    const bucket = (this.config.get<string>('STORAGE_BUCKET') || '').trim();
    const accessKey = (this.config.get<string>('STORAGE_ACCESS_KEY') || '').trim();
    const secretKey = (this.config.get<string>('STORAGE_SECRET_KEY') || '').trim();

    if (requested === 's3' && bucket && accessKey && secretKey) {
      this.providerName = 's3';
      this.provider = new S3ObjectStorage({
        bucket,
        region: this.config.get<string>('STORAGE_REGION') || 'us-east-1',
        accessKey,
        secretKey,
        endpoint: this.config.get<string>('STORAGE_ENDPOINT') || undefined,
      });
      this.logger.log('Object storage: s3');
      return;
    }

    if (requested === 's3') {
      this.logger.warn(
        'STORAGE_PROVIDER=s3 but bucket/keys are missing — using local directory. Attach a volume or set S3 credentials.',
      );
    }

    this.providerName = 'local';
    const dir =
      this.config.get<string>('STORAGE_LOCAL_DIR') ||
      resolve(process.cwd(), 'storage', 'documents');
    this.provider = new LocalObjectStorage(dir);
    this.logger.log(`Object storage: local (${dir})`);
  }

  upload(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    return this.provider.upload(key, body, contentType);
  }

  download(key: string): Promise<DownloadedObject> {
    return this.provider.download(key);
  }

  delete(key: string): Promise<void> {
    return this.provider.delete(key);
  }

  exists(key: string): Promise<boolean> {
    return this.provider.exists(key);
  }

  getSignedUrl(key: string, expiresSeconds?: number): Promise<string | null> {
    return this.provider.getSignedUrl(key, expiresSeconds);
  }
}
