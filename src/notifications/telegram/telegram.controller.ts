import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { StrictThrottle } from '../../config/throttler.config';
import { ApiEnvelopeResponse, ApiErrorResponse } from '../../common/swagger/api-responses';
import { type AuthUser } from '../../common/types/request.types';
import { TelegramLinkService } from './telegram-link.service';

class TelegramLinkCodeDto {
  /** Send it to the bot as `/start <code>` within 15 minutes. */
  code!: string;
  expiresAt!: Date;
  /** https://t.me/<bot>?start=<code> when the bot username is configured. */
  deepLink!: string | null;
}

class TelegramAccountDto {
  id!: string;
  userId!: string;
  telegramUserId!: string;
  username!: string | null;
  chatId!: string;
  isVerified!: boolean;
  linkedAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

class TelegramWebhookResultDto {
  ok!: boolean;
  linked!: boolean;
  reason?: string;
}

/**
 * Telegram linking is per user (not per organization): one Telegram chat
 * receives the user's notifications from every organization they belong to.
 */
@ApiTags('Notifications · Telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramLinkService) {}

  @Post('link-code')
  @StrictThrottle()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a one-time code to link your Telegram account' })
  @ApiEnvelopeResponse(TelegramLinkCodeDto, HttpStatus.CREATED)
  linkCode(@CurrentUser() user: AuthUser) {
    return this.telegram.createLinkCode(user.id);
  }

  @Get('account')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Your linked Telegram account (null if none)' })
  @ApiEnvelopeResponse(TelegramAccountDto)
  account(@CurrentUser() user: AuthUser) {
    return this.telegram.account(user.id);
  }

  @Delete('account')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlink your Telegram account' })
  @ApiEnvelopeResponse(TelegramAccountDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'TELEGRAM_ACCOUNT_NOT_FOUND')
  unlink(@CurrentUser() user: AuthUser) {
    return this.telegram.unlink(user.id);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Telegram Bot API webhook (handles `/start <code>`)' })
  @ApiHeader({ name: 'X-Telegram-Bot-Api-Secret-Token', required: true })
  @ApiBody({ description: 'Telegram Update object', schema: { type: 'object' } })
  @ApiEnvelopeResponse(TelegramWebhookResultDto)
  @ApiErrorResponse(HttpStatus.FORBIDDEN, 'Invalid webhook secret')
  webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: unknown,
  ) {
    return this.telegram.handleWebhook(secret, update);
  }
}
