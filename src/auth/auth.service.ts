import { Injectable } from '@nestjs/common';
import { AccountEventName } from '../common/events/domain-events';
import { DomainEventPublisher } from '../common/events/domain-event.publisher';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { centerUnavailable } from '../platform/center-availability';
import { type PublicUser, UsersService } from '../users/users.service';
import { type ChangePasswordDto, type UpdateProfileDto } from './dto/account.dto';
import { type LoginDto } from './dto/login.dto';
import { type RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { type ClientInfo, TokenService, type TokenPair } from './token.service';

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly events: DomainEventPublisher,
  ) {}

  async register(dto: RegisterDto, client: ClientInfo): Promise<AuthResult> {
    const user = await this.users.create({
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      passwordHash: await this.passwords.hash(dto.password),
    });
    const tokens = await this.tokens.issue(user.id, client);
    this.events.publishAccount(AccountEventName.REGISTERED, user.id);
    return { user, tokens };
  }

  async login(dto: LoginDto, client: ClientInfo): Promise<AuthResult> {
    const found = await this.users.findForLogin(dto.login);
    // Always verify (against a dummy hash if needed) so response time doesn't reveal whether the user exists.
    const valid = await this.passwords.verify(found?.passwordHash, dto.password);
    if (!found || !valid) {
      throw AppException.unauthorized(ErrorCode.INVALID_CREDENTIALS, 'Invalid login or password');
    }

    const { passwordHash: _omit, ...user } = found;
    // Members whose every center is frozen/expired can't sign in (the platform owner always can).
    const blocked = (await this.users.authState(user.id))?.platformRole
      ? null
      : await this.users.blockedCenterReason(user.id);
    if (blocked) throw centerUnavailable(blocked);
    await this.users.touchLastLogin(user.id);
    const tokens = await this.tokens.issue(user.id, client);
    this.events.publishAccount(AccountEventName.LOGIN, user.id);
    return { user, tokens };
  }

  async refresh(refreshToken: string, client: ClientInfo): Promise<TokenPair> {
    const { userId, tokens } = await this.tokens.rotate(refreshToken, client);
    if (!(await this.users.isActive(userId))) {
      await this.tokens.revoke(tokens.refreshToken);
      throw AppException.unauthorized(
        ErrorCode.INVALID_REFRESH_TOKEN,
        'Invalid or expired refresh token',
      );
    }
    this.events.publishAccount(AccountEventName.TOKEN_REFRESHED, userId);
    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const userId = await this.tokens.revoke(refreshToken);
    if (userId) this.events.publishAccount(AccountEventName.LOGOUT, userId);
  }

  me(userId: string) {
    return this.users.getProfile(userId);
  }

  /**
   * Own name and login. A new email/phone is a new way to sign in, so it
   * needs the current password (a stolen access token alone can't take over).
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const changesLogin = dto.email !== undefined || dto.phone !== undefined;
    if (changesLogin) await this.verifyCurrentPassword(userId, dto.currentPassword);
    await this.users.updateProfile(userId, { name: dto.name, email: dto.email, phone: dto.phone });
    return this.users.getProfile(userId);
  }

  /**
   * Replaces the password (also the temporary one) and signs out every other
   * session; the current session stays signed in.
   */
  async changePassword(
    userId: string,
    sessionId: string | null,
    dto: ChangePasswordDto,
  ): Promise<void> {
    await this.verifyCurrentPassword(userId, dto.currentPassword);
    if (dto.newPassword === dto.currentPassword) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'The new password must differ from the current one',
      );
    }
    await this.users.setPassword(userId, await this.passwords.hash(dto.newPassword), false);
    await this.tokens.revokeAllExcept(userId, sessionId);
    this.events.publishAccount(AccountEventName.PASSWORD_CHANGED, userId);
  }

  async sessions(userId: string, sessionId: string | null) {
    const sessions = await this.tokens.sessions(userId);
    // One row per session (a family has one live token).
    const seen = new Set<string>();
    return sessions
      .filter((session) => !seen.has(session.id) && seen.add(session.id))
      .map((session) => ({ ...session, current: session.id === sessionId }));
  }

  async revokeSession(userId: string, id: string): Promise<void> {
    if (!(await this.tokens.revokeSession(userId, id))) {
      throw AppException.notFound(ErrorCode.SESSION_NOT_FOUND, 'Session not found');
    }
  }

  async revokeOtherSessions(userId: string, sessionId: string | null): Promise<void> {
    await this.tokens.revokeAllExcept(userId, sessionId);
  }

  private async verifyCurrentPassword(userId: string, password: string | undefined) {
    const user = await this.users.findWithPassword(userId);
    if (!user) throw AppException.unauthorized();
    if (!password || !(await this.passwords.verify(user.passwordHash, password))) {
      throw AppException.badRequest(
        ErrorCode.INVALID_CURRENT_PASSWORD,
        'The current password is incorrect',
      );
    }
  }
}
