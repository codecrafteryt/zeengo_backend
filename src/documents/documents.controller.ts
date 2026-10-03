import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipEnvelope } from '../common/decorators/skip-envelope.decorator';
import { AppError } from '../common/errors/app-error';
import { DocumentsService } from './documents.service';
import { DOCUMENT_MAX_BYTES } from './document-validation';

const STAFF_READ = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
  StaffRole.driver,
] as const;

const STAFF_WRITE = [
  StaffRole.admin,
  StaffRole.ops_manager,
  StaffRole.support,
] as const;

@ApiTags('documents')
@Controller('bookings/:bookingId/documents')
export class BookingDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @Roles(...STAFF_READ)
  list(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.documents.listForBooking(bookingId, user);
  }

  @Post()
  @Roles(...STAFF_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: DOCUMENT_MAX_BYTES },
    }),
  )
  upload(
    @Param('bookingId') bookingId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: { category?: string; description?: string; customerVisible?: string },
    @CurrentUser() user: AuthPrincipal,
  ) {
    if (!file) {
      throw AppError.validation('Choose a file to upload');
    }
    return this.documents.upload(bookingId, user, file, body ?? {});
  }
}

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(':id/download')
  @Roles(...STAFF_READ, 'client')
  @SkipEnvelope()
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const file = await this.documents.download(id, user);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    });
  }

  @Delete(':id')
  @Roles(...STAFF_WRITE)
  remove(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.documents.remove(id, user);
  }
}

@ApiTags('client-documents')
@Roles('client')
@Controller('client/documents')
export class ClientDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: AuthPrincipal) {
    return this.documents.listForClient(user);
  }

  @Get(':id/download')
  @SkipEnvelope()
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    const file = await this.documents.download(id, user);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    });
  }
}
