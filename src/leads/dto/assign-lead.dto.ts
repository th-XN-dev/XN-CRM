import { IsUUID, ValidateIf } from 'class-validator';

export class AssignLeadDto {
  /** Member to assign the lead to. `null` clears the assignment. */
  @ValidateIf((o: AssignLeadDto) => o.assignedToId !== null)
  @IsUUID()
  assignedToId!: string | null;
}
