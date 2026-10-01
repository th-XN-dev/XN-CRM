import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/utils/transforms';

export class LoginDto {
  /** Email or phone. @example "owner@jony.uz" */
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  login!: string;

  /** @example "S3cure!Passw0rd" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
