import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppException } from '../../common/errors/app.exception';
import { type AuthUser } from '../../common/types/request.types';
import { type EnvironmentVariables } from '../../config/env.validation';
import { UsersService } from '../../users/users.service';
import { type AccessTokenPayload } from '../token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  /** Runs on every authenticated request: deactivated users lose access immediately. */
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const state = payload.typ === 'access' ? await this.users.authState(payload.sub) : null;
    if (!state) throw AppException.unauthorized();
    return {
      id: payload.sub,
      platformRole: state.platformRole,
      mustChangePassword: state.mustChangePassword,
      sessionId: payload.sid ?? null,
    };
  }
}
