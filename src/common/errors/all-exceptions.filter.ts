import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'success' in body) {
        return res.status(status).json(body);
      }
      return res.status(status).json({
        success: false,
        error: {
          code: 'HTTP_ERROR',
          message:
            typeof body === 'string'
              ? body
              : ((body as { message?: string | string[] }).message ??
                exception.message),
          details: null,
        },
      });
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.error(
        `Prisma ${exception.code} on ${exception.meta?.modelName ?? 'unknown'}`,
        exception.stack,
      );
      if (exception.code === 'P2021' || exception.code === 'P2022') {
        return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
          success: false,
          error: {
            code: 'SCHEMA_DRIFT',
            message:
              'Database schema is behind the application. Run prisma migrate deploy.',
            details: null,
          },
        });
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Internal server error',
          details: null,
        },
      });
    }

    this.logger.error(exception);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: null,
      },
    });
  }
}
