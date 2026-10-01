import { PartialType } from '@nestjs/swagger';
import { LeadProfileDto } from './create-lead.dto';

/**
 * Editable lead fields. Status, assignment and follow-up have their own
 * dedicated endpoints (each records an activity), so they are not here.
 */
export class UpdateLeadDto extends PartialType(LeadProfileDto) {}
