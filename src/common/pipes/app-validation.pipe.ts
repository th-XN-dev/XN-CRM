import { HttpStatus, type ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

interface FieldError {
  field: string;
  errors: string[];
}

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints ? [{ field, errors: Object.values(error.constraints) }] : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/**
 * Strict DTO validation: unknown fields are rejected, payloads are transformed to
 * DTO classes. Failures → 422 VALIDATION_ERROR with per-field `details`.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    stopAtFirstError: false,
    // 422: the request is well-formed but its content breaks the DTO rules.
    exceptionFactory: (errors) =>
      new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        HttpStatus.UNPROCESSABLE_ENTITY,
        flatten(errors),
      ),
  });
}
