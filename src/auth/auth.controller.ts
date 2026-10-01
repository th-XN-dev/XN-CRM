import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { type Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { type AuthUser } from '../common/types/request.types';
import { StrictThrottle } from '../config/throttler.config';
import { ApiEnvelopeArrayResponse } from '../common/swagger/api-responses';
import { SkipAudit } from '../audit/audit.interceptor';
import { AuthService } from './auth.service';
import { ChangePasswordDto, SessionDto, UpdateProfileDto } from './dto/account.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { type ClientInfo } from './token.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @StrictThrottle()
  @Post('register')
  @ApiOperation({ summary: 'Create an account (email or phone) and start a session' })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, clientInfo(req));
  }

  @Public()
  @StrictThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email/phone and password' })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, clientInfo(req));
  }

  @Public()
  @StrictThrottle()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair (rotation)' })
  @ApiUnauthorizedResponse({ description: 'INVALID_REFRESH_TOKEN | REFRESH_TOKEN_REUSED' })
  refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, clientInfo(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the session of the given refresh token' })
  async logout(@Body() dto: RefreshTokenDto): Promise<null> {
    await this.auth.logout(dto.refreshToken);
    return null;
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user with the organizations they belong to' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own name and login (email/phone needs currentPassword)' })
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @Post('change-password')
  @StrictThrottle()
  @SkipAudit() // audited as PASSWORD_CHANGED (account event), never with the body
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change own password (also the temporary one); other sessions are signed out',
  })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<null> {
    await this.auth.changePassword(user.id, user.sessionId, dto);
    return null;
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Own signed-in devices' })
  @ApiEnvelopeArrayResponse(SessionDto)
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.sessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out one of own sessions' })
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<null> {
    await this.auth.revokeSession(user.id, id);
    return null;
  }

  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out every other session' })
  async revokeOthers(@CurrentUser() user: AuthUser): Promise<null> {
    await this.auth.revokeOtherSessions(user.id, user.sessionId);
    return null;
  }
}

function clientInfo(req: Request): ClientInfo {
  return { userAgent: req.get('user-agent'), ipAddress: req.ip };
}
