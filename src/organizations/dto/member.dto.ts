import { IsOptional, IsUUID } from 'class-validator';

export class ListMembersQueryDto {
  /** Only members who can work in this branch (all-branch members included). */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/** An active member, for "assign to…" pickers. */
export class MemberDto {
  userId!: string;
  name!: string;
  /** System role key, e.g. MANAGER. */
  role!: string;
  allBranches!: boolean;
  branchIds!: string[];
}
