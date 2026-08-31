import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { ZodType } from 'zod';
import { AppError } from '../errors/app-error';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw AppError.validation('Request validation failed', result.error.issues);
    }
    return result.data;
  }
}

export function zodPipe(schema: ZodType) {
  return new ZodValidationPipe(schema);
}
