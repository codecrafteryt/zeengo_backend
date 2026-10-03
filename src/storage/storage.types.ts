export type StoredObject = {
  key: string;
  size: number;
};

export type DownloadedObject = {
  key: string;
  buffer: Buffer;
  contentType?: string;
};

export interface ObjectStorage {
  upload(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  download(key: string): Promise<DownloadedObject>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getSignedUrl(key: string, expiresSeconds?: number): Promise<string | null>;
}
