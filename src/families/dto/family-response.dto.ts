export class FamilyResponseDto {
  id!: string;
  organizationId!: string;
  primaryBranchId!: string | null;
  name!: string;
  phone!: string;
  secondaryPhone!: string | null;
  email!: string | null;
  address!: string | null;
  notes!: string | null;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class FamilyListItemDto extends FamilyResponseDto {
  /** Number of students in the family visible to the caller. */
  studentsCount!: number;
}

export class FamilyStudentSummaryDto {
  id!: string;
  firstName!: string;
  lastName!: string;
  middleName!: string | null;
  /** @example "ACTIVE" */
  status!: string;
  branchId!: string;
  birthDate!: Date | null;
}

export class FamilyDetailDto {
  family!: FamilyResponseDto;
  students!: FamilyStudentSummaryDto[];
}
