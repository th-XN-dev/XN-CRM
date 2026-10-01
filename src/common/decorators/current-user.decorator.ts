import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type AppRequest, type AuthUser } from '../types/request.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<AppRequest>().user;
    if (!user) {
      // Programming error: used on a @Public() route.
      throw new Error('@CurrentUser() used on a route without authentication');
    }
    return user;
  },
);
