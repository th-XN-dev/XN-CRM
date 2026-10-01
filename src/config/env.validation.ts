import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const DURATION = /^\d+(ms|s|m|h|d)$/;

/** Typed, validated environment. The app refuses to boot if this fails. */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  /** Comma-separated origins. */
  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN!: string;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL: string = 'info';

  @IsString()
  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL must be a PostgreSQL connection string',
  })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @Matches(DURATION)
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @Matches(DURATION)
  JWT_REFRESH_EXPIRES_IN: string = '30d';

  @IsInt()
  @Min(1000)
  THROTTLE_TTL_MS: number = 60_000;

  @IsInt()
  @Min(1)
  THROTTLE_LIMIT: number = 120;

  @IsInt()
  @Min(1)
  AUTH_THROTTLE_LIMIT: number = 10;

  /**
   * Express "trust proxy": hop count ("1"), "true", a preset ("loopback") or subnets.
   * Set it when running behind a reverse proxy so client IPs are real.
   */
  @IsOptional()
  @IsString()
  TRUST_PROXY?: string;

  /** Hard limit for a graceful shutdown before the process is forced to exit. */
  @IsInt()
  @Min(1000)
  SHUTDOWN_TIMEOUT_MS: number = 15_000;

  // ─── Management hierarchy ────────────────────────────────────────────────

  /**
   * Who may create centers through `POST /organizations`: anyone signed in
   * ("open", self-service) or nobody ("owner" — only the platform owner, via
   * `/owner/centers`).
   */
  @IsIn(['open', 'owner'])
  CENTER_CREATION: string = 'open';

  /**
   * The address members open, e.g. "https://{slug}.xn-crm.uz". Only shown to
   * the owner; DNS, wildcard certificates and hosting are managed outside the app.
   */
  @IsOptional()
  @Matches(/^https?:\/\/\S*\{slug\}/, {
    message: 'CENTER_URL_TEMPLATE must be an http(s) URL containing {slug}',
  })
  CENTER_URL_TEMPLATE?: string;

  /** How often centers past their activation period are frozen; 0 disables the sweep. */
  @IsInt()
  @Min(0)
  CENTER_EXPIRY_SCAN_INTERVAL_MS: number = 3_600_000;

  /** How often today's checklist items are created; 0 disables (they are still made on first open). */
  @IsInt()
  @Min(0)
  CHECKLIST_SCAN_INTERVAL_MS: number = 900_000;

  // ─── Notifications ───────────────────────────────────────────────────────

  /** Enables the BullMQ queue; without it deliveries run on an in-process queue. */
  @IsOptional()
  @Matches(/^rediss?:\/\//, { message: 'REDIS_URL must be a redis:// URL' })
  REDIS_URL?: string;

  /** Total tries per delivery (1 = no retry). */
  @IsInt()
  @Min(1)
  @Max(10)
  NOTIFICATION_MAX_ATTEMPTS: number = 3;

  /** Base retry delay; grows exponentially per attempt. */
  @IsInt()
  @Min(0)
  NOTIFICATION_RETRY_DELAY_MS: number = 5_000;

  /** How often due/overdue reminders are scanned; 0 disables the scanner. */
  @IsInt()
  @Min(0)
  NOTIFICATION_SCAN_INTERVAL_MS: number = 60_000;

  @IsInt()
  @Min(1)
  NOTIFICATION_TASK_DUE_HOURS: number = 24;

  @IsInt()
  @Min(0)
  NOTIFICATION_PAYMENT_DUE_DAYS: number = 3;

  /** Overdue reminders only for items that became overdue within this many days. */
  @IsInt()
  @Min(1)
  NOTIFICATION_OVERDUE_LOOKBACK_DAYS: number = 7;

  @IsIn(['none', 'mock'])
  NOTIFICATION_EMAIL_PROVIDER: string = 'none';

  @IsIn(['none', 'mock'])
  NOTIFICATION_SMS_PROVIDER: string = 'none';

  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  /** Bot username (without @) for deep links: https://t.me/<username>?start=<code>. */
  @IsOptional()
  @IsString()
  TELEGRAM_BOT_USERNAME?: string;

  /** Must match the `X-Telegram-Bot-Api-Secret-Token` header of webhook calls. */
  @IsOptional()
  @IsString()
  @MinLength(16)
  TELEGRAM_WEBHOOK_SECRET?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  if (validated.JWT_ACCESS_SECRET === validated.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (validated.NODE_ENV === NodeEnv.Production) assertProductionReady(validated);
  return validated;
}

/** Settings that are tolerable in development but never in production. */
function assertProductionReady(env: EnvironmentVariables): void {
  const problems: string[] = [];
  if (!env.REDIS_URL) problems.push('REDIS_URL is required (notification queue)');
  const origins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  if (origins.includes('*')) problems.push('CORS_ORIGIN must list explicit origins, not "*"');
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (/change-me/i.test(env[key])) problems.push(`${key} still has the example value`);
  }
  if (problems.length > 0) {
    throw new Error(`Refusing to start in production:\n  - ${problems.join('\n  - ')}`);
  }
}
