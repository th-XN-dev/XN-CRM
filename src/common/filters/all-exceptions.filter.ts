import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type Response } from 'express';
import { currentRequestContext } from '../context/request-context';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

export interface ErrorResponseBody {
  success: false;
  message: string;
  code: ErrorCode;
  details?: unknown;
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
};

/**
 * Renders every error as `{ success: false, message, code }`.
 * Unknown errors never leak internals (stack, SQL, etc.) to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toResponse(exception);

    const requestId = currentRequestContext()?.requestId;
    if (status >= 500) {
      // Full details go to the log only, tagged with the request id; the client gets a generic body.
      this.logger.error(
        `[${requestId ?? '-'}] ${exception instanceof Error ? exception.stack : String(exception)}`,
      );
    }
    // The request id travels in the `X-Request-ID` header, keeping the body format fixed.
    response.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorResponseBody } {
    // Before HttpException: Nest wraps parser errors with the parser's own message.
    const bodyParserError = asBodyParserError(exception);
    if (bodyParserError) return bodyParserError;

    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          success: false,
          message: exception.message,
          code: exception.code,
          ...(exception.details !== undefined && { details: exception.details }),
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          success: false,
          message: extractMessage(exception),
          code:
            STATUS_TO_CODE[status] ??
            (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST),
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Safety net: services should translate these into domain errors themselves.
      if (exception.code === 'P2002') {
        return {
          status: 409,
          body: { success: false, message: 'Resource already exists', code: ErrorCode.CONFLICT },
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: 404,
          body: { success: false, message: 'Resource not found', code: ErrorCode.NOT_FOUND },
        };
      }
      if (exception.code === 'P2003') {
        return {
          status: 409,
          body: {
            success: false,
            message: 'A related resource is missing or still in use',
            code: ErrorCode.CONFLICT,
          },
        };
      }
      if (exception.code === 'P2034') {
        // Serialization failure / deadlock between concurrent transactions: safe to retry.
        return {
          status: 409,
          body: {
            success: false,
            message: 'Concurrent update, please retry',
            code: ErrorCode.CONFLICT,
          },
        };
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      // e.g. `null` sent for a required field in a PATCH body.
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { success: false, message: 'Invalid input', code: ErrorCode.VALIDATION_ERROR },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { success: false, message: 'Internal server error', code: ErrorCode.INTERNAL_ERROR },
    };
  }
}

function extractMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const { message } = response;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return exception.message;
}

/** `JSON.parse` messages, as forwarded by Nest's body parser. */
const JSON_SYNTAX_MESSAGE =
  /(JSON|Unexpected token|Unexpected end|Unexpected non-whitespace|Expected property name|Bad control character|Unterminated string|Bad escaped character)/;

/** Errors raised by the JSON body parser before any route runs (malformed or oversized body). */
function asBodyParserError(exception: unknown): { status: number; body: ErrorResponseBody } | null {
  const error = exception as { type?: unknown; cause?: { type?: unknown } } | null;
  const type = error?.type ?? error?.cause?.type;
  // Nest forwards the parser's SyntaxError text (which echoes input) in a plain 400.
  const wrappedSyntaxError =
    exception instanceof BadRequestException &&
    !(exception instanceof AppException) &&
    JSON_SYNTAX_MESSAGE.test(exception.message);
  if (type === 'entity.parse.failed' || wrappedSyntaxError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      body: { success: false, message: 'Malformed JSON body', code: ErrorCode.BAD_REQUEST },
    };
  }
  if (type === 'entity.too.large') {
    return {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      body: { success: false, message: 'Request body too large', code: ErrorCode.BAD_REQUEST },
    };
  }
  return null;
}
