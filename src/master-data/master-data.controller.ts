import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { StaffRole } from '@prisma/client';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthPrincipal } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AppError } from '../common/errors/app-error';
import { MasterDataImportService } from './master-data-import.service';

const ALLOWED_EXT = /\.(xlsx|xls|json)$/i;
const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/json',
  'text/json',
  'application/octet-stream',
]);

function masterDataFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const nameOk = ALLOWED_EXT.test(file.originalname || '');
  const mimeOk =
    !file.mimetype ||
    ALLOWED_MIME.has(file.mimetype) ||
    file.mimetype.startsWith('application/');
  if (!nameOk) {
    cb(
      AppError.validation('Supported uploads: .xlsx, .xls, or kitchen .json'),
      false,
    );
    return;
  }
  if (!mimeOk) {
    cb(AppError.validation('Unsupported file MIME type'), false);
    return;
  }
  cb(null, true);
}

@ApiTags('master-data')
@Controller('master-data')
@Roles(StaffRole.admin, StaffRole.ops_manager)
export class MasterDataController {
  constructor(private readonly imports: MasterDataImportService) {}

  @Get('imports')
  listImports() {
    return this.imports.list();
  }

  @Get('imports/:id')
  getImport(@Param('id') id: string) {
    return this.imports.getById(id);
  }

  @Post('imports/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: masterDataFileFilter,
    }),
  )
  preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthPrincipal,
  ) {
    if (!file?.buffer?.length) {
      throw AppError.validation('Upload an .xlsx or kitchen .json file');
    }
    if (user.type !== 'staff') throw AppError.forbidden();
    return this.imports.previewUpload(file, user.sub);
  }

  @Post('imports/:id/commit')
  commit(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    if (user.type !== 'staff') throw AppError.forbidden();
    return this.imports.commit(id, user.sub);
  }
}
