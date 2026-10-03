import { extname } from 'path';
import { DocumentCategory } from '@prisma/client';
import { AppError } from '../common/errors/app-error';

export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

const ALLOWED_BY_EXT: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
  '.txt': ['text/plain'],
  '.csv': ['text/csv', 'text/plain', 'application/csv'],
  '.doc': ['application/msword'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
};

const BLOCKED_EXT = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.dll',
  '.sh',
  '.bash',
  '.ps1',
  '.js',
  '.mjs',
  '.cjs',
  '.php',
  '.py',
  '.rb',
  '.jar',
  '.apk',
  '.scr',
  '.vbs',
  '.html',
  '.htm',
  '.svg',
]);

export const DRIVER_DOCUMENT_CATEGORIES: DocumentCategory[] = [
  DocumentCategory.itinerary,
  DocumentCategory.voucher,
  DocumentCategory.hotel_confirmation,
  DocumentCategory.transfer_document,
];

export const CUSTOMER_DEFAULT_VISIBLE: DocumentCategory[] = [
  DocumentCategory.itinerary,
  DocumentCategory.voucher,
  DocumentCategory.hotel_confirmation,
  DocumentCategory.transfer_document,
  DocumentCategory.payment_receipt,
  DocumentCategory.client_document,
];

export function sanitizeFilename(original: string): string {
  const base = (original || 'document')
    .replace(/[/\\]/g, '')
    .replace(/[^\w.\- ()\[\]]+/g, '_')
    .trim()
    .slice(0, 180);
  return base || 'document';
}

export function validateDocumentFile(file: {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
}): { ext: string; mime: string; name: string } {
  if (!file?.buffer?.length) {
    throw AppError.validation('Choose a file to upload');
  }
  if ((file.size ?? file.buffer.length) > DOCUMENT_MAX_BYTES) {
    throw AppError.validation('File is larger than 15 MB');
  }

  const name = sanitizeFilename(file.originalname || 'document');
  const ext = extname(name).toLowerCase();
  if (!ext) {
    throw AppError.validation('File must have an extension');
  }
  if (BLOCKED_EXT.has(ext) || !ALLOWED_BY_EXT[ext]) {
    throw AppError.validation(
      'Allowed files: PDF, images, Word, Excel, CSV, or text',
    );
  }

  const mime = (file.mimetype || '').toLowerCase().split(';')[0].trim();
  const allowedMime = ALLOWED_BY_EXT[ext];
  const mimeOk =
    !mime ||
    mime === 'application/octet-stream' ||
    allowedMime.includes(mime);
  if (!mimeOk) {
    throw AppError.validation('File type does not match the extension');
  }

  return {
    ext,
    mime: allowedMime[0],
    name,
  };
}

export function parseCategory(raw?: string): DocumentCategory {
  const value = (raw || 'other').trim();
  if ((Object.values(DocumentCategory) as string[]).includes(value)) {
    return value as DocumentCategory;
  }
  throw AppError.validation('Unknown document category');
}
