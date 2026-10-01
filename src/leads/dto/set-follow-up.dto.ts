import { IsISO8601, ValidateIf } from 'class-validator';

export class SetFollowUpDto {
  /**
   * Next follow-up date/time (ISO 8601). `null` clears it.
   * @example "2026-10-05T09:00:00.000Z"
   */
  @ValidateIf((o: SetFollowUpDto) => o.nextFollowUpAt !== null)
  @IsISO8601({ strict: true })
  nextFollowUpAt!: string | null;
}
