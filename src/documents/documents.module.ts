import { Module } from '@nestjs/common';
import {
  BookingDocumentsController,
  ClientDocumentsController,
  DocumentsController,
} from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [
    BookingDocumentsController,
    DocumentsController,
    ClientDocumentsController,
  ],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
