import { DocumentCategory } from '@prisma/client';
import {
  CUSTOMER_DEFAULT_VISIBLE,
  DRIVER_DOCUMENT_CATEGORIES,
  parseCategory,
  sanitizeFilename,
  validateDocumentFile,
} from './document-validation';

describe('document validation', () => {
  it('accepts a PDF under the size limit', () => {
    const result = validateDocumentFile({
      originalname: 'voucher.pdf',
      mimetype: 'application/pdf',
      size: 1200,
      buffer: Buffer.from('%PDF-1.4'),
    });
    expect(result.ext).toBe('.pdf');
    expect(result.mime).toBe('application/pdf');
  });

  it('rejects executables', () => {
    expect(() =>
      validateDocumentFile({
        originalname: 'setup.exe',
        mimetype: 'application/octet-stream',
        size: 100,
        buffer: Buffer.from('MZ'),
      }),
    ).toThrow();
  });

  it('rejects files over 15MB', () => {
    const huge = Buffer.alloc(15 * 1024 * 1024 + 1);
    expect(() =>
      validateDocumentFile({
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        size: huge.length,
        buffer: huge,
      }),
    ).toThrow();
  });

  it('sanitizes path characters in filenames', () => {
    expect(sanitizeFilename('../../etc/passwd.pdf')).not.toMatch(/[/\\]/);
  });

  it('parses known categories only', () => {
    expect(parseCategory('voucher')).toBe(DocumentCategory.voucher);
    expect(() => parseCategory('malware')).toThrow();
  });

  it('keeps driver and customer visibility sets explicit', () => {
    expect(DRIVER_DOCUMENT_CATEGORIES).toContain(DocumentCategory.transfer_document);
    expect(CUSTOMER_DEFAULT_VISIBLE).toContain(DocumentCategory.voucher);
    expect(CUSTOMER_DEFAULT_VISIBLE).not.toContain(DocumentCategory.other);
  });
});
