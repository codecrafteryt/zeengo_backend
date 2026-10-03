import { createHash, createHmac } from 'crypto';
import { AppError } from '../common/errors/app-error';
import type { DownloadedObject, ObjectStorage, StoredObject } from './storage.types';

type S3Config = {
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  endpoint?: string;
};

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function encodePath(key: string): string {
  return key
    .split('/')
    .map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
}

export class S3ObjectStorage implements ObjectStorage {
  constructor(private readonly config: S3Config) {}

  private host(): string {
    if (this.config.endpoint) {
      const u = new URL(this.config.endpoint);
      return u.host;
    }
    return `${this.config.bucket}.s3.${this.config.region}.amazonaws.com`;
  }

  private objectUrl(key: string): URL {
    if (this.config.endpoint) {
      const base = this.config.endpoint.replace(/\/$/, '');
      return new URL(`${base}/${this.config.bucket}/${encodePath(key)}`);
    }
    return new URL(`https://${this.host()}/${encodePath(key)}`);
  }

  private async signedRequest(
    method: string,
    key: string,
    body?: Buffer,
    extraHeaders: Record<string, string> = {},
    expiresSeconds?: number,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const url = this.objectUrl(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = body ? sha256Hex(body) : 'UNSIGNED-PAYLOAD';
    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...extraHeaders,
    };
    const signedHeaderNames = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${headers[name] ?? headers[Object.keys(headers).find((k) => k.toLowerCase() === name) ?? '']}\n`)
      .join('');
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalRequest = [
      method,
      url.pathname,
      url.search.replace(/^\?/, ''),
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');
    const kDate = hmac(`AWS4${this.config.secretKey}`, dateStamp);
    const kRegion = hmac(kDate, this.config.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    if (expiresSeconds) {
      url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
    }
    return { url: url.toString(), headers };
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    const { url, headers } = await this.signedRequest('PUT', key, body, {
      'content-type': contentType,
    });
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: new Uint8Array(body),
    });
    if (!res.ok) {
      throw AppError.serviceUnavailable(
        'STORAGE_UNAVAILABLE',
        'Could not store the file',
      );
    }
    return { key, size: body.length };
  }

  async download(key: string): Promise<DownloadedObject> {
    const { url, headers } = await this.signedRequest('GET', key);
    const res = await fetch(url, { method: 'GET', headers });
    if (res.status === 404) {
      throw AppError.notFound('DOCUMENT_NOT_FOUND', 'File is not available');
    }
    if (!res.ok) {
      throw AppError.serviceUnavailable(
        'STORAGE_UNAVAILABLE',
        'Could not read the file',
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      key,
      buffer,
      contentType: res.headers.get('content-type') ?? undefined,
    };
  }

  async delete(key: string): Promise<void> {
    const { url, headers } = await this.signedRequest('DELETE', key);
    await fetch(url, { method: 'DELETE', headers });
  }

  async exists(key: string): Promise<boolean> {
    const { url, headers } = await this.signedRequest('HEAD', key);
    const res = await fetch(url, { method: 'HEAD', headers });
    return res.ok;
  }

  async getSignedUrl(key: string, expiresSeconds = 120): Promise<string | null> {
    const { url } = await this.signedRequest('GET', key, undefined, {}, expiresSeconds);
    return url;
  }
}
