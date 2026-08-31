import { HttpException, HttpStatus } from '@nestjs/common';

export type AppErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export class AppError extends HttpException {
  readonly code: string;

  constructor(
    code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details: unknown = null,
  ) {
    super({ success: false, error: { code, message, details } }, status);
    this.code = code;
  }

  static notFound(code: string, message: string) {
    return new AppError(code, message, HttpStatus.NOT_FOUND);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError('FORBIDDEN', message, HttpStatus.FORBIDDEN);
  }

  static conflict(code: string, message: string) {
    return new AppError(code, message, HttpStatus.CONFLICT);
  }

  static validation(message: string, details?: unknown) {
    return new AppError('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST, details);
  }
}
