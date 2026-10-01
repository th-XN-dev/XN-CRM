import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * Domain-level exception carrying a stable error code.
 * Throw these from services; the global filter renders them.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super(message, status);
  }

  static badRequest(code: ErrorCode, message: string, details?: unknown): AppException {
    return new AppException(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static unauthorized(
    code: ErrorCode = ErrorCode.UNAUTHORIZED,
    message = 'Unauthorized',
  ): AppException {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(code: ErrorCode = ErrorCode.FORBIDDEN, message = 'Forbidden'): AppException {
    return new AppException(code, message, HttpStatus.FORBIDDEN);
  }

  static notFound(
    code: ErrorCode = ErrorCode.NOT_FOUND,
    message = 'Resource not found',
  ): AppException {
    return new AppException(code, message, HttpStatus.NOT_FOUND);
  }

  static conflict(code: ErrorCode = ErrorCode.CONFLICT, message = 'Conflict'): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT);
  }
}
