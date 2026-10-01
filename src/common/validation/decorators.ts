import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsISO8601, IsNumber, Matches, Max, Min } from 'class-validator';
import { normalizePhone, PHONE_REGEX } from '../utils/normalize';
import { TIME_REGEX } from '../utils/times';

/** Calendar date "YYYY-MM-DD". */
export const IsDateOnly = (): PropertyDecorator =>
  applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '$property must be a date in YYYY-MM-DD format' }),
    IsISO8601({ strict: true }),
  );

/** Non-negative money amount with at most 2 decimals. Stored as DECIMAL(14,2). */
export const IsMoney = (): PropertyDecorator =>
  applyDecorators(
    IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }),
    Min(0),
    Max(999_999_999_999),
  );

/** International phone; spaces, dashes and parentheses are stripped first. */
export const IsPhone = (): PropertyDecorator =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizePhone(value) : value,
    ),
    Matches(PHONE_REGEX, {
      message: '$property must be in international format, e.g. +998901234567',
    }),
  );

/** Wall-clock time "HH:MM" (24h). */
export const IsTimeOfDay = (): PropertyDecorator =>
  Matches(TIME_REGEX, { message: '$property must be a time in HH:MM (24h) format' });

/** Strictly positive money amount (≥ 0.01) with at most 2 decimals. */
export const IsPositiveMoney = (): PropertyDecorator =>
  applyDecorators(
    IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }),
    Min(0.01),
    Max(999_999_999_999),
  );
