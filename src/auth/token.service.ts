import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { durationToMs } from '../common/utils/duration';
import { type EnvironmentVariables } from '../config/env.validation';
import { PrismaService } from '../database/prisma.service';

export interface AccessTokenPayload {
  sub: string;
  typ: 'access';
  /** Session (refresh-token family) id; absent in tokens issued before it existed. */
  sid?: string;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

export interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/**
 * Access tokens: short-lived stateless JWTs.
 * Refresh tokens: JWTs whose SHA-256 is stored in `refresh_tokens`, rotated on every use.
 * Presenting an already-rotated token revokes the whole token family (theft detection).
 */
@Injectable()
export class TokenService {
  private readonly accessTtlMs: number;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.accessTtlMs = durationToMs(config.get('JWT_ACCESS_EXPIRES_IN', { infer: true }));
    this.refreshTtlMs = durationToMs(config.get('JWT_REFRESH_EXPIRES_IN', { infer: true }));
  }

  /** Starts a new session (token family). */
  issue(userId: string, client: ClientInfo): Promise<TokenPair> {
    return this.createPair(userId, randomUUID(), client);
  }

  async rotate(
    refreshToken: string,
    client: ClientInfo,
  ): Promise<{ userId: string; tokens: TokenPair }> {
    const payload = await this.verifyRefresh(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });

    if (!stored || stored.userId !== payload.sub || stored.tokenHash !== sha256(refreshToken)) {
      throw invalidRefreshToken();
    }
    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw AppException.unauthorized(
        ErrorCode.REFRESH_TOKEN_REUSED,
        'Refresh token has already been used',
      );
    }
    if (stored.expiresAt <= new Date()) throw invalidRefreshToken();

    // Compare-and-swap: only one concurrent request can consume a given token.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeFamily(stored.familyId);
      throw AppException.unauthorized(
        ErrorCode.REFRESH_TOKEN_REUSED,
        'Refresh token has already been used',
      );
    }

    const tokens = await this.createPair(stored.userId, stored.familyId, client, stored.id);
    return { userId: stored.userId, tokens };
  }

  /** Ends the session the token belongs to. Silent on invalid tokens (idempotent logout). */
  /** Revokes the token's session; returns its user when a live session was found. */
  async revoke(refreshToken: string): Promise<string | null> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.refreshSecret,
        ignoreExpiration: true,
      });
    } catch {
      return null;
    }
    const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });
    if (stored && stored.tokenHash === sha256(refreshToken)) {
      await this.revokeFamily(stored.familyId);
      return stored.userId;
    }
    return null;
  }

  private async createPair(
    userId: string,
    familyId: string,
    client: ClientInfo,
    replacesId?: string,
  ): Promise<TokenPair> {
    const tokenId = randomUUID();
    const accessPayload: AccessTokenPayload = { sub: userId, typ: 'access', sid: familyId };
    const refreshPayload: RefreshTokenPayload = { sub: userId, jti: tokenId, typ: 'refresh' };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.accessSecret,
        expiresIn: Math.floor(this.accessTtlMs / 1000),
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: Math.floor(this.refreshTtlMs / 1000),
      }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.create({
        data: {
          id: tokenId,
          userId,
          familyId,
          tokenHash: sha256(refreshToken),
          expiresAt: new Date(Date.now() + this.refreshTtlMs),
          userAgent: client.userAgent?.slice(0, 512),
          ipAddress: client.ipAddress?.slice(0, 64),
        },
      });
      if (replacesId) {
        await tx.refreshToken.update({
          where: { id: replacesId },
          data: { replacedById: tokenId },
        });
      }
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: Math.floor(this.accessTtlMs / 1000),
    };
  }

  private async verifyRefresh(token: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.refreshSecret,
      });
      if (payload.typ !== 'refresh' || !payload.jti) throw new Error('wrong token type');
      return payload;
    } catch {
      throw invalidRefreshToken();
    }
  }

  /** Live sessions of a user (one per token family), newest activity first. */
  async sessions(userId: string) {
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { familyId: true, userAgent: true, ipAddress: true, createdAt: true },
    });
    return rows.map((row) => ({
      id: row.familyId,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      lastActiveAt: row.createdAt,
    }));
  }

  /** Ends one session of the user; false when it is not theirs or already over. */
  async revokeSession(userId: string, familyId: string): Promise<boolean> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { userId, familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count > 0;
  }

  /** Signs the user out everywhere except `keepFamilyId` (e.g. after a password change). */
  async revokeAllExcept(userId: string, keepFamilyId: string | null): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepFamilyId && { familyId: { not: keepFamilyId } }),
      },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private get accessSecret(): string {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  private get refreshSecret(): string {
    return this.config.get('JWT_REFRESH_SECRET', { infer: true });
  }
}

function invalidRefreshToken(): AppException {
  return AppException.unauthorized(
    ErrorCode.INVALID_REFRESH_TOKEN,
    'Invalid or expired refresh token',
  );
}
