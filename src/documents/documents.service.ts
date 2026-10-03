import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DocumentCategory, StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../common/audit.service';
import { AppError } from '../common/errors/app-error';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { assertDriverAssignedToBooking } from '../common/booking-access.util';
import { clientMayAccessBooking } from '../auth/client-auth.policy';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import {
  CUSTOMER_DEFAULT_VISIBLE,
  DRIVER_DOCUMENT_CATEGORIES,
  parseCategory,
  sanitizeFilename,
  validateDocumentFile,
} from './document-validation';

const STAFF_READ: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.driver,
];

const STAFF_WRITE: StaffRole[] = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async listForBooking(bookingId: string, user: AuthPrincipal) {
    const booking = await this.ensureBooking(bookingId);
    await this.assertCanList(booking, user);

    const where =
      user.type === 'client'
        ? { bookingId, deletedAt: null, customerVisible: true }
        : user.role === StaffRole.driver
          ? {
              bookingId,
              deletedAt: null,
              category: { in: DRIVER_DOCUMENT_CATEGORIES },
            }
          : { bookingId, deletedAt: null };

    const rows = await this.prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { uploadedByUser: { select: { fullName: true } } },
    });
    return rows.map((row) => this.map(row));
  }

  async listForClient(user: AuthPrincipal) {
    if (user.type !== 'client') throw AppError.forbidden();
    const bookingId = user.bookingId;
    if (!bookingId) {
      throw AppError.validation('Sign in with a booking ZN to view documents');
    }
    return this.listForBooking(bookingId, user);
  }

  async upload(
    bookingId: string,
    user: AuthPrincipal,
    file: Express.Multer.File,
    fields: { category?: string; description?: string; customerVisible?: string },
  ) {
    this.assertStaffWrite(user);
    const booking = await this.ensureBooking(bookingId);
    const checked = validateDocumentFile(file);
    const category = parseCategory(fields.category);
    const customerVisible =
      fields.customerVisible === 'true'
        ? true
        : fields.customerVisible === 'false'
          ? false
          : CUSTOMER_DEFAULT_VISIBLE.includes(category);

    const id = randomUUID();
    const storageKey = `documents/${booking.id}/${id}${checked.ext}`;
    await this.storage.upload(storageKey, file.buffer, checked.mime);

    const row = await this.prisma.document.create({
      data: {
        id,
        bookingId: booking.id,
        clientId: booking.clientId,
        uploadedBy: user.sub,
        uploadedByType: 'staff',
        name: sanitizeFilename(fields.description ? checked.name : checked.name),
        originalName: checked.name,
        mimeType: checked.mime,
        size: file.buffer.length,
        storageKey,
        category,
        description: fields.description?.trim() || null,
        customerVisible,
      },
      include: { uploadedByUser: { select: { fullName: true } } },
    });

    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'document.upload',
      entity: 'document',
      entityId: row.id,
      diff: {
        bookingId: booking.id,
        znCode: booking.znCode,
        category,
        name: row.originalName,
        customerVisible,
      },
    });

    const mapped = this.map(row);
    this.realtime.emit('document.uploaded', {
      bookingId: booking.id,
      documentId: row.id,
      category,
    });
    return mapped;
  }

  async download(documentId: string, user: AuthPrincipal) {
    const row = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
      include: { booking: true },
    });
    if (!row) {
      throw AppError.notFound('DOCUMENT_NOT_FOUND', 'Document not found');
    }
    await this.assertCanDownload(row, user);
    const file = await this.storage.download(row.storageKey);
    return {
      buffer: file.buffer,
      mimeType: row.mimeType,
      filename: row.originalName,
    };
  }

  async remove(documentId: string, user: AuthPrincipal) {
    this.assertStaffWrite(user);
    const row = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });
    if (!row) {
      throw AppError.notFound('DOCUMENT_NOT_FOUND', 'Document not found');
    }
    await this.prisma.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });
    await this.storage.delete(row.storageKey);
    await this.audit.log({
      actorType: 'staff',
      actorId: user.sub,
      action: 'document.delete',
      entity: 'document',
      entityId: documentId,
      diff: { bookingId: row.bookingId, name: row.originalName },
    });
    return { deleted: true };
  }

  private map(row: {
    id: string;
    bookingId: string;
    clientId: string;
    name: string;
    originalName: string;
    mimeType: string;
    size: number;
    category: DocumentCategory;
    description: string | null;
    customerVisible: boolean;
    createdAt: Date;
    uploadedBy: string | null;
    uploadedByUser?: { fullName: string } | null;
  }) {
    return {
      id: row.id,
      bookingId: row.bookingId,
      clientId: row.clientId,
      name: row.originalName,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      category: row.category,
      description: row.description,
      customerVisible: row.customerVisible,
      createdAt: row.createdAt.toISOString(),
      uploadedBy: row.uploadedBy,
      uploadedByName: row.uploadedByUser?.fullName ?? null,
    };
  }

  private async ensureBooking(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, clientId: true, znCode: true },
    });
    if (!booking) {
      throw AppError.notFound('BOOKING_NOT_FOUND', 'Booking not found');
    }
    return booking;
  }

  private async assertCanList(
    booking: { id: string; clientId: string },
    user: AuthPrincipal,
  ) {
    if (user.type === 'client') {
      if (!clientMayAccessBooking(booking, user)) throw AppError.forbidden();
      return;
    }
    if (user.type !== 'staff' || !user.role || !STAFF_READ.includes(user.role)) {
      throw AppError.forbidden();
    }
    await assertDriverAssignedToBooking({
      user,
      bookingId: booking.id,
      driverAssignments: this.prisma.driverAssignment,
    });
  }

  private async assertCanDownload(
    row: {
      id: string;
      bookingId: string;
      clientId: string;
      customerVisible: boolean;
      category: DocumentCategory;
      booking: { id: string; clientId: string };
    },
    user: AuthPrincipal,
  ) {
    if (user.type === 'client') {
      if (!row.customerVisible) throw AppError.forbidden();
      if (!clientMayAccessBooking(row.booking, user)) throw AppError.forbidden();
      return;
    }
    if (user.type !== 'staff' || !user.role || !STAFF_READ.includes(user.role)) {
      throw AppError.forbidden();
    }
    if (user.role === StaffRole.driver) {
      if (!DRIVER_DOCUMENT_CATEGORIES.includes(row.category)) {
        throw AppError.forbidden();
      }
    }
    await assertDriverAssignedToBooking({
      user,
      bookingId: row.bookingId,
      driverAssignments: this.prisma.driverAssignment,
    });
  }

  private assertStaffWrite(user: AuthPrincipal) {
    if (user.type !== 'staff' || !user.role || !STAFF_WRITE.includes(user.role)) {
      throw AppError.forbidden();
    }
  }
}
