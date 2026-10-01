import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

export interface SuccessResponseBody<T> {
  success: true;
  data: T;
}

/**
 * Wraps every successful response as `{ success: true, data }`.
 * Paginated lists (`Paginated`) end up as `{ success: true, data: { items, meta } }`.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, SuccessResponseBody<T | null>> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponseBody<T | null>> {
    return next.handle().pipe(map((result) => ({ success: true, data: result ?? null })));
  }
}
