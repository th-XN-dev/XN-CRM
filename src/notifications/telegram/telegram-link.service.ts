import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { type EnvironmentVariables } from '../../config/env.validation';
import { PrismaService } from '../../database/prisma.service';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const CODE_LENGTH = 8;
const CODE_TTL_MS = 15 * 60_000;
const START_COMMAND = /^\/start\s+([A-Za-z0-9]{6,32})\s*$/;

const ACCOUNT_SELECT = {
  id: true,
  userId: true,
  telegramUserId: true,
  username: true,
  chatId: true,
  isVerified: true,
  linkedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface TelegramUpdate {
  message?: {
    text?: string;
    from?: { id?: number | string; username?: string };
    chat?: { id?: number | string };
  };
}

export interface WebhookResult {
  ok: true;
  linked: boolean;
  reason?: string;
}

/**
 * Links a CRM user to a Telegram chat: the user asks for a one-time code, sends
 * `/start <code>` to the bot, and the bot's webhook proves who they are on
 * Telegram. Only a hash of the code is stored; codes expire and work once.
 */
@Injectable()
export class TelegramLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async createLinkCode(userId: string) {
    const code = Array.from(
      { length: CODE_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
    ).join('');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await this.prisma.$transaction([
      // A new code replaces any unused one.
      this.prisma.telegramLinkToken.deleteMany({ where: { userId, usedAt: null } }),
      this.prisma.telegramLinkToken.create({ data: { userId, codeHash: hash(code), expiresAt } }),
    ]);
    const bot = this.config.get('TELEGRAM_BOT_USERNAME', { infer: true });
    return {
      code,
      expiresAt,
      deepLink: bot ? `https://t.me/${bot}?start=${code}` : null,
    };
  }

  account(userId: string) {
    return this.prisma.userTelegramAccount.findUnique({
      where: { userId },
      select: ACCOUNT_SELECT,
    });
  }

  async unlink(userId: string) {
    const account = await this.account(userId);
    if (!account) {
      throw AppException.notFound(
        ErrorCode.TELEGRAM_ACCOUNT_NOT_FOUND,
        'No Telegram account is linked',
      );
    }
    await this.prisma.userTelegramAccount.delete({ where: { userId } });
    return account;
  }

  /** Telegram webhook: authenticated by the secret token header, never by the payload. */
  async handleWebhook(secretHeader: string | undefined, update: unknown): Promise<WebhookResult> {
    this.assertWebhookSecret(secretHeader);
    const message = (update as TelegramUpdate | null)?.message;
    const match = message?.text?.match(START_COMMAND);
    const telegramUserId = message?.from?.id;
    const chatId = message?.chat?.id;
    if (!match || telegramUserId === undefined || chatId === undefined) {
      return { ok: true, linked: false, reason: 'not a link command' };
    }
    try {
      await this.confirm(match[1].toUpperCase(), {
        telegramUserId: String(telegramUserId),
        chatId: String(chatId),
        username: message?.from?.username ?? null,
      });
      return { ok: true, linked: true };
    } catch (error) {
      // Telegram must always get 200, or it keeps redelivering the update.
      if (error instanceof AppException) return { ok: true, linked: false, reason: error.code };
      throw error;
    }
  }

  async confirm(
    code: string,
    telegram: { telegramUserId: string; chatId: string; username: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.telegramLinkToken.findUnique({ where: { codeHash: hash(code) } });
      if (!token || token.usedAt || token.expiresAt < new Date()) {
        throw AppException.badRequest(
          ErrorCode.TELEGRAM_LINK_CODE_INVALID,
          'Link code is invalid or expired',
        );
      }
      // Consume first: a concurrent second use updates zero rows.
      const consumed = await tx.telegramLinkToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 0) {
        throw AppException.badRequest(
          ErrorCode.TELEGRAM_LINK_CODE_INVALID,
          'Link code is invalid or expired',
        );
      }
      const owner = await tx.userTelegramAccount.findUnique({
        where: { telegramUserId: telegram.telegramUserId },
        select: { userId: true },
      });
      if (owner && owner.userId !== token.userId) {
        throw AppException.conflict(
          ErrorCode.TELEGRAM_ACCOUNT_TAKEN,
          'This Telegram account is linked to another user',
        );
      }
      const data = { ...telegram, isVerified: true, linkedAt: new Date() };
      return tx.userTelegramAccount.upsert({
        where: { userId: token.userId },
        create: { userId: token.userId, ...data },
        update: data,
        select: ACCOUNT_SELECT,
      });
    });
  }

  private assertWebhookSecret(header: string | undefined): void {
    const secret = this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true });
    if (!secret) {
      throw AppException.notFound(ErrorCode.TELEGRAM_NOT_CONFIGURED, 'Telegram is not configured');
    }
    const expected = Buffer.from(secret);
    const given = Buffer.from(header ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw AppException.forbidden(ErrorCode.FORBIDDEN, 'Invalid webhook secret');
    }
  }
}

const hash = (code: string): string => createHash('sha256').update(code).digest('hex');
