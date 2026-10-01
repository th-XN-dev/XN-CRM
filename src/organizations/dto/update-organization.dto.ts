import { PartialType } from '@nestjs/swagger';
import { CreateOrganizationDto } from './create-organization.dto';

/** Activation/deactivation and ownership transfer are deliberately not exposed here. */
export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}
