import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsISO4217CurrencyCode,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizePhone, PHONE_REGEX } from '../../common/utils/normalize';
import { SLUG_REGEX } from '../../common/utils/slug';
import { toLowerTrimmed, toUpperTrimmed, trimString } from '../../common/utils/transforms';

const HEX_COLOR = /^#[0-9A-F]{6}$/;
export const SUPPORTED_LANGUAGES = ['uz', 'ru', 'en'] as const;

export class CreateOrganizationDto {
  /** @example "Jony Math Academy" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  /** URL-friendly unique id. Generated from `name` when omitted. @example "jony-math-academy" */
  @IsOptional()
  @Transform(toLowerTrimmed)
  @MinLength(3)
  @MaxLength(80)
  @Matches(SLUG_REGEX, { message: 'slug may contain lowercase letters, digits and single dashes' })
  slug?: string;

  /** Public URL of the uploaded logo (file upload comes in a later phase). */
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  logoUrl?: string;

  /** @example "+998901234567" */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizePhone(value) : value,
  )
  @Matches(PHONE_REGEX, { message: 'phone must be in international format, e.g. +998901234567' })
  phone?: string;

  @IsOptional()
  @Transform(toLowerTrimmed)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  address?: string;

  /** IANA timezone. @default "Asia/Tashkent" */
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  /** ISO 4217. @default "UZS" */
  @IsOptional()
  @Transform(toUpperTrimmed)
  @IsISO4217CurrencyCode()
  currency?: string;

  /** Public URL of a small square icon for the browser tab. */
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(2048)
  faviconUrl?: string;

  /** Brand color "#RRGGBB"; the UI derives its accent palette from it. @default "#4F46E5" */
  @IsOptional()
  @Transform(toUpperTrimmed)
  @Matches(HEX_COLOR, { message: 'primaryColor must be a hex color like #4F46E5' })
  primaryColor?: string;

  /** Optional second accent "#RRGGBB". */
  @IsOptional()
  @Transform(toUpperTrimmed)
  @Matches(HEX_COLOR, { message: 'secondaryColor must be a hex color like #0EA5E9' })
  secondaryColor?: string;

  /** Default UI language. @default "uz" */
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  language?: (typeof SUPPORTED_LANGUAGES)[number];
}
